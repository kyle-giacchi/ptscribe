import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { MicStatusPill, PtButton, type MicState } from '@/components/design';
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
import { wordCount, formatDuration } from '@/utils/format';
import { WARN_CLIP_DURATION_SEC } from '@/lib/audioLimits';
import { newId } from '@/utils/ids';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import type { ClipStatus, Note, NoteFormat, NoteSection, Session, SessionClip } from '@/types';
import { useActionGuard, MAX_TRANSCRIBES_PER_SESSION, MAX_GENERATES_PER_SESSION } from '@/hooks/useActionGuard';
import { useAccordionSections } from '@/hooks/useAccordionSections';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useAutoRotateClip } from '@/hooks/useAutoRotateClip';
import { mergeClipTranscripts } from '@/utils/clips';
import { AccordionSection } from '@/components/sessions/AccordionSection';
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

  const recorder = useRecorder();
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

  const sessionStatus = session?.status ?? 'draft';
  const { openSections, toggleSection, resetSections, openSection } = useAccordionSections({
    hasTranscript: !!session?.transcript,
    hasNote: !!session?.noteId,
    sessionStatus,
  });

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

  const sortedClips = session
    ? [...session.clips].sort((a, b) => a.createdAt - b.createdAt)
    : [];

  useAutoRotateClip(recorder.status, recorder.durationSec, handleStopRecording, handleStartRecording);

  if (!session || !patient) return <NotFound />;

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
          runLocalTranscription(clipId, finalBlob);
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
      { id: clipId, index: clips.length, durationSec: 0, status: 'pending', createdAt: now, updatedAt: now },
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
          audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
          audio.src = url;
        });
      } catch { /* duration stays 0 */ }

      await audioRepository.save(clipId, blob);
      patchClip(clipId, { status: 'ready', durationSec });

      toast.success(`Added "${file.name}"`, { id: tid });
      runLocalTranscription(clipId, blob);
    } catch (e) {
      patchClips((clips) => clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })));
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
  async function transcribeClipBlob(clip: SessionClip, onProgress?: (msg: string) => void, useNova?: boolean): Promise<
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
    const pending = session.clips.filter(
      (c) =>
        (c.status === 'ready' ||
          c.status === 'failed' ||
          (c.status === 'transcribed' && !!c.localTranscript && c.transcript === c.localTranscript)) &&
        (clipId == null || c.id === clipId),
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

  function handleFinalize() {
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
      await Promise.all((session?.clips ?? []).map((clip) => audioRepository.remove(clip.id).catch(() => {})));
      if (note) removeNote(note.id);
      patchSession({ clips: [], status: 'draft', transcript: undefined, noteId: undefined });
      setTranscript('');
      resetSections();
      setPendingDeleteSession(false);
      return;
    }
    if (note) removeNote(note.id);
    await Promise.all((session?.clips ?? []).map((clip) => audioRepository.remove(clip.id).catch(() => {})));
    removeSession(session!.id);
    navigate('/', { replace: true });
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

    openSection('transcription');
  }

  // ── Skip recording step ───────────────────────────────────────────────────
  function handleSkipRecording() {
    setRecordingSkipped(true);
    openSection('transcription');
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
  const nearingLimit = isRecording && recorder.durationSec >= WARN_CLIP_DURATION_SEC;
  const timerColor = nearingLimit
    ? 'var(--color-caution)'
    : isRecording
      ? 'var(--color-negative)'
      : 'var(--color-fg-subtle)';

  const hasTranscribedClip = sortedClips.some((c) => c.status === 'transcribed');
  const hasLocalTranscript = sortedClips.some((c) => !!c.localTranscript);
  // Nova-eligible: clips not yet AI-transcribed (local result still in transcript, or not yet transcribed)
  const novaEligible = !isRecording && sortedClips.some(
    (c) =>
      c.status === 'ready' ||
      c.status === 'failed' ||
      (c.status === 'transcribed' && !!c.localTranscript && c.transcript === c.localTranscript),
  );

  // Collapsed-header summaries
  const clipSummary =
    sortedClips.length > 0
      ? `${sortedClips.length} clip${sortedClips.length === 1 ? '' : 's'}`
      : undefined;
  const transcriptWordCount = wordCount(transcript);
  const noteSummary = note?.finalized
    ? 'Finalized'
    : note?.sections.some((s) => s.body.trim())
      ? 'Draft'
      : undefined;

  const currentClipMerge = mergeClipTranscripts(session.clips).trim();
  const hasUserEdits = transcript.trim().length > 0 && transcript.trim() !== currentClipMerge;

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr', minHeight: '100%' }}>
      <div
        style={{
          padding: 22,
          background: 'var(--color-pt-surface-alt)',
          overflow: 'auto',
          display: 'grid',
          gap: 10,
          alignContent: 'start',
        }}
      >
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* ① Recording */}
        <AccordionSection
          id="recording"
          stepNum={1}
          title="Recording"
          open={openSections.has('recording')}
          onToggle={() => toggleSection('recording')}
          meta={
            <div className="flex items-center gap-3">
              {nearingLimit && (
                <span className="text-[11px]" style={{ color: 'var(--color-caution)' }}>
                  Approaching limit
                </span>
              )}
              {clipSummary && (
                <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                  {clipSummary}
                </span>
              )}
              <span className="font-mono text-sm tabular-nums" style={{ color: timerColor }}>
                {formatDuration(recorder.durationSec)}
              </span>
              {isRecording && <PulseDot />}
            </div>
          }
        >
          <RecordingPanel
            recorder={recorder}
            live={live}
            clips={sortedClips}
            onStart={handleStartRecording}
            onStop={handleStopRecording}
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
        </AccordionSection>

        {/* ② Transcription */}
        <AccordionSection
          id="transcription"
          stepNum={2}
          title="Transcription"
          open={openSections.has('transcription')}
          onToggle={() => toggleSection('transcription')}
          locked={isTranscriptLocked}
          meta={
            <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
              {transcriptWordCount > 0 ? `${transcriptWordCount} words` : 'Empty'}
            </span>
          }
        >
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
        </AccordionSection>

        {/* ③ Notes */}
        <AccordionSection
          id="notes"
          stepNum={3}
          title="Notes"
          open={openSections.has('notes')}
          onToggle={() => toggleSection('notes')}
          locked={isTranscriptLocked}
          meta={
            <div className="flex items-center gap-2">
              {busy === 'generating' && (
                <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-fg-subtle)' }} />
              )}
              {template && (
                <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                  {template.name}
                </span>
              )}
              {noteSummary && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: note?.finalized
                      ? 'color-mix(in oklab, var(--color-positive) 15%, transparent)'
                      : 'var(--color-pt-surface-alt)',
                    color: note?.finalized
                      ? 'var(--color-positive)'
                      : 'var(--color-fg-muted)',
                    border: `1px solid ${note?.finalized ? 'var(--color-positive)' : 'var(--color-pt-border)'}`,
                  }}
                >
                  {noteSummary}
                </span>
              )}
            </div>
          }
        >
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
        </AccordionSection>

        <div
          className="flex items-center justify-between gap-3 rounded-lg px-4 py-3"
          style={{
            background: 'var(--color-pt-surface)',
            border: '1px solid var(--color-pt-border)',
          }}
        >
          <MicStatusPill state={micState} elapsedSec={recorder.durationSec} />
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
                onClick={() => setPendingDeleteSession(true)}
                aria-label={isDemo ? 'Restart demo' : 'Delete session'}
                title={isDemo ? 'Restart demo' : 'Delete session'}
                className="transition-colors hover:bg-[var(--color-pt-surface-mut)]"
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid var(--color-pt-border)',
                  background: 'var(--color-pt-surface)',
                  color: isDemo ? 'var(--color-pt-text-2)' : 'var(--color-pt-red)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                {isDemo ? <RefreshCw size={14} strokeWidth={2} /> : <Trash2 size={14} strokeWidth={2} />}
              </button>
            )}
          </div>
          {note?.finalized ? (
            <PtButton
              variant="ghost"
              iconLeft={<RefreshCw size={14} strokeWidth={2} />}
              onClick={handleUnfinalize}
            >
              Unlock note
            </PtButton>
          ) : (
            <PtButton
              variant="primary"
              iconLeft={<CheckCircle2 size={14} strokeWidth={2} />}
              disabled={!note}
              onClick={handleFinalize}
            >
              End &amp; sign
            </PtButton>
          )}
        </div>
      </div>
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
      <Link to="/" className="btn btn-ghost w-fit">
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

// ─── Misc helpers ────────────────────────────────────────────────────────────

function PulseDot() {
  return (
    <span
      className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
      style={{ background: 'var(--color-negative)' }}
      aria-hidden
    />
  );
}
