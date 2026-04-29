import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Mic,
  Square,
  Pause,
  Play,
  ArrowLeft,
  Sparkles,
  Loader2,
  CheckCircle2,
  Trash2,
  Copy,
  Download,
  FileText,
  AlertTriangle,
  Info,
  RefreshCw,
  Layers,
  XCircle,
  Upload,
  ChevronDown,
  Eye,
  Cloud,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Field, Select, TextInput } from '@/components/ui/Field';
import {
  MicStatusPill,
  PtButton,
  type MicState,
} from '@/components/design';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAppData } from '@/contexts/AppDataProvider';
import { useRecorder, type UseRecorder } from '@/hooks/useRecorder';
import { useLiveTranscript, type UseLiveTranscript } from '@/hooks/useLiveTranscript';
import { audioRepository } from '@/services/AudioRepository';
import { PlaybackWaveform } from '@/components/audio/PlaybackWaveform';
import { BlobWaveform } from '@/components/audio/BlobWaveform';
import { NoteSectionEditor } from '@/components/notes/NoteSectionEditor';
import { transcribe } from '@/services/ai/transcribe';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { mergeAudioBlobs } from '@/lib/audio/merge';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { generateNote } from '@/services/ai/generate';
import { renderNoteMarkdown, renderNotePlainText } from '@/lib/clinical/noteFormat';
import { downloadNotePDF } from '@/lib/pdf/NotePDF';
import { downloadFile } from '@/utils/download';
import { wordCount, formatDuration } from '@/utils/format';
import { useClinician } from '@/contexts/ClinicianProvider';
import { WARN_CLIP_DURATION_SEC } from '@/lib/audioLimits';
import { newId } from '@/utils/ids';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import type {
  ClipStatus,
  Note,
  NoteFormat,
  NoteSection,
  NoteTemplate,
  Patient,
  Session,
  SessionClip,
  TranscriptSource,
  TranscriptionProvider,
} from '@/types';
import { useActionGuard, MAX_TRANSCRIBES_PER_SESSION, MAX_GENERATES_PER_SESSION } from '@/hooks/useActionGuard';
import { useAccordionSections } from '@/hooks/useAccordionSections';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useAutoRotateClip } from '@/hooks/useAutoRotateClip';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { ClipsList } from '@/components/sessions/ClipsList';
import { mergeClipTranscripts } from '@/utils/clips';

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

      const { provider } = settings.ai.transcription;
      if (provider === 'cloudflare' || provider === 'local') {
        toast.loading('Transcribing…', { id: tid, duration: Infinity });
        patchClip(clipId, { status: 'transcribing', updatedAt: Date.now() });
        const clipObj: SessionClip = {
          id: clipId, index: session?.clips.length ?? 0, durationSec,
          status: 'transcribing', createdAt: now, updatedAt: Date.now(),
        };
        const result = await transcribeClipBlob(clipObj);
        if (result.ok) {
          patchClip(clipId, {
            status: 'transcribed', transcript: result.text,
            transcriptedAt: Date.now(), errorMessage: undefined,
          });
          const prior = mergeClipTranscripts(session?.clips ?? []);
          const merged = [prior, result.text.trim()].filter(Boolean).join('\n\n');
          setTranscript(merged);
          patchSession({ transcript: merged, transcriptSource: 'whisper' });
          toast.success('Done.', { id: tid });
        } else {
          patchClip(clipId, { status: 'failed', errorMessage: result.error });
          toast.error(`Transcription failed: ${result.error}`, { id: tid });
        }
      } else {
        toast.success(`Added "${file.name}"`, { id: tid });
      }
    } catch (e) {
      patchClips((clips) => clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })));
      toast.error(`Upload failed: ${(e as Error).message}`, { id: tid });
    }
  }

  // ── Transcription ────────────────────────────────────────────────────────
  async function transcribeClipBlob(clip: SessionClip, onProgress?: (msg: string) => void): Promise<
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
        provider: settings.ai.transcription.provider,
        model: settings.ai.transcription.model,
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
        const result = await transcribeClipBlob(clip);
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
    if (settings.ai.transcription.provider !== 'cloudflare') {
      toast.error('Switch transcription to Cloudflare in Settings to transcribe saved clips.');
      return;
    }

    const guard = checkActionGuard('transcribe');
    if (!guard.allowed) {
      toast.error(guard.reason);
      return;
    }

    const pending = session.clips.filter(
      (c) => (c.status === 'ready' || c.status === 'failed') && (clipId == null || c.id === clipId),
    );
    const transcribed = session.clips.filter((c) => c.status === 'transcribed');

    if (pending.length === 0 && transcribed.length === 0) {
      toast.error('No clips to transcribe yet.');
      return;
    }

    const currentMerge = mergeClipTranscripts(session.clips).trim();
    const userEdits = transcript.trim() && transcript.trim() !== currentMerge;
    if (
      userEdits &&
      !window.confirm(
        'This will replace your transcript with the Cloudflare transcription output. Continue?',
      )
    ) {
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
    } = await runTranscribeLoop(pending, transcribed);

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

  // ── Clip management ──────────────────────────────────────────────────────
  async function handleDeleteClip(clipId: string) {
    if (!confirm('Delete this clip and its audio?')) return;
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

  function handleRevertToLive() {
    if (!session?.liveTranscript) return;
    setTranscript(session.liveTranscript);
    patchSession({ transcript: session.liveTranscript, transcriptSource: 'webspeech' });
    toast.success('Reverted to live transcription.');
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

    const hasDraftContent = note?.sections.some((s) => s.body.trim().length > 0);
    if (hasDraftContent) {
      const ok = window.confirm(
        'A note draft already exists. Regenerating will replace its content. Continue?',
      );
      if (!ok) return;
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
      if (!confirm('Restart demo? This will clear all recordings, transcriptions, and notes.')) return;
      await Promise.all((session?.clips ?? []).map((clip) => audioRepository.remove(clip.id).catch(() => {})));
      if (note) removeNote(note.id);
      patchSession({ clips: [], status: 'draft', transcript: undefined, noteId: undefined });
      setTranscript('');
      resetSections();
      return;
    }
    if (!confirm('Delete this session, its audio, and any draft note?')) return;
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
  const hasReadyClip = sortedClips.some(
    (c) => c.status === 'ready' || c.status === 'failed' || c.status === 'transcribed',
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
            transcriptSource={session.transcriptSource}
            liveTranscript={session.liveTranscript}
            clips={sortedClips}
            canRemerge={hasTranscribedClip}
            canTranscribe={hasReadyClip && !isRecording && settings.ai.transcription.provider === 'cloudflare'}
            transcribing={busy === 'transcribing'}
            transcribeUsed={transcribeUsed}
            transcribeCap={MAX_TRANSCRIBES_PER_SESSION}
            onChange={setTranscript}
            onCommit={() =>
              patchSession({
                transcript,
                transcriptSource: session.transcriptSource ?? 'manual',
              })
            }
            onRemerge={handleRemergeFromClips}
            onCreateTranscript={handleCreateTranscript}
            onRevertToLive={handleRevertToLive}
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
            session={session}
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
            onTemplateChange={(id) => patchSession({ templateId: id })}
            onGenerate={handleGenerate}
            onFinalize={handleFinalize}
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
            {note && (
              <PtButton
                variant="ghost"
                iconLeft={<Copy size={14} strokeWidth={2} />}
                onClick={handleCopyNote}
                title="Copy full note as markdown"
              >
                Copy note
              </PtButton>
            )}
            <button
              type="button"
              onClick={handleDeleteSession}
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

// ─── Recording section ───────────────────────────────────────────────────────

interface RecordingPanelProps {
  recorder: UseRecorder;
  live: UseLiveTranscript;
  clips: SessionClip[];
  onStart: () => void;
  onStop: () => void;
  onPauseResume: () => void;
  onDeleteClip: (clipId: string) => void;
  onUpload: (file: File) => void;
  onSkip: () => void;
  onRecordingComplete: () => void;
  isMerging: boolean;
  mergedAudioBlob: Blob | null;
  wasBackgrounded: boolean;
  onDismissBackgroundWarning: () => void;
}

function RecordingBlankOptions({
  onStart,
  onUpload,
  onSkip,
}: {
  onStart: () => void;
  onUpload: (file: File) => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 py-2">
      <button type="button" className="btn btn-primary" onClick={onStart}>
        <Mic size={14} strokeWidth={2} /> Record
      </button>
      <label className="btn btn-secondary cursor-pointer">
        <Upload size={14} strokeWidth={2} /> Upload Audio
        <input
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { onUpload(file); e.target.value = ''; }
          }}
        />
      </label>
      <button type="button" className="btn btn-ghost" onClick={onSkip}>
        Skip <ArrowRight size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

function RecordingPanel({
  recorder,
  live,
  clips,
  onStart,
  onStop,
  onPauseResume,
  onDeleteClip,
  onUpload,
  onSkip,
  onRecordingComplete,
  isMerging,
  mergedAudioBlob,
  wasBackgrounded,
  onDismissBackgroundWarning,
}: RecordingPanelProps) {
  const { settings, updateAi } = useSettings();
  const recording = recorder.status === 'recording' || recorder.status === 'paused';
  const idle =
    recorder.status === 'idle' || recorder.status === 'stopped' || recorder.status === 'error';
  const webspeechProvider = settings.ai.transcription.provider === 'webspeech';

  if (idle && clips.length === 0) {
    return <RecordingBlankOptions onStart={onStart} onUpload={onUpload} onSkip={onSkip} />;
  }

  return (
    <div className="space-y-3">
      <TranscriptionModePicker
        provider={settings.ai.transcription.provider}
        onSelect={(provider, model) => updateAi({ transcription: { provider, model } })}
      />

      {wasBackgrounded && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-caution)',
            color: 'var(--color-caution)',
            background: 'color-mix(in oklab, var(--color-caution) 10%, transparent)',
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            <span>
              This tab was backgrounded during recording. Audio kept saving, but on mobile the OS
              may have paused or trimmed the clip. Verify duration after stopping.
            </span>
          </div>
          <button
            type="button"
            onClick={onDismissBackgroundWarning}
            className="shrink-0 underline"
            style={{ color: 'var(--color-caution)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <RecordingControlRow
        idle={idle}
        recording={recording}
        paused={recorder.status === 'paused'}
        hasClips={clips.length > 0}
        onStart={onStart}
        onPauseResume={onPauseResume}
        onStop={onStop}
        onUpload={onUpload}
      />

      <RecordingNotices
        recorderError={recorder.error}
        webspeechProvider={webspeechProvider}
        liveSupported={live.supported}
        liveError={live.error}
      />

      <ClipsList clips={clips} recordingDisabled={recording} onDeleteClip={onDeleteClip} />

      {idle && clips.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-primary"
            disabled={isMerging}
            onClick={onRecordingComplete}
          >
            {isMerging ? (
              <><Loader2 size={14} className="animate-spin" /> Combining clips…</>
            ) : (
              <><CheckCircle2 size={14} strokeWidth={2} /> Recording Complete</>
            )}
          </button>
        </div>
      )}

      <AudioPreviewSection clips={clips} mergedAudioBlob={mergedAudioBlob} />

      <LiveTranscriptPreview live={live} />
    </div>
  );
}

function SilenceParams() {
  const { settings, updateAudio } = useSettings();
  const sd = settings.audio.silenceDetection;
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: 'var(--color-pt-border)', background: 'var(--color-pt-surface)' }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sd.enabled}
            onChange={(e) => updateAudio({ silenceDetection: { ...sd, enabled: e.target.checked } })}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--color-pt-text-2)' }}>
            Silence trimming
          </span>
        </label>

        <span
          title={
            'Silence trimming removes quiet gaps from your audio before it is sent for transcription. ' +
            'The original recording is never changed — only the copy uploaded to Whisper is affected.\n\n' +
            'Sensitivity controls how aggressively silence is detected:\n' +
            '  • Aggressive — drops more audio; best when there are long dead-air gaps between speakers.\n' +
            '  • Balanced — recommended for most PT sessions; skips obvious pauses while keeping natural speech rhythm.\n' +
            '  • Relaxed — only drops very long, obvious silences; safest if you are unsure.\n\n' +
            'Pad (ms) adds a buffer of audio kept before and after each spoken segment so words at the edges are not clipped. ' +
            'Increase this if the transcript is cutting off the beginnings or ends of sentences (try 400–600 ms).'
          }
          className="cursor-help"
          style={{ color: 'var(--color-pt-text-3)', lineHeight: 0 }}
        >
          <Info size={13} />
        </span>

        {sd.enabled && (
          <>
            <label className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>Sensitivity</span>
              <Select
                value={sd.sensitivity}
                className="py-0 text-xs h-7"
                onChange={(e) =>
                  updateAudio({
                    silenceDetection: {
                      ...sd,
                      sensitivity: e.target.value as 'low' | 'medium' | 'high',
                    },
                  })
                }
              >
                <option value="low">Aggressive</option>
                <option value="medium">Balanced</option>
                <option value="high">Relaxed</option>
              </Select>
            </label>

            <label className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>Pad (ms)</span>
              <TextInput
                type="number"
                min={0}
                max={2000}
                step={50}
                value={String(sd.padMs)}
                className="w-20 py-0 text-xs h-7"
                onChange={(e) => {
                  const n = Math.max(0, Math.min(2000, Number(e.target.value) || 0));
                  updateAudio({ silenceDetection: { ...sd, padMs: n } });
                }}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

function SpeedParams() {
  const { settings, updateAudio } = useSettings();
  const su = settings.audio.speedUp;
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: 'var(--color-pt-border)', background: 'var(--color-pt-surface)' }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={su.enabled}
            onChange={(e) => updateAudio({ speedUp: { ...su, enabled: e.target.checked } })}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--color-pt-text-2)' }}>
            Speed up
          </span>
        </label>

        <span
          title={
            'Speed up compresses playback time by removing inter-word gaps and shortening pauses. ' +
            'The original recording is never changed — only the processed copy is affected.\n\n' +
            'Speed factor controls how much faster the audio plays:\n' +
            '  • 1.25× — subtle; saves ~20% of playback time.\n' +
            '  • 1.5× — recommended for most sessions; saves ~33%.\n' +
            '  • 1.75× — aggressive; saves ~43%; may feel rushed.'
          }
          className="cursor-help"
          style={{ color: 'var(--color-pt-text-3)', lineHeight: 0 }}
        >
          <Info size={13} />
        </span>

        {su.enabled && (
          <label className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>Speed</span>
            <Select
              value={String(su.speed)}
              className="py-0 text-xs h-7"
              onChange={(e) =>
                updateAudio({ speedUp: { ...su, speed: Number(e.target.value) as 1.25 | 1.5 | 1.75 } })
              }
            >
              <option value="1.25">1.25× — subtle</option>
              <option value="1.5">1.5× — recommended</option>
              <option value="1.75">1.75× — aggressive</option>
            </Select>
          </label>
        )}
      </div>
    </div>
  );
}

function RecordingControlRow({
  idle,
  paused,
  hasClips,
  onStart,
  onPauseResume,
  onStop,
  onUpload,
}: {
  idle: boolean;
  recording: boolean;
  paused: boolean;
  hasClips: boolean;
  onStart: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {idle ? (
        <>
          <button type="button" className="btn btn-primary" onClick={onStart}>
            <Mic size={14} strokeWidth={2} /> {hasClips ? 'Add clip' : 'Start recording'}
          </button>
          <label className="btn btn-ghost cursor-pointer">
            <Upload size={14} strokeWidth={2} /> Upload audio
            <input
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { onUpload(file); e.target.value = ''; }
              }}
            />
          </label>
        </>
      ) : (
        <ActiveRecordingControls paused={paused} onPauseResume={onPauseResume} onStop={onStop} />
      )}
    </div>
  );
}

