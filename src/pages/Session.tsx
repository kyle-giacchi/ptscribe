import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  LockOpen,
  Receipt,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { MicStatusPill, PtButton, SegmentedControl, type MicState } from '@/components/design';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAppData } from '@/contexts/AppDataProvider';
import { useRecorder } from '@/hooks/useRecorder';
import { useLiveTranscript } from '@/hooks/useLiveTranscript';
import { audioRepository } from '@/services/AudioRepository';
import { transcribe } from '@/services/ai/transcribe';
import { transcribeLocally, LOCAL_WHISPER_DEFAULT_MODEL } from '@/services/ai/client/localWhisper';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { mergeAudioBlobs } from '@/lib/audio/merge';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { generateNote } from '@/services/ai/generate';
import { renderNoteMarkdown } from '@/lib/clinical/noteFormat';
import { formatCostRange } from '@/lib/clinical/cost';
import { newId } from '@/utils/ids';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import type { ClipStatus, Note, NoteFormat, NoteSection, Session, SessionClip } from '@/types';
import {
  useActionGuard,
  MAX_TRANSCRIBES_PER_SESSION,
  MAX_GENERATES_PER_SESSION,
} from '@/hooks/useActionGuard';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useAutoRotateClip } from '@/hooks/useAutoRotateClip';
import { mergeClipTranscripts, getTranscribableClips } from '@/utils/clips';
import { RecordingPanel } from '@/components/sessions/RecordingPanel';
import { TranscriptPanel } from '@/components/sessions/TranscriptPanel';
import { NotePanel } from '@/components/sessions/NotePanel';

type Busy = null | 'transcribing' | 'generating';

export function SessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <SessionRoute key={id} sessionId={id} />;
}

