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
  RefreshCw,
  Layers,
  XCircle,
  Clock,
  Upload,
  ChevronDown,
  Eye,
  Cloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { Field, Select } from '@/components/ui/Field';
import {
  Avatar,
  MicStatusPill,
  PtButton,
  StatusBadge,
  type MicState,
  type StatusTone,
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
import { NoteSectionEditor } from '@/components/notes/NoteSectionEditor';
import { transcribe } from '@/services/ai/transcribe';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { generateNote } from '@/services/ai/generate';
import { renderNoteMarkdown, renderNotePlainText } from '@/lib/clinical/noteFormat';
import { downloadNotePDF } from '@/lib/pdf/NotePDF';
import { downloadFile } from '@/utils/download';
import { wordCount, formatDuration } from '@/utils/format';
import { labelForType } from '@/utils/labels';
import { useClinician } from '@/contexts/ClinicianProvider';
import { MAX_CLIP_DURATION_SEC, WARN_CLIP_DURATION_SEC } from '@/lib/audioLimits';
import { newId } from '@/utils/ids';
import type {
  ClipStatus,
  Note,
  NoteFormat,
  NoteSection,
  NoteTemplate,
  Patient,
  Session,
  SessionClip,
  TranscriptionProvider,
} from '@/types';

type Busy = null | 'transcribing' | 'generating';

// Soft client-side guards against accidental double-clicks and per-session
// abuse. Worker-side rate limiting (KV/DO) is the proper hard cap; this is
// just enough to keep a stray rapid-click from burning tokens.
const ACTION_COOLDOWN_MS = 3000;
const MAX_TRANSCRIBES_PER_SESSION = 10;
const MAX_GENERATES_PER_SESSION = 10;

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
  // Tracks the clip currently being recorded, so stop() knows which clip to update.
  const activeClipIdRef = useRef<string | null>(null);
  // Guards the auto-rotate effect against double-firing while the stop→start
  // round-trip is in flight (the duration tick keeps incrementing during stop).
  const rotatingRef = useRef(false);

  // Action guards: cooldown timestamps + per-session counts.
  const lastTranscribeAtRef = useRef(0);
  const lastGenerateAtRef = useRef(0);
  const transcribeCountRef = useRef(0);
  const generateCountRef = useRef(0);
  const [transcribeUsed, setTranscribeUsed] = useState(0);
  const [generateUsed, setGenerateUsed] = useState(0);

  // ── Accordion state ──────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const init = new Set<string>(['recording']);
    if (session?.transcript) init.add('transcription');
    if (session?.noteId) init.add('notes');
    return init;
  });

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Auto-advance: open next section when a workflow stage completes.
  // setTimeout defers setState out of the effect body to satisfy react-hooks/set-state-in-effect.
  const sessionStatus = session?.status ?? 'draft';
  const prevStatusRef = useRef(sessionStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = sessionStatus;
    let next: string | null = null;
    if (prev === 'recording' && sessionStatus === 'draft') next = 'transcription';
    else if (prev === 'transcribing' && sessionStatus === 'draft') next = 'notes';
    else if (prev === 'generating' && sessionStatus === 'ready') next = 'notes';
    if (!next) return;
    const section = next;
    const id = window.setTimeout(() => {
      setOpenSections((s) => { const n = new Set(s); n.add(section); return n; });
    }, 0);
    return () => window.clearTimeout(id);
  }, [sessionStatus]);

  function checkActionGuard(
    kind: 'transcribe' | 'generate',
  ): { allowed: true } | { allowed: false; reason: string } {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const lastAt = kind === 'transcribe' ? lastTranscribeAtRef.current : lastGenerateAtRef.current;
    const count = kind === 'transcribe' ? transcribeCountRef.current : generateCountRef.current;
    const max = kind === 'transcribe' ? MAX_TRANSCRIBES_PER_SESSION : MAX_GENERATES_PER_SESSION;
    if (count >= max) {
      return {
        allowed: false,
        reason: `Limit reached: ${max} ${kind}s per session. Reload to reset.`,
      };
    }
    const elapsed = now - lastAt;
    if (lastAt > 0 && elapsed < ACTION_COOLDOWN_MS) {
      const wait = Math.ceil((ACTION_COOLDOWN_MS - elapsed) / 1000);
      return { allowed: false, reason: `Please wait ${wait}s before retrying.` };
    }
    return { allowed: true };
  }

  function recordAction(kind: 'transcribe' | 'generate') {
    if (kind === 'transcribe') {
      // eslint-disable-next-line react-hooks/purity
      lastTranscribeAtRef.current = Date.now();
      transcribeCountRef.current += 1;
      setTranscribeUsed(transcribeCountRef.current);
    } else {
      // eslint-disable-next-line react-hooks/purity
      lastGenerateAtRef.current = Date.now();
      generateCountRef.current += 1;
      setGenerateUsed(generateCountRef.current);
    }
  }

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

  // ── One-shot crash recovery ──────────────────────────────────────────────
  const recoveryRanRef = useRef(false);
  useEffect(() => {
    if (recoveryRanRef.current || !session) return;
    recoveryRanRef.current = true;
    const pending = session.clips.filter((c) => c.status === 'pending');
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const outcomes: Array<{ clipId: string; ok: boolean; durationSec?: number }> = [];
      for (const clip of pending) {
        try {
          const chunks = await audioRepository.loadChunks(clip.id);
          if (chunks.length === 0) {
            outcomes.push({ clipId: clip.id, ok: false });
            continue;
          }
          const mimeType = chunks[0]?.type || 'audio/webm';
          const blob = new Blob(chunks, { type: mimeType });
          await audioRepository.save(clip.id, blob);
          await audioRepository.clearChunks(clip.id);
          outcomes.push({ clipId: clip.id, ok: true });
        } catch (err) {
          console.error(`Audio recovery failed for clip ${clip.id}:`, err);
          outcomes.push({ clipId: clip.id, ok: false });
        }
      }
      if (cancelled || outcomes.length === 0) return;

      patchClips((clips) =>
        clips.map((c) => {
          const o = outcomes.find((x) => x.clipId === c.id);
          if (!o) return c;
          return o.ok
            ? { ...c, status: 'ready' as ClipStatus, updatedAt: Date.now() }
            : {
                ...c,
                status: 'failed' as ClipStatus,
                errorMessage: 'Recording was interrupted before any audio could be saved.',
                updatedAt: Date.now(),
              };
        }),
      );
      const recovered = outcomes.filter((o) => o.ok).length;
      const abandoned = outcomes.length - recovered;
      if (recovered > 0) {
        toast.success(`Recovered ${recovered} interrupted clip${recovered === 1 ? '' : 's'}.`);
      }
      if (abandoned > 0) {
        toast.error(`${abandoned} clip${abandoned === 1 ? '' : 's'} could not be recovered.`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const sortedClips = session
    ? [...session.clips].sort((a, b) => a.createdAt - b.createdAt)
    : [];

  // ── Auto-rotate when a clip approaches the Cloudflare Whisper limit ──────
  useEffect(() => {
    if (recorder.status !== 'recording') return;
    if (recorder.durationSec < MAX_CLIP_DURATION_SEC) return;
    if (rotatingRef.current) return;
    rotatingRef.current = true;
    (async () => {
      try {
        await handleStopRecording();
        await handleStartRecording();
        toast.info('Started a new clip — long sessions are split automatically for transcription.');
      } finally {
        rotatingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.status, recorder.durationSec]);

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

    if (settings.ai.transcription.provider === 'webspeech' && !live.supported) {
      toast.error(
        "This browser doesn't support live transcription. Switch transcription to Cloudflare in Settings before recording.",
      );
      return;
    }

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

    if (settings.ai.transcription.provider === 'webspeech' && live.supported) {
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
      if (settings.ai.transcription.provider === 'webspeech' && live.supported) {
        live.start();
      }
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

    if (live.finalText.trim()) {
      const merged = `${transcript} ${live.finalText}`.replace(/\s+/g, ' ').trim();
      setTranscript(merged);
      patchSession({ transcript: merged, transcriptSource: 'webspeech', status: 'draft' });
    } else {
      patchSession({ status: 'draft' });
    }
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
      toast.success(`Added "${file.name}"`);
    } catch (e) {
      patchClips((clips) => clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })));
      toast.error(`Upload failed: ${(e as Error).message}`);
    }
  }

  // ── Transcription ────────────────────────────────────────────────────────
  async function transcribeClipBlob(clip: SessionClip): Promise<
    | { ok: true; text: string; trimReport?: { droppedSec: number; originalSec: number } }
    | { ok: false; error: string }
  > {
    try {
      const original = await audioRepository.load(clip.id);
      if (!original) return { ok: false, error: 'No audio found for this clip.' };

      let blobToSend: Blob = original;
      let trimReport: { droppedSec: number; originalSec: number } | undefined;

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

      const result = await transcribe({
        blob: blobToSend,
        provider: settings.ai.transcription.provider,
        model: settings.ai.transcription.model,
      });
      return { ok: true, text: result.text, trimReport };
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
  }> {
    const textByClip = new Map<string, string>();
    for (const c of transcribed) {
      if (c.transcript) textByClip.set(c.id, c.transcript);
    }
    let successes = 0;
    let failures = 0;
    let totalDroppedSec = 0;
    let totalOriginalSec = 0;
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
          patchClip(clip.id, {
            status: 'transcribed',
            transcript: result.text,
            // eslint-disable-next-line react-hooks/purity
            transcriptedAt: Date.now(),
            errorMessage: undefined,
          });
        } else {
          failures += 1;
          patchClip(clip.id, { status: 'failed', errorMessage: result.error });
        }
      }),
    );
    return { textByClip, successes, failures, totalDroppedSec, totalOriginalSec };
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

  async function handleCreateTranscript() {
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

    const pending = session.clips.filter((c) => c.status === 'ready' || c.status === 'failed');
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

    const { textByClip, successes, failures, totalDroppedSec, totalOriginalSec } =
      await runTranscribeLoop(pending, transcribed);

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
    if (!confirm('Delete this session, its audio, and any draft note?')) return;
    if (note) removeNote(note.id);
    await Promise.all((session?.clips ?? []).map((clip) => audioRepository.remove(clip.id).catch(() => {})));
    removeSession(session!.id);
    navigate('/', { replace: true });
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
  const hasClips = session.clips.length > 0;
  const micState = deriveMicState(recorder.status);
  const sessionStatusBadge = deriveSessionBadge(session.status, hasClips);
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();

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
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', minHeight: '100%' }}>
      <SessionHeader
        patient={patient}
        fullName={fullName}
        sessionDate={session.date}
        sessionType={session.type}
        statusBadge={sessionStatusBadge}
        micState={micState}
        elapsedSec={recorder.durationSec}
        canFinalize={!!note && !note.finalized}
        finalized={!!note?.finalized}
        onFinalize={handleFinalize}
        onUnfinalize={handleUnfinalize}
        onDelete={handleDeleteSession}
        onCopyNote={note ? handleCopyNote : undefined}
      />

      <StepProgress
        sessionStatus={session.status}
        hasClips={hasClips}
        transcript={transcript}
        note={note}
      />

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
          meta={
            <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
              {transcriptWordCount > 0 ? `${transcriptWordCount} words` : 'Empty'}
            </span>
          }
        >
          <TranscriptPanel
            transcript={transcript}
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
          />
        </AccordionSection>

        {/* ③ Notes */}
        <AccordionSection
          id="notes"
          stepNum={3}
          title="Notes"
          open={openSections.has('notes')}
          onToggle={() => toggleSection('notes')}
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
      </div>
    </div>
  );
}