function RecordingNotices({
  recorderError,
  webspeechProvider,
  liveSupported,
  liveError,
}: {
  recorderError: string | null;
  webspeechProvider: boolean;
  liveSupported: boolean;
  liveError: string | null;
}) {
  return (
    <>
      {recorderError && (
        <p className="text-xs" style={{ color: 'var(--color-negative)' }}>
          {recorderError}
        </p>
      )}
      {webspeechProvider && !liveSupported && (
        <p className="text-xs" style={{ color: 'var(--color-caution)' }}>
          This browser doesn't support live transcription. Switch transcription to Cloudflare in
          Settings to transcribe recordings.
        </p>
      )}
      {webspeechProvider && liveSupported && (
        <p className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
          Browser transcription can't tell speakers apart, which can muddle the generated note when
          the patient and clinician both talk. Upgrade to Cloudflare Nova-3 for speaker labeling.
        </p>
      )}
      {webspeechProvider && liveSupported && liveError && (
        <p className="text-xs" style={{ color: 'var(--color-negative)' }}>
          Live transcription error: {liveError}. {liveErrorHint(liveError)}
        </p>
      )}
    </>
  );
}

function liveErrorHint(err: string): string {
  switch (err) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was blocked for speech recognition.';
    case 'no-speech':
      return 'No speech was detected.';
    case 'audio-capture':
      return 'No microphone was found.';
    case 'network':
      return 'Browser speech recognition needs an internet connection.';
    default:
      return 'Switch to Cloudflare in Settings to transcribe saved clips instead.';
  }
}