function SessionRoute({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const { getSession, removeSession } = useSessions();
  const { getPatient } = usePatients();
  const { forSession, addNote, updateNote, finalizeNote, unfinalizeNote, removeNote } = useNotes();
  const { templates, getTemplate } = useTemplates();
  const { settings } = useSettings();
  const { updateSessionsSlice } = useAppData();

  const session = getSession(sessionId);
  const patient = session ? getPatient(session.patientId) : undefined;
  const note = session ? forSession(session.id) : undefined;
  const template = getTemplate(session?.templateId ?? '') ?? templates[0];

  const recorder = useRecorder({ limits: settings.recordingLimits });
  const live = useLiveTranscript();

  const [backgroundWarningDismissed, setBackgroundWarningDismissed] = useState(false);
  // Re-arm the dismiss flag every time a new recording starts so the warning
  // resurfaces for the next session if it gets backgrounded again.
  useEffect(() => {
    if (recorder.status !== 'recording') return;
    const id = window.setTimeout(() => setBackgroundWarningDismissed(false), 0);
    return () => window.clearTimeout(id);
  }, [recorder.status]);

  // Initial transcript captured ONCE per session (component is keyed on sessionId).
  const [transcript, setTranscript] = useState(session?.transcript ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingSkipped, setRecordingSkipped] = useState(false);
  const [pendingDeleteSession, setPendingDeleteSession] = useState(false);
  const [mergedAudioBlob, setMergedAudioBlob] = useState<Blob | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  // Tracks the clip currently being recorded, so stop() knows which clip to update.
  const activeClipIdRef = useRef<string | null>(null);

  const { checkActionGuard, recordAction, transcribeUsed, generateUsed } = useActionGuard();

  const [activeTab, setActiveTab] = useState<'record' | 'review'>('record');
  // Once dismissed per session, the re-record warning does not resurface.
  const [recordWarnDismissed, setRecordWarnDismissed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [silenceDebugOn, setSilenceDebugOn] = useState(false);
  const [speedDebugOn, setSpeedDebugOn] = useState(false);
  const [debugStats, setDebugStats] = useState<{
    droppedSec: number;
    originalSec: number;
    speedSavedSec: number;
    speedOriginalSec: number;
  } | null>(null);

  // ── Atomic session/clip patches via functional slice update ──────────────
  function patchSession(patch: Partial<Session>) {
    updateSessionsSlice((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...patch, updatedAt: Date.now() } : s)),
    );
  }
  function patchClips(mapper: (clips: SessionClip[]) => SessionClip[]) {
    updateSessionsSlice((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, clips: mapper(s.clips), updatedAt: Date.now() } : s,
      ),
    );
  }
  function patchClip(clipId: string, patch: Partial<SessionClip>) {
    patchClips((clips) =>
      clips.map((c) => (c.id === clipId ? { ...c, ...patch, updatedAt: Date.now() } : c)),
    );
  }

  useAudioRecovery(sessionId, session, patchClips);

  const sortedClips = session ? [...session.clips].sort((a, b) => a.createdAt - b.createdAt) : [];

  useAutoRotateClip(
    recorder.status,
    recorder.durationSec,
    handleStopRecording,
    handleStartRecording,
  );

  // ── "Stop & finish" chain state ─────────────────────────────────────────
  // Sequences stop → wait-for-clip → cloud transcribe → generate → switch to Review.
  // Each phase is driven by an effect so we can react to recorder/clip state changes
  // rather than racing against React's batched state updates.
  type ChainPhase = 'stopping' | 'waiting' | 'transcribing' | 'post-transcribe' | 'generating' | null;
  const [chainPhase, setChainPhase] = useState<ChainPhase>(null);
  // Read inside handleStopRecording to skip the local-whisper background pass
  // while the chain is active (we go straight to cloud Nova for speed).
  const chainActiveRef = useRef(false);

  // ── ?autoRecord=1 deep link auto-start ──────────────────────────────────
  // Lets Dashboard / NewSession links jump straight into recording with one tap.
  // Guards: only fires once per mount, only when recorder is idle and no clips
  // exist yet (so refreshing a populated session never re-records).
  const [searchParams, setSearchParams] = useSearchParams();
  const autoRecordRequested = searchParams.get('autoRecord') === '1';
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoRecordRequested) return;
    if (autoStartedRef.current) return;
    if (!session || !patient) return;
    if (recorder.status !== 'idle') return;
    if (session.clips.length > 0) return;
    autoStartedRef.current = true;
    // Strip the param so a refresh doesn't re-trigger.
    const next = new URLSearchParams(searchParams);
    next.delete('autoRecord');
    setSearchParams(next, { replace: true });
    void handleStartRecording();
    // handleStartRecording intentionally omitted — it's a function declaration
    // that closes over fresh state each render and we only want this effect to
    // fire on the gating conditions, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRecordRequested, recorder.status, session, patient, searchParams, setSearchParams]);

  // ── Chain state machine ────────────────────────────────────────────────
  // Each phase advances when its preconditions (recorder state, clip state,
  // transcript text) are satisfied. The setChainPhase calls below are the
  // explicit transition step of a state machine, not cascading renders — the
  // react-hooks/set-state-in-effect lint is suppressed accordingly.

  // Phase: stopping → waiting (recorder fully released)
  useEffect(() => {
    if (chainPhase !== 'stopping') return;
    if (recorder.status === 'recording' || recorder.status === 'paused') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChainPhase('waiting');
  }, [chainPhase, recorder.status]);

  // Phase: waiting → transcribing (clips have settled out of 'pending')
  useEffect(() => {
    if (chainPhase !== 'waiting') return;
    if (!session) return;
    const settled = session.clips.every((c) => c.status !== 'pending');
    if (!settled) return;
    const eligible = session.clips.filter((c) => c.status === 'ready' || c.status === 'failed');
    if (eligible.length === 0) {
      // Nothing to transcribe — bail to Review and let the user act.
      chainActiveRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChainPhase(null);
      setActiveTab('review');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChainPhase('transcribing');
    void (async () => {
      await handleCreateTranscript();
      setChainPhase('post-transcribe');
    })();
  }, [chainPhase, session]);

  // Phase: post-transcribe → generating (or end if generation isn't viable)
  useEffect(() => {
    if (chainPhase !== 'post-transcribe') return;
    const generationReady = settings.ai.generation.provider === 'anthropic' && !!template;
    if (!transcript.trim() || !generationReady) {
      chainActiveRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChainPhase(null);
      setActiveTab('review');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChainPhase('generating');
    void (async () => {
      await handleGenerate();
      chainActiveRef.current = false;
      setChainPhase(null);
      setActiveTab('review');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainPhase, transcript, settings.ai.generation.provider, template]);

  if (!session || !patient) return <NotFound />;

  function handleStopAndFinish() {
    chainActiveRef.current = true;
    setChainPhase('stopping');
    void handleStopRecording();
  }

  function ensureNote(initialSections?: NoteSection[]): Note {
    if (note) return note;
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const sections =
      initialSections ??
      template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
      [];
    const created: Note = {
      id: newId(),
      sessionId: session!.id,
      patientId: patient!.id,
      format: (template?.format ?? 'custom') as NoteFormat,
      templateId: template?.id,
      sections,
      finalized: false,
      createdAt: now,
      updatedAt: now,
    };
    addNote(created);
    patchSession({ noteId: created.id });
    return created;
  }

  // ── Recording controls ───────────────────────────────────────────────────
  async function handleStartRecording() {
    setError(null);
    if (!session) return;

    const clipId = newId();
    const now = Date.now();
    activeClipIdRef.current = clipId;
    patchClips((clips) => [
      ...clips,
      {
        id: clipId,
        index: clips.length,
        durationSec: 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    patchSession({ status: 'recording' });

    const ok = await recorder.start(clipId);
    if (!ok) {
      activeClipIdRef.current = null;
      patchClips((clips) => clips.filter((c) => c.id !== clipId));
      patchSession({ status: 'draft' });
      return;
    }

    if (live.supported) {
      live.reset();
      live.start();
    }
  }

  function handlePauseResume() {
    if (recorder.status === 'recording') {
      recorder.pause();
      live.stop();
    } else if (recorder.status === 'paused') {
      recorder.resume();
      if (live.supported) live.start();
    }
  }

  async function handleStopRecording() {
    if (!session) return;
    const clipId = activeClipIdRef.current;
    activeClipIdRef.current = null;

    const finalBlob = await recorder.stop();
    const durationSec = recorder.durationSec;
    live.stop();

    if (clipId) {
      if (finalBlob) {
        try {
          await audioRepository.save(clipId, finalBlob);
          await audioRepository.clearChunks(clipId);
          patchClip(clipId, {
            status: 'ready',
            durationSec,
          });
          // Skip the local-whisper background pass while the Stop & finish chain
          // is running — the chain heads straight to cloud Nova for speed and
          // letting local race in just shifts the clip into 'transcribing' state.
          if (!chainActiveRef.current) {
            runLocalTranscription(clipId, finalBlob);
          }
        } catch (e) {
          setError(`Could not save audio: ${(e as Error).message}`);
          patchClip(clipId, {
            status: 'failed',
            errorMessage: (e as Error).message,
          });
        }
      } else {
        try {
          await audioRepository.remove(clipId);
        } catch {
          /* ignore */
        }
        patchClips((clips) =>
          clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })),
        );
      }
    }

    if (clipId && live.finalText.trim()) {
      patchClip(clipId, { liveTranscript: live.finalText.trim() });
    }
    live.reset();
    patchSession({ status: 'draft' });
  }

  // ── Audio upload ─────────────────────────────────────────────────────────
  async function handleUploadAudio(file: File) {
    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error('File too large — Whisper accepts up to 25 MB.');
      return;
    }
    if (file.type && !/^(audio|video)\//.test(file.type)) {
      toast.error('Please upload an audio file (MP3, M4A, WAV, OGG, WebM, etc.).');
      return;
    }

    const clipId = newId();
    const now = Date.now();
    patchClips((clips) => [
      ...clips,
      {
        id: clipId,
        index: clips.length,
        durationSec: 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const tid = toast.loading('Uploading file…', { duration: Infinity });
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/mpeg' });

      let durationSec = 0;
      try {
        const url = URL.createObjectURL(blob);
        durationSec = await new Promise<number>((resolve) => {
          const audio = new Audio();
          audio.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(isFinite(audio.duration) ? audio.duration : 0);
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(0);
          };
          audio.src = url;
        });
      } catch {
        /* duration stays 0 */
      }

      await audioRepository.save(clipId, blob);
      patchClip(clipId, { status: 'ready', durationSec });

      toast.success(`Added "${file.name}"`, { id: tid });
      runLocalTranscription(clipId, blob);
    } catch (e) {
      patchClips((clips) =>
        clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })),
      );
      toast.error(`Upload failed: ${(e as Error).message}`, { id: tid });
    }
  }

  // ── Local auto-transcription (always runs in background after any clip is saved) ──
  async function runLocalTranscription(clipId: string, blob: Blob): Promise<void> {
    patchClip(clipId, { status: 'transcribing', updatedAt: Date.now() });
    try {
      const result = await transcribeLocally(blob, LOCAL_WHISPER_DEFAULT_MODEL);
      const text = result.text.trim();
      if (text) {
        patchClip(clipId, {
          status: 'transcribed',
          transcript: text,
          localTranscript: text,
          transcriptedAt: Date.now(),
          errorMessage: undefined,
        });
        const otherMerged = mergeClipTranscripts(
          (session?.clips ?? []).filter((c) => c.id !== clipId),
        );
        const merged = [otherMerged, text].filter(Boolean).join('\n\n');
        setTranscript(merged);
        patchSession({ transcript: merged, transcriptSource: 'whisper' });
      } else {
        patchClip(clipId, { status: 'ready', updatedAt: Date.now() });
      }
    } catch {
      patchClip(clipId, { status: 'ready', updatedAt: Date.now() });
    }
  }

  // ── Transcription ────────────────────────────────────────────────────────
  async function transcribeClipBlob(
    clip: SessionClip,
    onProgress?: (msg: string) => void,
    useNova?: boolean,
  ): Promise<
    | {
        ok: true;
        text: string;
        trimReport?: { droppedSec: number; originalSec: number };
        speedReport?: { savedSec: number; originalSec: number };
      }
    | { ok: false; error: string }
  > {
    try {
      const original = await audioRepository.load(clip.id);
      if (!original) return { ok: false, error: 'No audio found for this clip.' };

      let blobToSend: Blob = original;
      let trimReport: { droppedSec: number; originalSec: number } | undefined;
      let speedReport: { savedSec: number; originalSec: number } | undefined;

      const sd = settings.audio.silenceDetection;
      if (sd.enabled) {
        try {
          const trimResult = await trimSilence(original, {
            sensitivity: sd.sensitivity,
            padMs: sd.padMs,
          });
          blobToSend = trimResult.trimmed;
          trimReport = {
            droppedSec: trimResult.report.droppedSec,
            originalSec: trimResult.report.originalSec,
          };
        } catch {
          // Trim failure must never block transcription — fall back to original.
          blobToSend = original;
        }
      }

      const su = settings.audio.speedUp;
      if (su.enabled) {
        try {
          const speedResult = await speedUpAudio(blobToSend, su.speed as SpeedFactor);
          blobToSend = speedResult.result;
          speedReport = {
            savedSec: speedResult.report.savedSec,
            originalSec: speedResult.report.originalSec,
          };
        } catch {
          // Speed-up failure must never block transcription — fall back as-is.
        }
      }

      const result = await transcribe({
        blob: blobToSend,
        provider: useNova ? 'cloudflare' : settings.ai.transcription.provider,
        model: useNova ? '@cf/deepgram/nova-3' : settings.ai.transcription.model,
        onProgress,
      });
      return { ok: true, text: result.text, trimReport, speedReport };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async function runTranscribeLoop(
    pending: SessionClip[],
    transcribed: SessionClip[],
    useNova?: boolean,
  ): Promise<{
    textByClip: Map<string, string>;
    successes: number;
    failures: number;
    totalDroppedSec: number;
    totalOriginalSec: number;
    totalSpeedSavedSec: number;
    totalSpeedOriginalSec: number;
  }> {
    const textByClip = new Map<string, string>();
    for (const c of transcribed) {
      if (c.transcript) textByClip.set(c.id, c.transcript);
    }
    let successes = 0;
    let failures = 0;
    let totalDroppedSec = 0;
    let totalOriginalSec = 0;
    let totalSpeedSavedSec = 0;
    let totalSpeedOriginalSec = 0;
    await Promise.allSettled(
      pending.map(async (clip) => {
        const result = await transcribeClipBlob(clip, undefined, useNova);
        if (result.ok) {
          successes += 1;
          textByClip.set(clip.id, result.text);
          if (result.trimReport) {
            totalDroppedSec += result.trimReport.droppedSec;
            totalOriginalSec += result.trimReport.originalSec;
          }
          if (result.speedReport) {
            totalSpeedSavedSec += result.speedReport.savedSec;
            totalSpeedOriginalSec += result.speedReport.originalSec;
          }
          patchClip(clip.id, {
            status: 'transcribed',
            transcript: result.text,
            transcriptedAt: Date.now(),
            errorMessage: undefined,
          });
        } else {
          failures += 1;
          patchClip(clip.id, { status: 'failed', errorMessage: result.error });
        }
      }),
    );
    return {
      textByClip,
      successes,
      failures,
      totalDroppedSec,
      totalOriginalSec,
      totalSpeedSavedSec,
      totalSpeedOriginalSec,
    };
  }

  function reportTranscribeOutcome(successes: number, failures: number) {
    if (successes > 0 && failures === 0) {
      toast.success(`Transcribed ${successes} clip${successes === 1 ? '' : 's'} and merged.`);
    } else if (successes > 0 && failures > 0) {
      toast.error(
        `${successes} transcribed, ${failures} failed. Try again to retry the failed clips.`,
      );
    } else {
      toast.error('Transcription failed for all clips.');
    }
  }

  async function handleCreateTranscript(clipId?: string) {
    if (!session) return;

    const guard = checkActionGuard('transcribe');
    if (!guard.allowed) {
      toast.error(guard.reason);
      return;
    }

    // Include locally-transcribed clips (localTranscript === transcript means nova hasn't run yet)
    const pending = getTranscribableClips(session.clips).filter(
      (c) => clipId == null || c.id === clipId,
    );
    const transcribed = session.clips.filter(
      (c) => c.status === 'transcribed' && !pending.some((p) => p.id === c.id),
    );

    if (pending.length === 0 && transcribed.length === 0) {
      toast.error('No clips to transcribe yet.');
      return;
    }

    if (pending.length === 0) {
      const merged = mergeClipTranscripts(session.clips);
      setTranscript(merged);
      patchSession({ transcript: merged, transcriptSource: 'whisper' });
      toast.success('Transcript merged from existing clips.');
      return;
    }

    setBusy('transcribing');
    patchSession({ status: 'transcribing' });
    patchClips((clips) =>
      clips.map((c) =>
        pending.some((t) => t.id === c.id)
          ? {
              ...c,
              status: 'transcribing' as ClipStatus,
              errorMessage: undefined,
              updatedAt: Date.now(),
            }
          : c,
      ),
    );

    const {
      textByClip,
      successes,
      failures,
      totalDroppedSec,
      totalOriginalSec,
      totalSpeedSavedSec,
      totalSpeedOriginalSec,
    } = await runTranscribeLoop(pending, transcribed, true);

    const merged = [...session.clips]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => textByClip.get(c.id))
      .filter((t): t is string => Boolean(t && t.trim()))
      .join('\n\n');

    if (merged) {
      setTranscript(merged);
      patchSession({ transcript: merged, transcriptSource: 'whisper', status: 'draft' });
    } else {
      patchSession({ status: 'draft' });
    }

    recordAction('transcribe');
    setBusy(null);
    setDebugStats({
      droppedSec: totalDroppedSec,
      originalSec: totalOriginalSec,
      speedSavedSec: totalSpeedSavedSec,
      speedOriginalSec: totalSpeedOriginalSec,
    });
    reportTranscribeOutcome(successes, failures);
    if (totalDroppedSec > 1) {
      const pct = Math.round((totalDroppedSec / Math.max(totalOriginalSec, 1)) * 100);
      toast.info(
        `Silence trimming saved ${Math.round(totalDroppedSec)}s (~${pct}%) before transcription.`,
      );
    }
    if (totalSpeedSavedSec > 1) {
      const pct = Math.round((totalSpeedSavedSec / Math.max(totalSpeedOriginalSec, 1)) * 100);
      toast.info(
        `Audio speed-up saved ${Math.round(totalSpeedSavedSec)}s (~${pct}%) before transcription.`,
      );
    }
  }

  function handleRevertToLocal() {
    const clips = session?.clips ?? [];
    const reverted = clips.map((c) =>
      c.localTranscript
        ? { ...c, transcript: c.localTranscript, status: 'transcribed' as ClipStatus }
        : c,
    );
    patchClips(() => reverted);
    const merged = mergeClipTranscripts(reverted);
    if (merged.trim()) {
      setTranscript(merged);
      patchSession({ transcript: merged, transcriptSource: 'whisper' });
    }
    toast.success('Reverted to local transcription.');
  }

  // ── Clip management ──────────────────────────────────────────────────────
  async function handleDeleteClip(clipId: string) {
    try {
      await audioRepository.remove(clipId);
    } catch {
      /* ignore */
    }
    patchClips((clips) => clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })));
  }

  function handleRemergeFromClips() {
    if (!session) return;
    const merged = mergeClipTranscripts(session.clips);
    if (!merged) {
      toast.error('No transcribed clips to merge.');
      return;
    }
    setTranscript(merged);
    patchSession({ transcript: merged, transcriptSource: 'whisper' });
    toast.success('Transcript re-merged from clips.');
  }

  // ── Note generation / lifecycle ──────────────────────────────────────────
  async function handleGenerate() {
    if (!template) return;
    if (!transcript.trim()) {
      toast.error('Add a transcript first.');
      return;
    }
    if (settings.ai.generation.provider !== 'anthropic') {
      toast.error('Enable Anthropic generation in Settings to draft a note.');
      return;
    }

    const guard = checkActionGuard('generate');
    if (!guard.allowed) {
      toast.error(guard.reason);
      return;
    }

    setError(null);
    setBusy('generating');
    patchSession({ status: 'generating' });
    try {
      const result = await generateNote({
        provider: settings.ai.generation.provider,
        model: settings.ai.generation.model,
        template,
        transcript,
        patient: patient!,
        sessionType: session!.type,
        toneStyle: settings.orgPolicy.toneStyle,
      });
      if (note) {
        updateNote(note.id, {
          sections: result.sections,
          templateId: template.id,
          format: template.format,
        });
      } else {
        ensureNote(result.sections);
      }
      recordAction('generate');
      patchSession({ status: 'ready' });
      toast.success('Draft note generated');
    } catch (e) {
      setError((e as Error).message);
      patchSession({ status: 'draft' });
    } finally {
      setBusy(null);
    }
  }

  function handleSectionChange(key: string, body: string) {
    const target = ensureNote();
    const next = target.sections.map((s) => (s.key === key ? { ...s, body } : s));
    updateNote(target.id, { sections: next });
  }

  const missingRequiredLabels: string[] = (() => {
    if (!template || !note) return [];
    const bodyByKey = new Map(note.sections.map((s) => [s.key, s.body]));
    return template.sections
      .filter((s) => s.required && !(bodyByKey.get(s.key) ?? '').trim())
      .map((s) => s.label);
  })();

  function handleFinalize() {
    if (missingRequiredLabels.length > 0) {
      toast.error(`Required sections empty: ${missingRequiredLabels.join(', ')}`);
      return;
    }
    const target = ensureNote();
    finalizeNote(target.id);
    patchSession({ status: 'finalized' });
    toast.success('Note finalized');
  }
  function handleUnfinalize() {
    if (!note) return;
    unfinalizeNote(note.id);
    patchSession({ status: 'ready' });
  }

  async function handleDeleteSession() {
    if (isDemoMode() && session?.patientId === DEMO_PATIENT_ID) {
      await Promise.all(
        (session?.clips ?? []).map((clip) => audioRepository.remove(clip.id).catch(() => {})),
      );
      if (note) removeNote(note.id);
      patchSession({ clips: [], status: 'draft', transcript: undefined, noteId: undefined });
      setTranscript('');
      setActiveTab('record');
      setPendingDeleteSession(false);
      return;
    }
    if (note) removeNote(note.id);
    await Promise.all(
      (session?.clips ?? []).map((clip) => audioRepository.remove(clip.id).catch(() => {})),
    );
    removeSession(session!.id);
    navigate('/today', { replace: true });
  }

  // ── Recording complete — merge clips + compile live transcripts ──────────
  async function handleRecordingComplete() {
    const readyClips = sortedClips.filter(
      (c) => c.status === 'ready' || c.status === 'transcribed',
    );
    if (readyClips.length > 0) {
      setIsMerging(true);
      try {
        const blobs = (
          await Promise.all(readyClips.map((c) => audioRepository.load(c.id)))
        ).filter((b): b is Blob => b !== null);
        if (blobs.length > 0) setMergedAudioBlob(await mergeAudioBlobs(blobs));
      } catch (e) {
        toast.error(`Could not combine clips: ${(e as Error).message}`);
      } finally {
        setIsMerging(false);
      }
    }

    const liveTexts = sortedClips
      .filter((c) => c.liveTranscript?.trim())
      .map((c) => c.liveTranscript!.trim());
    if (liveTexts.length > 0) {
      const merged = liveTexts.join('\n\n');
      setTranscript(merged);
      patchSession({ transcript: merged, liveTranscript: merged, transcriptSource: 'webspeech' });
    }

    setActiveTab('review');
  }

  // ── Skip recording step ───────────────────────────────────────────────────
  function handleSkipRecording() {
    setRecordingSkipped(true);
    setActiveTab('review');
  }

  // ── Copy full note ────────────────────────────────────────────────────────
  function handleCopyNote() {
    if (!note || !template) return;
    const md = renderNoteMarkdown(note, template, patient!);
    navigator.clipboard.writeText(md).then(
      () => toast.success('Note copied to clipboard'),
      () => toast.error('Copy failed'),
    );
  }

  // ── Derived display values ────────────────────────────────────────────────
  const isTranscriptLocked = sortedClips.length === 0 && !transcript.trim() && !recordingSkipped;
  const micState = deriveMicState(recorder.status);
  const isDemo = isDemoMode() && session.patientId === DEMO_PATIENT_ID;
  const isRecording = recorder.status === 'recording' || recorder.status === 'paused';

  const hasTranscribedClip = sortedClips.some((c) => c.status === 'transcribed');
  const hasLocalTranscript = sortedClips.some((c) => !!c.localTranscript);
  // Nova-eligible: clips not yet AI-transcribed (local result still in transcript, or not yet transcribed)
  const novaEligible = !isRecording && getTranscribableClips(sortedClips).length > 0;

  const currentClipMerge = mergeClipTranscripts(session.clips).trim();
  const hasUserEdits = transcript.trim().length > 0 && transcript.trim() !== currentClipMerge;

  // Show a strong warning when the user navigates back to Record after a note has been generated.
  // A generated note represents expensive AI work that becomes stale if more clips are added.
  // The warning is per-session dismissible — once acknowledged it does not re-surface.
  const showRecordWarning =
    activeTab === 'record' && !recordWarnDismissed && !!note;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── Error banner ──────────────────────────────────── */}
      {error && (
        <div style={{ padding: '12px 22px 0' }}>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* ── Tab bar ───────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 22px 0',
        }}
      >
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          items={[
            { value: 'record', label: 'Record' },
            { value: 'review', label: 'Review' },
          ]}
        />
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          title="Debug tools"
          style={{
            all: 'unset',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 8,
            cursor: 'pointer',
            color: 'var(--color-pt-text-2)',
            background: 'var(--color-pt-surface)',
            border: '1px solid var(--color-pt-border)',
          }}
        >
          <Settings size={14} strokeWidth={2} />
        </button>
      </div>

      {/* ── Scrollable content ────────────────────────────── */}
      <div
        style={{
          flex: 1,
          padding: '10px 22px',
          overflow: 'auto',
          display: 'grid',
          gap: 10,
          alignContent: 'start',
        }}
      >

        {/* ① Record tab */}
        {activeTab === 'record' && (
          <>
            {showRecordWarning && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--color-caution)',
                  background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
                }}
              >
                <AlertTriangle
                  size={15}
                  strokeWidth={2}
                  style={{ color: 'var(--color-caution)', flexShrink: 0, marginTop: 1 }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--color-fg)',
                      marginBottom: 4,
                    }}
                  >
                    Recording more will invalidate your generated note
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)', lineHeight: 1.55 }}>
                    Any new clips will be added to your transcript, but your note was generated from
                    the previous transcript. You&apos;ll need to re-run transcription and regenerate
                    before the note reflects this recording.
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost py-1 text-xs"
                    onClick={() => setActiveTab('review')}
                  >
                    Back to Review
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost py-1 text-xs"
                    onClick={() => setRecordWarnDismissed(true)}
                  >
                    Keep recording
                  </button>
                </div>
              </div>
            )}
            {sortedClips.length === 0 && recorder.status !== 'recording' && (
              <div
                title={`Approximate upper bound — assumes the full ${settings.recordingLimits.maxMinutes}-minute cap is used.`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--color-pt-border)',
                  background: 'var(--color-pt-surface-mut)',
                  fontSize: 11.5,
                  color: 'var(--color-pt-text-3)',
                  width: 'fit-content',
                }}
              >
                <Receipt size={12} strokeWidth={2} />
                {formatCostRange(settings.recordingLimits.maxMinutes)}
              </div>
            )}
            <RecordingPanel
              recorder={recorder}
              live={live}
              clips={sortedClips}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
              onStopAndFinish={handleStopAndFinish}
              autoFinish={settings.session.autoFinish}
              chainPhase={chainPhase}
              onPauseResume={handlePauseResume}
              onDeleteClip={handleDeleteClip}
              onUpload={handleUploadAudio}
              onSkip={handleSkipRecording}
              onRecordingComplete={handleRecordingComplete}
              isMerging={isMerging}
              mergedAudioBlob={mergedAudioBlob}
              wasBackgrounded={recorder.wasBackgrounded && !backgroundWarningDismissed}
              onDismissBackgroundWarning={() => setBackgroundWarningDismissed(true)}
            />
          </>
        )}

        {/* ② Review tab */}
        {activeTab === 'review' &&
          (isTranscriptLocked ? (
            <div
              style={{
                padding: '44px 24px',
                textAlign: 'center',
                borderRadius: 12,
                border: '1px dashed var(--color-pt-border)',
                background: 'var(--color-pt-surface)',
              }}
            >
              <div
                style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-fg)', marginBottom: 6 }}
              >
                Nothing to review yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-fg-subtle)', lineHeight: 1.6 }}>
                Record a clip or upload audio, then come back here.
              </div>
            </div>
          ) : (
            <>
              <TranscriptPanel
                transcript={transcript}
                clips={sortedClips}
                canRemerge={hasTranscribedClip}
                canTranscribe={novaEligible}
                transcribing={busy === 'transcribing'}
                transcribeUsed={transcribeUsed}
                transcribeCap={MAX_TRANSCRIBES_PER_SESSION}
                hasUserEdits={hasUserEdits}
                hasLocalTranscript={hasLocalTranscript}
                onChange={setTranscript}
                onCommit={() =>
                  patchSession({
                    transcript,
                    transcriptSource: session.transcriptSource ?? 'manual',
                  })
                }
                onRemerge={handleRemergeFromClips}
                onCreateTranscript={handleCreateTranscript}
                onRevertToLocal={handleRevertToLocal}
              />
              <NotePanel
                patient={patient}
                note={note}
                template={template}
                templates={templates}
                transcript={transcript}
                busy={busy}
                generateUsed={generateUsed}
                generateCap={MAX_GENERATES_PER_SESSION}
                generationProvider={settings.ai.generation.provider}
                generationModel={settings.ai.generation.model}
                generationReady={settings.ai.generation.provider === 'anthropic'}
                onTemplateChange={(id) => patchSession({ templateId: id })}
                onGenerate={handleGenerate}
                onUnfinalize={handleUnfinalize}
                onSectionChange={handleSectionChange}
              />
            </>
          ))}
      </div>

      {/* ── Bottom action bar ─────────────────────────────── */}
      <div
        className="flex items-center gap-3 rounded-lg px-4 py-3"
        style={{
          margin: '0 22px 22px',
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
        }}
      >
        {/* Left cluster: status + destructive delete */}
        <div className="flex items-center gap-2">
          <MicStatusPill state={micState} elapsedSec={recorder.durationSec} />
          {pendingDeleteSession ? (
            <>
              <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>
                {isDemo ? 'Restart demo?' : 'Delete session?'}
              </span>
              <button
                type="button"
                className="btn btn-ghost py-0.5 text-xs"
                onClick={() => setPendingDeleteSession(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-ghost py-0.5 text-xs"
                style={{ color: isDemo ? undefined : 'var(--color-negative)' }}
                onClick={handleDeleteSession}
              >
                {isDemo ? 'Restart' : 'Delete'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-ghost p-2"
              aria-label={isDemo ? 'Restart demo' : 'Delete session'}
              title={isDemo ? 'Restart demo' : 'Delete session'}
              style={{ color: isDemo ? undefined : 'var(--color-pt-red)' }}
              onClick={() => setPendingDeleteSession(true)}
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Right cluster: copy + primary action */}
        <div className="flex items-center gap-2">
          {note && !pendingDeleteSession && (
            <PtButton
              variant="ghost"
              iconLeft={<Copy size={14} strokeWidth={2} />}
              onClick={handleCopyNote}
              title="Copy full note as markdown"
            >
              Copy note
            </PtButton>
          )}
          {note?.finalized ? (
            <PtButton
              variant="ghost"
              iconLeft={<LockOpen size={14} strokeWidth={2} />}
              onClick={handleUnfinalize}
            >
              Unlock note
            </PtButton>
          ) : (
            <PtButton
              variant="primary"
              iconLeft={<CheckCircle2 size={14} strokeWidth={2} />}
              disabled={!note || missingRequiredLabels.length > 0}
              onClick={handleFinalize}
              title={
                missingRequiredLabels.length > 0
                  ? `Required sections empty: ${missingRequiredLabels.join(', ')}`
                  : undefined
              }
            >
              End &amp; sign
            </PtButton>
          )}
        </div>
      </div>

      {/* ── Debug drawer ──────────────────────────────────── */}
      {drawerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              width: 320,
              height: '100%',
              background: 'var(--color-pt-surface)',
              borderLeft: '1px solid var(--color-pt-border)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-4px 0 24px rgba(26,32,48,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 16px',
                borderBottom: '1px solid var(--color-pt-border)',
              }}
            >
              <span
                style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-fg)', flex: 1 }}
              >
                Debug tools
              </span>
              <button
                type="button"
                className="btn btn-ghost p-1.5"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            {/* Drawer body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* ── Silence visibility ──────────────────────── */}
              <div
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--color-pt-border)',
                  overflow: 'hidden',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: 'var(--color-pt-surface-alt)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={silenceDebugOn}
                    onChange={(e) => setSilenceDebugOn(e.target.checked)}
                    style={{ accentColor: 'var(--color-pt-accent)' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)' }}>
                    Silence visibility
                  </span>
                </label>
                {silenceDebugOn && (
                  <div
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                    }}
                  >
                    {debugStats && debugStats.originalSec > 0 ? (
                      <>
                        <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-fg)' }}>
                            {Math.round(debugStats.droppedSec)}s
                          </span>{' '}
                          trimmed (
                          {Math.round((debugStats.droppedSec / debugStats.originalSec) * 100)}% of
                          recording)
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                          {Math.round(debugStats.originalSec)}s original →{' '}
                          {Math.round(debugStats.originalSec - debugStats.droppedSec)}s after trim
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                        Run transcription to see silence data.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Speed-up visibility ─────────────────────── */}
              <div
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--color-pt-border)',
                  overflow: 'hidden',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: 'var(--color-pt-surface-alt)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={speedDebugOn}
                    onChange={(e) => setSpeedDebugOn(e.target.checked)}
                    style={{ accentColor: 'var(--color-pt-accent)' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)' }}>
                    Speed-up visibility
                  </span>
                </label>
                {speedDebugOn && (
                  <div
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                    }}
                  >
                    {debugStats && debugStats.speedOriginalSec > 0 ? (
                      <>
                        <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-fg)' }}>
                            {Math.round(debugStats.speedSavedSec)}s
                          </span>{' '}
                          saved (
                          {Math.round(
                            (debugStats.speedSavedSec / debugStats.speedOriginalSec) * 100,
                          )}
                          % speedup)
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)' }}>
                          Speed factor:{' '}
                          <span
                            style={{
                              fontWeight: 600,
                              color: 'var(--color-fg)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {settings.audio.speedUp.speed}×
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                        Run transcription to see speed-up data.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function deriveMicState(status: string): MicState {
  switch (status) {
    case 'recording':
      return 'connected';
    case 'paused':
      return 'paused';
    case 'error':
      return 'disconnected';
    default:
      return 'idle';
  }
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/today" className="btn btn-ghost w-fit">
        <ArrowLeft size={14} strokeWidth={2} /> Dashboard
      </Link>
      <div className="card">Session not found.</div>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg border p-3 text-sm"
      style={{
        borderColor: 'var(--color-negative)',
        background: 'var(--color-surface)',
        color: 'var(--color-negative)',
      }}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">{message}</div>
      <button type="button" className="text-xs" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