function SessionHeader({
  patient,
  fullName,
  sessionDate,
  sessionType,
  statusBadge,
  micState,
  elapsedSec,
  canFinalize,
  finalized,
  onFinalize,
  onUnfinalize,
  onDelete,
  onCopyNote,
}: {
  patient: Patient;
  fullName: string;
  sessionDate: number;
  sessionType: string;
  statusBadge: { tone: StatusTone; label: string };
  micState: MicState;
  elapsedSec: number;
  canFinalize: boolean;
  finalized: boolean;
  onFinalize: () => void;
  onUnfinalize: () => void;
  onDelete: () => void;
  onCopyNote?: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
        padding: '16px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <Link
        to={`/patients/${patient.id}`}
        aria-label="Back to patient chart"
        style={{
          color: 'var(--color-pt-text-2)',
          padding: 8,
          borderRadius: 8,
          border: '1px solid var(--color-pt-border)',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <ArrowLeft size={14} strokeWidth={2} />
      </Link>
      <Avatar name={fullName || '?'} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--color-pt-text)',
              letterSpacing: '-0.2px',
            }}
          >
            {fullName || 'Unnamed patient'}
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--color-pt-text-3)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            PT-{patient.id.slice(0, 5).toUpperCase()}
          </span>
          <StatusBadge tone={statusBadge.tone} label={statusBadge.label} />
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-pt-text-2)',
            marginTop: 2,
          }}
        >
          {labelForType(sessionType)} · {new Date(sessionDate).toLocaleString()}
        </div>
      </div>
      <MicStatusPill state={micState} elapsedSec={elapsedSec} />
      {onCopyNote && (
        <PtButton
          variant="ghost"
          iconLeft={<Copy size={14} strokeWidth={2} />}
          onClick={onCopyNote}
          title="Copy full note as markdown"
        >
          Copy note
        </PtButton>
      )}
      {finalized ? (
        <PtButton
          variant="ghost"
          iconLeft={<RefreshCw size={14} strokeWidth={2} />}
          onClick={onUnfinalize}
        >
          Unlock note
        </PtButton>
      ) : (
        <PtButton
          variant="primary"
          iconLeft={<CheckCircle2 size={14} strokeWidth={2} />}
          disabled={!canFinalize}
          onClick={onFinalize}
        >
          End &amp; sign
        </PtButton>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete session"
        className="transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        style={{
          padding: 8,
          borderRadius: 8,
          border: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
          color: 'var(--color-pt-red)',
          display: 'inline-flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <Trash2 size={14} strokeWidth={2} />
      </button>
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

function deriveSessionBadge(
  status: string,
  hasClips: boolean,
): { tone: StatusTone; label: string } {
  switch (status) {
    case 'recording':
      return { tone: 'live', label: 'Recording' };
    case 'transcribing':
      return { tone: 'next', label: 'Transcribing' };
    case 'generating':
      return { tone: 'next', label: 'Generating' };
    case 'ready':
      return { tone: 'plateau', label: 'Awaiting sign' };
    case 'finalized':
      return { tone: 'done', label: 'Signed' };
    default:
      return hasClips
        ? { tone: 'on-track', label: 'Ready to transcribe' }
        : { tone: 'new', label: 'New' };
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
  wasBackgrounded: boolean;
  onDismissBackgroundWarning: () => void;
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
  wasBackgrounded,
  onDismissBackgroundWarning,
}: RecordingPanelProps) {
  const { settings, updateAi } = useSettings();
  const recording = recorder.status === 'recording' || recorder.status === 'paused';
  const idle =
    recorder.status === 'idle' || recorder.status === 'stopped' || recorder.status === 'error';
  const webspeechProvider = settings.ai.transcription.provider === 'webspeech';

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

      <LiveTranscriptPreview live={live} />
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
    : `Transcribes saved clips and merges into the transcript (${used}/${cap} used).`;
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
          <FileText size={14} strokeWidth={2} /> Create transcript
          <span className="ml-1 text-[10px] tabular-nums opacity-60">
            {used}/{cap}
          </span>
        </>
      )}
    </button>
  );
}