function ActiveRecordingControls({
  paused,
  onPauseResume,
  onStop,
}: {
  paused: boolean;
  onPauseResume: () => void;
  onStop: () => void;
}) {
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onPauseResume}>
        {paused ? (
          <>
            <Play size={14} strokeWidth={2} /> Resume
          </>
        ) : (
          <>
            <Pause size={14} strokeWidth={2} /> Pause
          </>
        )}
      </button>
      <button type="button" className="btn btn-primary" onClick={onStop}>
        <Square size={14} strokeWidth={2} /> Stop
      </button>
    </>
  );
}

function TranscriptionModePicker({
  provider,
  onSelect,
}: {
  provider: TranscriptionProvider;
  onSelect: (provider: TranscriptionProvider, model: string) => void;
}) {
  const isLive = provider === 'webspeech';
  const isNova3 = provider === 'cloudflare';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium" style={{ color: 'var(--color-fg-muted)' }}>
        Transcription
      </span>
      <div
        className="flex overflow-hidden rounded-md border text-xs"
        style={{ borderColor: 'var(--color-pt-border)' }}
      >
        <button
          type="button"
          onClick={() => onSelect('webspeech', '')}
          className="flex items-center gap-1.5 px-3 py-1.5 transition-colors"
          style={{
            background: isLive ? 'var(--color-primary)' : 'var(--color-pt-surface)',
            color: isLive ? '#fff' : 'var(--color-fg-muted)',
            fontWeight: isLive ? 500 : 400,
          }}
        >
          <Mic size={12} strokeWidth={2} /> Browser
        </button>
        <button
          type="button"
          onClick={() => onSelect('cloudflare', '@cf/deepgram/nova-3')}
          className="flex items-center gap-1.5 px-3 py-1.5 transition-colors"
          style={{
            background: isNova3 ? 'var(--color-primary)' : 'var(--color-pt-surface)',
            color: isNova3 ? '#fff' : 'var(--color-fg-muted)',
            fontWeight: isNova3 ? 500 : 400,
            borderLeft: '1px solid var(--color-pt-border)',
          }}
        >
          <Cloud size={12} strokeWidth={2} /> Nova 3
        </button>
      </div>
      <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
        {isLive ? 'Live captions' : isNova3 ? 'Transcribes after recording' : ''}
      </span>
    </div>
  );
}

function PromptModal({
  templateName,
  systemPrompt,
  onClose,
}: {
  templateName: string;
  systemPrompt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-xl shadow-xl"
        style={{ background: 'var(--color-pt-surface)', border: '1px solid var(--color-pt-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--color-pt-border)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--color-fg)' }}>
            {templateName} — System Prompt
          </span>
          <button
            type="button"
            className="btn btn-ghost p-1.5"
            onClick={onClose}
            aria-label="Close"
          >
            <XCircle size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-auto p-4">
          <pre
            className="whitespace-pre-wrap text-xs leading-relaxed"
            style={{ color: 'var(--color-fg-muted)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {systemPrompt}
          </pre>
        </div>
      </div>
    </div>
  );
}

function CreateTranscriptButton({
  busy,
  disabled,
  used,
  cap,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  used: number;
  cap: number;
  onClick: () => void;
}) {
  const title = disabled
    ? `Per-session limit reached (${used}/${cap}). Reload to reset.`
    : `Transcribes clips with Nova3 AI and replaces the transcript (${used}/${cap} used).`;
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={busy || disabled}
      onClick={onClick}
      title={title}
    >
      {busy ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Transcribing…
        </>
      ) : (
        <>
          <Sparkles size={14} strokeWidth={2} /> Generate with AI
          <span className="ml-1 text-[10px] tabular-nums opacity-60">
            {used}/{cap}
          </span>
        </>
      )}
    </button>
  );
}