function ClipsList({
  clips,
  recordingDisabled,
  onDeleteClip,
}: {
  clips: SessionClip[];
  recordingDisabled: boolean;
  onDeleteClip: (clipId: string) => void;
}) {
  if (clips.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
        No clips yet. Press <strong>Start recording</strong> to capture audio, or{' '}
        <strong>Upload audio</strong> to add an existing file.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {clips.map((clip, i) => (
        <ClipRow
          key={clip.id}
          clip={clip}
          ordinal={i + 1}
          recordingDisabled={recordingDisabled}
          onDelete={() => onDeleteClip(clip.id)}
        />
      ))}
    </div>
  );
}

function ClipRow({
  clip,
  ordinal,
  recordingDisabled,
  onDelete,
}: {
  clip: SessionClip;
  ordinal: number;
  recordingDisabled: boolean;
  onDelete: () => void;
}) {
  const showWaveform =
    clip.status === 'ready' ||
    clip.status === 'transcribing' ||
    clip.status === 'transcribed' ||
    clip.status === 'failed';
  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: 'var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        padding: 10,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
          style={{
            background: 'var(--color-pt-surface-alt)',
            color: 'var(--color-pt-text-2)',
            border: '1px solid var(--color-pt-border)',
          }}
        >
          {ordinal}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-pt-text)' }}>
              Clip {ordinal}
            </span>
            <ClipStatusBadge status={clip.status} />
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: 'var(--color-pt-text-3)' }}
            >
              <Clock size={11} className="-mt-0.5 inline" /> {formatDuration(clip.durationSec)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-pt-text-3)' }}>
              {new Date(clip.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          {clip.errorMessage && (
            <p className="mt-1 text-[11px] break-words" style={{ color: 'var(--color-negative)' }}>
              {clip.errorMessage}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Delete clip"
          onClick={onDelete}
          disabled={recordingDisabled || clip.status === 'transcribing'}
          className="transition-colors hover:bg-[var(--color-pt-surface-mut)] disabled:opacity-40"
          style={{
            padding: 6,
            borderRadius: 6,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-surface)',
            color: 'var(--color-pt-red)',
            display: 'inline-flex',
            alignItems: 'center',
            cursor: recordingDisabled || clip.status === 'transcribing' ? 'not-allowed' : 'pointer',
          }}
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
      {showWaveform && (
        <div className="mt-2">
          <PlaybackWaveform audioKey={clip.id} />
        </div>
      )}
      {clip.status === 'transcribed' && clip.transcript && (
        <details className="mt-2">
          <summary
            className="cursor-pointer text-[11px]"
            style={{ color: 'var(--color-pt-text-2)' }}
          >
            View transcript ({wordCount(clip.transcript)} words)
          </summary>
          <p
            className="mt-1 text-xs leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--color-pt-text)' }}
          >
            {clip.transcript}
          </p>
        </details>
      )}
    </div>
  );
}

function ClipStatusBadge({ status }: { status: ClipStatus }) {
  const meta = clipBadgeMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
      style={{
        background: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.border}`,
      }}
    >
      {status === 'transcribing' && <Loader2 size={10} className="animate-spin" />}
      {status === 'transcribed' && <CheckCircle2 size={10} />}
      {status === 'failed' && <XCircle size={10} />}
      {meta.label}
    </span>
  );
}

function clipBadgeMeta(status: ClipStatus): {
  label: string;
  bg: string;
  fg: string;
  border: string;
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Recording',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-pt-text-2)',
        border: 'var(--color-pt-border)',
      };
    case 'ready':
      return {
        label: 'Ready',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-pt-text-2)',
        border: 'var(--color-pt-border)',
      };
    case 'transcribing':
      return {
        label: 'Transcribing',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-pt-text)',
        border: 'var(--color-pt-border)',
      };
    case 'transcribed':
      return {
        label: 'Transcribed',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-positive, var(--color-pt-text))',
        border: 'var(--color-positive, var(--color-pt-border))',
      };
    case 'failed':
      return {
        label: 'Failed',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-negative)',
        border: 'var(--color-negative)',
      };
  }
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
        Stops will append to the transcript automatically.
      </p>
    </div>
  );
}

// ─── Transcription section ────────────────────────────────────────────────────

function TranscriptPanel({
  transcript,
  canRemerge,
  canTranscribe,
  transcribing,
  transcribeUsed,
  transcribeCap,
  onChange,
  onCommit,
  onRemerge,
  onCreateTranscript,
}: {
  transcript: string;
  canRemerge: boolean;
  canTranscribe: boolean;
  transcribing: boolean;
  transcribeUsed: number;
  transcribeCap: number;
  onChange: (next: string) => void;
  onCommit: () => void;
  onRemerge: () => void;
  onCreateTranscript: () => void;
}) {
  return (
    <div className="space-y-3">
      {(canTranscribe || canRemerge) && (
        <div className="flex flex-wrap items-center gap-2">
          {canTranscribe && (
            <CreateTranscriptButton
              busy={transcribing}
              disabled={transcribeUsed >= transcribeCap}
              used={transcribeUsed}
              cap={transcribeCap}
              onClick={onCreateTranscript}
            />
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

      {note && !note.finalized && (
        <div
          className="flex items-center justify-end border-t pt-3"
          style={{ borderColor: 'var(--color-pt-border)' }}
        >
          <PtButton
            variant="primary"
            iconLeft={<CheckCircle2 size={14} strokeWidth={2} />}
            onClick={onFinalize}
          >
            End &amp; sign
          </PtButton>
        </div>
      )}
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
}: {
  id: string;
  stepNum: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`accordion-body-${id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 text-left transition-colors hover:bg-[var(--color-pt-surface-alt)]"
        style={{ padding: '12px 16px', cursor: 'pointer' }}
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
          {meta}
          <ChevronDown
            size={16}
            strokeWidth={2}
            style={{
              color: 'var(--color-fg-subtle)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease-out',
              flexShrink: 0,
            }}
          />
        </div>
      </button>

      {/* CSS grid row trick: animates height without JS measurement */}
      <div
        id={`accordion-body-${id}`}
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
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

type StepState = 'pending' | 'active' | 'done';

function StepProgress({
  sessionStatus,
  hasClips,
  transcript,
  note,
}: {
  sessionStatus: string;
  hasClips: boolean;
  transcript: string;
  note: Note | undefined;
}) {
  const hasTranscript = Boolean(transcript.trim());
  const hasNoteContent = note?.sections.some((s) => s.body.trim());

  const recordingState: StepState =
    sessionStatus === 'recording' || sessionStatus === 'paused'
      ? 'active'
      : hasClips
        ? 'done'
        : 'pending';

  const transcriptState: StepState =
    sessionStatus === 'transcribing'
      ? 'active'
      : hasTranscript
        ? 'done'
        : 'pending';

  const notesState: StepState =
    sessionStatus === 'finalized'
      ? 'done'
      : sessionStatus === 'generating' || sessionStatus === 'ready' || hasNoteContent
        ? 'active'
        : 'pending';

  const steps: { label: string; state: StepState }[] = [
    { label: 'Recording', state: recordingState },
    { label: 'Transcription', state: transcriptState },
    { label: 'Notes', state: notesState },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '7px 22px',
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
      }}
    >
      {steps.map((step, i) => (
        <StepProgressItem key={step.label} step={step} isLast={i === steps.length - 1} />
      ))}
    </div>
  );
}

function StepProgressItem({
  step,
  isLast,
}: {
  step: { label: string; state: StepState };
  isLast: boolean;
}) {
  const dotColor =
    step.state === 'done'
      ? 'var(--color-positive, #16a34a)'
      : step.state === 'active'
        ? 'var(--color-pt-blue, #2563eb)'
        : 'var(--color-pt-border)';
  const labelColor =
    step.state === 'pending' ? 'var(--color-fg-subtle)' : 'var(--color-fg-muted)';

  return (
    <>
      <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            transition: 'background 300ms ease',
          }}
        />
        <span className="text-[11px]" style={{ color: labelColor }}>
          {step.label}
        </span>
      </div>
      {!isLast && (
        <div
          style={{
            flex: 1,
            height: 1,
            margin: '0 8px',
            background: 'var(--color-pt-border)',
            minWidth: 20,
          }}
        />
      )}
    </>
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

function mergeClipTranscripts(clips: SessionClip[]): string {
  return clips
    .filter((c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => c.transcript!.trim())
    .join('\n\n');
}

// Strips provider prefixes for a compact display label.
// @cf/deepgram/nova-3 → nova-3 | claude-sonnet-4-6 → sonnet-4-6
function modelLabel(_provider: string, model: string): string {
  const short = model.split('/').pop() ?? model;
  return short.replace(/^claude-/, '');
}