function AudioTrackRow({
  label,
  savedSec,
  note,
  children,
}: {
  label: string;
  savedSec?: number | null;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: 'var(--color-pt-border)',
        background: 'var(--color-pt-surface-alt)',
        padding: 10,
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="text-[11px] font-semibold tracking-wide uppercase"
          style={{ color: 'var(--color-pt-text-2)' }}
        >
          {label}
        </span>
        {savedSec != null && savedSec > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: 'color-mix(in oklab, var(--color-pt-accent) 12%, transparent)',
              color: 'var(--color-pt-accent-fg)',
              border: '1px solid var(--color-pt-accent-border)',
            }}
          >
            −{savedSec.toFixed(1)}s saved
          </span>
        )}
        {note && (
          <span className="text-[10px]" style={{ color: 'var(--color-pt-text-3)' }}>
            {note}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function AudioPreviewSection({ clips, mergedAudioBlob }: { clips: SessionClip[]; mergedAudioBlob: Blob | null }) {
  const { settings } = useSettings();
  const playableClips = clips.filter(
    (c) => c.status === 'ready' || c.status === 'transcribing' || c.status === 'transcribed',
  );

  const [selectedId, setSelectedId] = useState<string>('');

  // Fall back to latest available clip if the selection is gone
  const activeId = playableClips.some((c) => c.id === selectedId)
    ? selectedId
    : (playableClips.at(-1)?.id ?? '');

  const {
    activeSilenced,
    activeSpedup,
    compilingSilence,
    compilingSpeed,
    activeSilenceError,
    activeSpeedError,
    compileSilence,
    compileSpeed,
    resetSilence,
    resetSpeed,
  } = useAudioProcessing(activeId);

  if (playableClips.length === 0) return null;

  const ordinalOf = (clipId: string) => clips.findIndex((c) => c.id === clipId) + 1;
  const speedLabel = `Speed Up (${settings.audio.speedUp.speed}×)`;

  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: 'var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        padding: 12,
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-pt-text)' }}>
          {mergedAudioBlob ? 'Combined Audio' : 'Audio Preview'}
        </span>
        {!mergedAudioBlob && (
          <select
            value={activeId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={playableClips.length <= 1}
            style={{
              background: 'var(--color-pt-surface-alt)',
              color: 'var(--color-pt-text)',
              border: '1px solid var(--color-pt-border)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 12,
              cursor: playableClips.length > 1 ? 'pointer' : 'default',
              opacity: playableClips.length <= 1 ? 0.6 : 1,
            }}
          >
            {playableClips.map((c) => (
              <option key={c.id} value={c.id}>
                Clip {ordinalOf(c.id)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        <AudioTrackRow label="Full Audio">
          {mergedAudioBlob
            ? <BlobWaveform blob={mergedAudioBlob} />
            : activeId
              ? <PlaybackWaveform audioKey={activeId} />
              : null
          }
        </AudioTrackRow>

        <SilenceParams />

        <AudioTrackRow label="Silence Removed" savedSec={activeSilenced?.savedSec}>
          {activeSilenced ? (
            <div className="space-y-1.5">
              <BlobWaveform blob={activeSilenced.blob} />
              <button
                type="button"
                onClick={resetSilence}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 11,
                  textDecoration: 'underline',
                  color: 'var(--color-pt-text-3)',
                }}
              >
                Reset
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={compilingSilence || !activeId}
                onClick={() => void compileSilence()}
              >
                {compilingSilence ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Compiling…
                  </>
                ) : (
                  'Compile'
                )}
              </button>
              {activeSilenceError && (
                <p className="text-[11px]" style={{ color: 'var(--color-negative)' }}>
                  {activeSilenceError}
                </p>
              )}
            </div>
          )}
        </AudioTrackRow>

        <SpeedParams />

        <AudioTrackRow
          label={speedLabel}
          savedSec={activeSpedup?.savedSec}
          note={!activeSilenced ? 'Uses full audio (no silence-removed clip)' : undefined}
        >
          {activeSpedup ? (
            <div className="space-y-1.5">
              <BlobWaveform blob={activeSpedup.blob} />
              <button
                type="button"
                onClick={resetSpeed}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 11,
                  textDecoration: 'underline',
                  color: 'var(--color-pt-text-3)',
                }}
              >
                Reset
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={compilingSpeed}
                onClick={() => void compileSpeed()}
              >
                {compilingSpeed ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Compiling…
                  </>
                ) : (
                  'Compile'
                )}
              </button>
              {activeSpeedError && (
                <p className="text-[11px]" style={{ color: 'var(--color-negative)' }}>
                  {activeSpeedError}
                </p>
              )}
            </div>
          )}
        </AudioTrackRow>
      </div>
    </div>
  );
}

function LiveTranscriptPreview({ live }: { live: UseLiveTranscript }) {
  if (!(live.listening || live.interimText || live.finalText)) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{
        borderColor: 'var(--color-border-soft)',
        background: 'var(--color-surface-2)',
        color: 'var(--color-fg-muted)',
      }}
    >
      <span className="font-medium">Live: </span>
      <span style={{ color: 'var(--color-fg)' }}>{live.finalText}</span>
      {live.interimText && (
        <span className="italic" style={{ color: 'var(--color-fg-subtle)' }}>
          {' '}
          {live.interimText}
        </span>
      )}
      <p className="mt-1 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
        Saved per clip — combined into the transcript when you click Recording Complete.
      </p>
    </div>
  );
}

// ─── Transcription section ────────────────────────────────────────────────────

function TranscriptPanel({
  transcript,
  transcriptSource,
  liveTranscript,
  clips,
  canRemerge,
  canTranscribe,
  transcribing,
  transcribeUsed,
  transcribeCap,
  onChange,
  onCommit,
  onRemerge,
  onCreateTranscript,
  onRevertToLive,
}: {
  transcript: string;
  transcriptSource?: TranscriptSource;
  liveTranscript?: string;
  clips: SessionClip[];
  canRemerge: boolean;
  canTranscribe: boolean;
  transcribing: boolean;
  transcribeUsed: number;
  transcribeCap: number;
  onChange: (next: string) => void;
  onCommit: () => void;
  onRemerge: () => void;
  onCreateTranscript: (clipId?: string) => void;
  onRevertToLive: () => void;
}) {
  const transcribableClips = clips.filter(
    (c) => c.status === 'ready' || c.status === 'failed',
  );
  const latestId = transcribableClips.at(-1)?.id ?? '';
  const [selectedClipId, setSelectedClipId] = useState(latestId);
  const activeClipId = transcribableClips.some((c) => c.id === selectedClipId)
    ? selectedClipId
    : latestId;

  const sourceLabel =
    transcriptSource === 'webspeech'
      ? 'Live Transcription'
      : transcriptSource === 'whisper'
        ? 'AI Transcription (Nova3)'
        : transcriptSource === 'manual'
          ? 'Manually Entered'
          : null;
  const canRevert = !!liveTranscript && transcriptSource !== 'webspeech';

  return (
    <div className="space-y-3">
      {sourceLabel && (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium"
            style={{
              background:
                transcriptSource === 'webspeech'
                  ? 'color-mix(in srgb, var(--color-info) 12%, transparent)'
                  : 'var(--color-surface-2)',
              color: 'var(--color-fg-muted)',
            }}
          >
            {transcriptSource === 'webspeech' ? (
              <Mic size={11} strokeWidth={2} />
            ) : (
              <Sparkles size={11} strokeWidth={2} />
            )}
            {sourceLabel}
          </span>
          {canRevert && (
            <button
              type="button"
              className="btn btn-ghost py-0.5 text-xs"
              onClick={onRevertToLive}
              title="Replace current transcript with the live audio transcription"
            >
              <RefreshCw size={11} strokeWidth={2} /> Revert to live
            </button>
          )}
        </div>
      )}
      {(canTranscribe || canRemerge) && (
        <div className="flex flex-wrap items-center gap-2">
          {canTranscribe && (
            <>
              {transcribableClips.length > 1 && (
                <select
                  className="input h-8 py-0 text-sm"
                  value={activeClipId}
                  onChange={(e) => setSelectedClipId(e.target.value)}
                  disabled={transcribing}
                >
                  {transcribableClips.map((c) => (
                    <option key={c.id} value={c.id}>
                      Clip {clips.findIndex((x) => x.id === c.id) + 1}
                    </option>
                  ))}
                </select>
              )}
              <CreateTranscriptButton
                busy={transcribing}
                disabled={transcribeUsed >= transcribeCap}
                used={transcribeUsed}
                cap={transcribeCap}
                onClick={() =>
                  onCreateTranscript(transcribableClips.length > 1 ? activeClipId : undefined)
                }
              />
            </>
          )}
          {canRemerge && (
            <button type="button" className="btn btn-ghost" onClick={onRemerge}>
              <Layers size={14} strokeWidth={2} /> Re-merge from clips
            </button>
          )}
        </div>
      )}
      <textarea
        className="input min-h-48 leading-relaxed"
        placeholder="Speak while recording, paste in a transcript, or type freely."
        value={transcript}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
    </div>
  );
}

// ─── Notes section ────────────────────────────────────────────────────────────

interface NotePanelProps {
  session: Session;
  patient: Patient;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  transcript: string;
  busy: Busy;
  generateUsed: number;
  generateCap: number;
  generationProvider: string;
  generationModel: string;
  onTemplateChange: (id: string) => void;
  onGenerate: () => void;
  onFinalize: () => void;
  onUnfinalize: () => void;
  onSectionChange: (key: string, body: string) => void;
}

function NotePanel({
  patient,
  note,
  template,
  templates,
  transcript,
  busy,
  generateUsed,
  generateCap,
  generationProvider,
  generationModel,
  onTemplateChange,
  onGenerate,
  onFinalize,
  onUnfinalize,
  onSectionChange,
}: NotePanelProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const sections: NoteSection[] =
    note?.sections ??
    template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
    [];

  const generationLabel =
    generationProvider === 'anthropic'
      ? modelLabel('anthropic', generationModel)
      : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Field label="" className="!space-y-0">
            <Select
              value={template?.id ?? ''}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="text-xs"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          {template?.systemPrompt && (
            <button
              type="button"
              className="btn btn-ghost p-1.5"
              title="View generation prompt"
              onClick={() => setShowPrompt(true)}
            >
              <Eye size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        <NoteActions
          note={note}
          busy={busy}
          canGenerate={transcript.trim().length > 0}
          generateUsed={generateUsed}
          generateCap={generateCap}
          generationLabel={generationLabel}
          onGenerate={onGenerate}
          onFinalize={onFinalize}
          onUnfinalize={onUnfinalize}
        />
      </div>

      {showPrompt && template && (
        <PromptModal
          templateName={template.name}
          systemPrompt={template.systemPrompt}
          onClose={() => setShowPrompt(false)}
        />
      )}

      {note?.finalized && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-positive)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-positive)',
          }}
        >
          Finalized {note.finalizedAt ? new Date(note.finalizedAt).toLocaleString() : ''} — unlock
          to edit.
        </div>
      )}

      <NoteEditor sections={sections} readOnly={!!note?.finalized} onChange={onSectionChange} />

      {note && template && <NoteExportRow note={note} template={template} patient={patient} />}

    </div>
  );
}

function NoteActions({
  note,
  busy,
  canGenerate,
  generateUsed,
  generateCap,
  generationLabel,
  onGenerate,
  onFinalize,
  onUnfinalize,
}: {
  note: Note | undefined;
  busy: Busy;
  canGenerate: boolean;
  generateUsed: number;
  generateCap: number;
  generationLabel?: string;
  onGenerate: () => void;
  onFinalize: () => void;
  onUnfinalize: () => void;
}) {
  const generateBudgetSpent = generateUsed >= generateCap;
  const generateTitle = generateBudgetSpent
    ? `Per-session limit reached (${generateUsed}/${generateCap}). Reload to reset.`
    : `Drafts a note from the transcript (${generateUsed}/${generateCap} used).`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy === 'generating' || !canGenerate || generateBudgetSpent}
        onClick={onGenerate}
        title={generateTitle}
      >
        {busy === 'generating' ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles size={14} strokeWidth={2} /> Generate from transcript
            <span className="ml-1 text-[10px] tabular-nums opacity-70">
              {generateUsed}/{generateCap}
            </span>
          </>
        )}
      </button>
      {generationLabel && (
        <span
          className="text-[11px]"
          style={{ color: 'var(--color-fg-subtle)' }}
          title="Generation model"
        >
          {generationLabel} · Anthropic
        </span>
      )}
      {note && !note.finalized && (
        <button type="button" className="btn btn-secondary" onClick={onFinalize}>
          <CheckCircle2 size={14} strokeWidth={2} /> Finalize
        </button>
      )}
      {note?.finalized && (
        <button type="button" className="btn btn-ghost" onClick={onUnfinalize}>
          Unlock
        </button>
      )}
    </div>
  );
}

function NoteEditor({
  sections,
  readOnly,
  onChange,
}: {
  sections: NoteSection[];
  readOnly: boolean;
  onChange: (key: string, body: string) => void;
}) {
  if (sections.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-fg-subtle)' }}>
        Pick a template to see its sections.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <div key={s.key} className="space-y-1">
          <div className="flex items-center justify-between">
            <div
              className="text-xs font-medium tracking-wide uppercase"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {s.label}
            </div>
            {s.body.trim() && (
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-[var(--color-pt-surface-alt)]"
                style={{ color: 'var(--color-fg-subtle)' }}
                title={`Copy ${s.label}`}
                onClick={() =>
                  navigator.clipboard.writeText(s.body).then(
                    () => toast.success(`${s.label} copied`),
                    () => toast.error('Copy failed'),
                  )
                }
              >
                <Copy size={11} strokeWidth={2} />
              </button>
            )}
          </div>
          <NoteSectionEditor
            value={s.body}
            readOnly={readOnly}
            onChange={(body) => onChange(s.key, body)}
          />
        </div>
      ))}
    </div>
  );
}

function NoteExportRow({
  note,
  template,
  patient,
}: {
  note: Note;
  template: NoteTemplate;
  patient: Patient;
}) {
  const { clinician } = useClinician();
  const [pdfBusy, setPdfBusy] = useState(false);

  function fileBase(): string {
    const date = new Date(note.createdAt).toISOString().slice(0, 10);
    return `${patient.lastName}_${patient.firstName}_${date}`.replace(/\s+/g, '_');
  }

  async function handlePdf() {
    setPdfBusy(true);
    try {
      await downloadNotePDF({ note, template, patient, clinician }, `${fileBase()}.pdf`);
    } catch (e) {
      toast.error(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <button
        type="button"
        className="btn btn-secondary text-xs"
        disabled={pdfBusy}
        onClick={handlePdf}
      >
        {pdfBusy ? (
          <>
            <Loader2 size={12} className="animate-spin" /> Building PDF…
          </>
        ) : (
          <>
            <Download size={12} strokeWidth={2} /> Export PDF
          </>
        )}
      </button>
      <button
        type="button"
        className="btn btn-secondary text-xs"
        onClick={() => {
          const md = renderNoteMarkdown(note, template, patient);
          navigator.clipboard.writeText(md).then(
            () => toast.success('Copied to clipboard'),
            () => toast.error('Copy failed'),
          );
        }}
      >
        <Copy size={12} strokeWidth={2} /> Copy markdown
      </button>
      <button
        type="button"
        className="btn btn-secondary text-xs"
        onClick={() =>
          downloadFile(
            `${fileBase()}.md`,
            renderNoteMarkdown(note, template, patient),
            'text/markdown',
          )
        }
      >
        <Download size={12} strokeWidth={2} /> Download .md
      </button>
      <button
        type="button"
        className="btn btn-secondary text-xs"
        onClick={() =>
          downloadFile(
            `${fileBase()}.txt`,
            renderNotePlainText(note, template, patient),
            'text/plain',
          )
        }
      >
        <FileText size={12} strokeWidth={2} /> Download .txt
      </button>
    </div>
  );
}

// ─── Accordion + Step Progress ───────────────────────────────────────────────

function AccordionSection({
  id,
  stepNum,
  title,
  open,
  onToggle,
  meta,
  children,
  locked,
}: {
  id: string;
  stepNum: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  meta?: React.ReactNode;
  children: React.ReactNode;
  locked?: boolean;
}) {
  const effectiveOpen = locked ? false : open;
  return (
    <section
      style={{
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        borderRadius: 12,
        overflow: 'hidden',
        opacity: locked ? 0.5 : 1,
        transition: 'opacity 250ms ease-out',
      }}
    >
      <button
        type="button"
        aria-expanded={effectiveOpen}
        aria-controls={`accordion-body-${id}`}
        onClick={locked ? undefined : onToggle}
        className={`flex w-full items-center gap-3 text-left transition-colors${locked ? '' : ' hover:bg-[var(--color-pt-surface-alt)]'}`}
        style={{ padding: '12px 16px', cursor: locked ? 'default' : 'pointer' }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            background: 'var(--color-pt-surface-alt)',
            color: 'var(--color-pt-text-2)',
            border: '1px solid var(--color-pt-border)',
          }}
        >
          {stepNum}
        </span>
        <span
          className="font-display text-base font-semibold"
          style={{ color: 'var(--color-fg)' }}
        >
          {title}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {locked ? (
            <span
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              <Lock size={11} strokeWidth={2} /> Complete step above first
            </span>
          ) : (
            <>
              {meta}
              <ChevronDown
                size={16}
                strokeWidth={2}
                style={{
                  color: 'var(--color-fg-subtle)',
                  transform: effectiveOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms ease-out',
                  flexShrink: 0,
                }}
              />
            </>
          )}
        </div>
      </button>

      {/* CSS grid row trick: animates height without JS measurement */}
      <div
        id={`accordion-body-${id}`}
        style={{
          display: 'grid',
          gridTemplateRows: effectiveOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms ease-out',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              borderTop: '1px solid var(--color-pt-border)',
              padding: '14px 16px 16px',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
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


// Strips provider prefixes for a compact display label.
// @cf/deepgram/nova-3 → nova-3 | claude-sonnet-4-6 → sonnet-4-6
function modelLabel(_provider: string, model: string): string {
  const short = model.split('/').pop() ?? model;
  return short.replace(/^claude-/, '');
}
