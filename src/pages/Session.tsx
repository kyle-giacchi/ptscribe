import { useEffect, useMemo, useRef, useState } from 'react';
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
import { generateNote } from '@/services/ai/generate';
import { renderNoteMarkdown, renderNotePlainText } from '@/lib/clinical/noteFormat';
import { downloadNotePDF } from '@/lib/pdf/NotePDF';
import { downloadFile } from '@/utils/download';
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
} from '@/types';

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

  // Initial transcript captured ONCE per session (component is keyed on sessionId).
  const [transcript, setTranscript] = useState(session?.transcript ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Tracks the clip currently being recorded, so stop() knows which clip to update.
  const activeClipIdRef = useRef<string | null>(null);
  // Guards the auto-rotate effect against double-firing while the stop→start
  // round-trip is in flight (the duration tick keeps incrementing during stop).
  const rotatingRef = useRef(false);

  // ── Atomic session/clip patches via functional slice update ──────────────
  // Per-clip transitions need functional setState because the slice mutator
  // captures `sessions` by closure and would lose intermediate writes when
  // called twice in the same callback.
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
  // Pending clips left over from an interrupted recording are reconstituted
  // from their WAL chunks. A clip with no chunks is marked 'failed' so the
  // clinician can decide whether to delete it.
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
        toast.success(
          `Recovered ${recovered} interrupted clip${recovered === 1 ? '' : 's'}.`,
        );
      }
      if (abandoned > 0) {
        toast.error(`${abandoned} clip${abandoned === 1 ? '' : 's'} could not be recovered.`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per mount; sessionId is stable because the component is keyed on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const sortedClips = useMemo(
    () => (session ? [...session.clips].sort((a, b) => a.createdAt - b.createdAt) : []),
    [session],
  );

  // ── Auto-rotate when a clip approaches the Cloudflare Whisper limit ──────
  // We watch the live duration tick; when a recording crosses MAX_CLIP_DURATION_SEC,
  // stop the current clip and immediately start a fresh one. References below
  // (handleStopRecording / handleStartRecording) are function declarations,
  // so they're hoisted into this scope and safe to invoke from the async body.
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
    // We intentionally only depend on the recorder tick — handlers are read fresh
    // each render via closure, and re-subscribing on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.status, recorder.durationSec]);

  if (!session || !patient) return <NotFound />;

  function ensureNote(initialSections?: NoteSection[]): Note {
    if (note) return note;
    const now = Date.now();
    const sections =
      initialSections ??
      (template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ?? []);
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
    // Compute index inside the functional patch so concurrent stop→start
    // (e.g. auto-rotation) sees the post-stop clip count, not a stale snapshot.
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
        // No blob produced — drop the placeholder clip.
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

  // ── Transcription ────────────────────────────────────────────────────────
  async function transcribeClipBlob(clip: SessionClip): Promise<
    { ok: true; text: string } | { ok: false; error: string }
  > {
    try {
      const blob = await audioRepository.load(clip.id);
      if (!blob) return { ok: false, error: 'No audio found for this clip.' };
      const result = await transcribe({
        blob,
        provider: settings.ai.transcription.provider,
        model: settings.ai.transcription.model,
      });
      return { ok: true, text: result.text };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async function handleTranscribeAll() {
    if (!session) return;
    if (settings.ai.transcription.provider !== 'cloudflare') {
      toast.error('Switch transcription to Cloudflare in Settings to transcribe saved clips.');
      return;
    }
    const targets = session.clips.filter(
      (c) => c.status === 'ready' || c.status === 'failed' || c.status === 'transcribed',
    );
    if (targets.length === 0) {
      toast.error('No clips to transcribe yet.');
      return;
    }

    setBusy('transcribing');
    patchSession({ status: 'transcribing' });
    patchClips((clips) =>
      clips.map((c) =>
        targets.some((t) => t.id === c.id)
          ? {
              ...c,
              status: 'transcribing' as ClipStatus,
              errorMessage: undefined,
              updatedAt: Date.now(),
            }
          : c,
      ),
    );

    let failures = 0;
    let successes = 0;
    for (const clip of targets) {
      const result = await transcribeClipBlob(clip);
      if (result.ok) {
        successes += 1;
        patchClip(clip.id, {
          status: 'transcribed',
          transcript: result.text,
          transcriptedAt: Date.now(),
          errorMessage: undefined,
        });
      } else {
        failures += 1;
        patchClip(clip.id, {
          status: 'failed',
          errorMessage: result.error,
        });
      }
    }

    setBusy(null);
    patchSession({ status: 'draft' });
    if (successes > 0 && failures === 0) toast.success(`Transcribed ${successes} clip${successes === 1 ? '' : 's'}.`);
    else if (successes > 0 && failures > 0)
      toast.error(`${successes} transcribed, ${failures} failed. Try Transcribe all again to retry.`);
    else toast.error('Transcription failed for all clips.');
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
      });
      const target = ensureNote(result.sections);
      updateNote(target.id, {
        sections: result.sections,
        templateId: template.id,
        format: template.format,
      });
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
    for (const clip of session?.clips ?? []) {
      try {
        await audioRepository.remove(clip.id);
      } catch {
        /* ignore */
      }
    }
    removeSession(session!.id);
    navigate('/', { replace: true });
  }

  const hasClips = session.clips.length > 0;
  const micState = deriveMicState(recorder.status);
  const sessionStatusBadge = deriveSessionBadge(session.status, hasClips);
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: '100%' }}>
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
      />

      <div
        style={{
          padding: 22,
          background: 'var(--color-pt-surface-alt)',
          overflow: 'auto',
          display: 'grid',
          gap: 18,
          alignContent: 'start',
        }}
      >
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <RecordingPanel
          recorder={recorder}
          live={live}
          clips={sortedClips}
          webspeechProvider={settings.ai.transcription.provider === 'webspeech'}
          cloudflareProvider={settings.ai.transcription.provider === 'cloudflare'}
          busy={busy}
          onStart={handleStartRecording}
          onStop={handleStopRecording}
          onPauseResume={handlePauseResume}
          onTranscribeAll={handleTranscribeAll}
          onRemerge={handleRemergeFromClips}
          onDeleteClip={handleDeleteClip}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: 18,
            alignItems: 'start',
          }}
        >
          <NotePanel
            session={session}
            patient={patient}
            note={note}
            template={template}
            templates={templates}
            transcript={transcript}
            busy={busy}
            onTemplateChange={(id) => patchSession({ templateId: id })}
            onGenerate={handleGenerate}
            onFinalize={handleFinalize}
            onUnfinalize={handleUnfinalize}
            onSectionChange={handleSectionChange}
          />

          <TranscriptPanel
            transcript={transcript}
            onChange={setTranscript}
            onCommit={() =>
              patchSession({
                transcript,
                transcriptSource: session.transcriptSource ?? 'manual',
              })
            }
          />
        </div>
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

interface RecordingPanelProps {
  recorder: UseRecorder;
  live: UseLiveTranscript;
  clips: SessionClip[];
  webspeechProvider: boolean;
  cloudflareProvider: boolean;
  busy: Busy;
  onStart: () => void;
  onStop: () => void;
  onPauseResume: () => void;
  onTranscribeAll: () => void;
  onRemerge: () => void;
  onDeleteClip: (clipId: string) => void;
}

function RecordingPanel({
  recorder,
  live,
  clips,
  webspeechProvider,
  cloudflareProvider,
  busy,
  onStart,
  onStop,
  onPauseResume,
  onTranscribeAll,
  onRemerge,
  onDeleteClip,
}: RecordingPanelProps) {
  const recording = recorder.status === 'recording' || recorder.status === 'paused';
  const minutes = Math.floor(recorder.durationSec / 60);
  const seconds = Math.floor(recorder.durationSec % 60);
  const idle =
    recorder.status === 'idle' || recorder.status === 'stopped' || recorder.status === 'error';

  const hasReadyClip = clips.some(
    (c) => c.status === 'ready' || c.status === 'failed' || c.status === 'transcribed',
  );
  const hasTranscribedClip = clips.some((c) => c.status === 'transcribed');
  const transcribing = busy === 'transcribing';
  const nearingLimit = recording && recorder.durationSec >= WARN_CLIP_DURATION_SEC;
  const timerColor = nearingLimit
    ? 'var(--color-caution)'
    : recording
      ? 'var(--color-negative)'
      : 'var(--color-fg-subtle)';

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          Recording
        </h2>
        <div className="flex items-center gap-3">
          {nearingLimit && (
            <span
              className="text-[11px]"
              style={{ color: 'var(--color-caution)' }}
              title={`Auto-rotates to a new clip at ${Math.floor(MAX_CLIP_DURATION_SEC / 60)} min`}
            >
              Approaching clip limit
            </span>
          )}
          <span
            className="font-mono text-sm tabular-nums"
            style={{ color: timerColor }}
          >
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          {recording && <PulseDot />}
        </div>
      </div>

      <RecordingControlRow
        idle={idle}
        recording={recording}
        paused={recorder.status === 'paused'}
        hasClips={clips.length > 0}
        canTranscribe={hasReadyClip && !recording && cloudflareProvider}
        canRemerge={hasTranscribedClip}
        transcribing={transcribing}
        onStart={onStart}
        onPauseResume={onPauseResume}
        onStop={onStop}
        onTranscribeAll={onTranscribeAll}
        onRemerge={onRemerge}
      />

      <RecordingNotices
        recorderError={recorder.error}
        webspeechProvider={webspeechProvider}
        liveSupported={live.supported}
      />

      <ClipsList
        clips={clips}
        recordingDisabled={recording}
        onDeleteClip={onDeleteClip}
      />

      <LiveTranscriptPreview live={live} />
    </section>
  );
}

function RecordingControlRow({
  idle,
  paused,
  hasClips,
  canTranscribe,
  canRemerge,
  transcribing,
  onStart,
  onPauseResume,
  onStop,
  onTranscribeAll,
  onRemerge,
}: {
  idle: boolean;
  recording: boolean;
  paused: boolean;
  hasClips: boolean;
  canTranscribe: boolean;
  canRemerge: boolean;
  transcribing: boolean;
  onStart: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onTranscribeAll: () => void;
  onRemerge: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {idle ? (
        <button type="button" className="btn btn-primary" onClick={onStart}>
          <Mic size={14} strokeWidth={2} /> {hasClips ? 'Add clip' : 'Start recording'}
        </button>
      ) : (
        <ActiveRecordingControls paused={paused} onPauseResume={onPauseResume} onStop={onStop} />
      )}
      {canTranscribe && <TranscribeAllButton busy={transcribing} onClick={onTranscribeAll} />}
      {canRemerge && (
        <button type="button" className="btn btn-ghost" onClick={onRemerge}>
          <Layers size={14} strokeWidth={2} /> Re-merge from clips
        </button>
      )}
    </div>
  );
}

function RecordingNotices({
  recorderError,
  webspeechProvider,
  liveSupported,
}: {
  recorderError: string | null;
  webspeechProvider: boolean;
  liveSupported: boolean;
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
          This browser doesn't support live transcription. Add a Cloudflare account ID + API token
          in Settings to transcribe recordings.
        </p>
      )}
    </>
  );
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

function TranscribeAllButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClick}>
      {busy ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Transcribing…
        </>
      ) : (
        <>
          <RefreshCw size={14} strokeWidth={2} /> Transcribe all
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
        No clips yet. Press <strong>Start recording</strong> to capture the first one.
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
              <Clock size={11} className="inline -mt-0.5" /> {formatDuration(clip.durationSec)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-pt-text-3)' }}>
              {new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {clip.errorMessage && (
            <p
              className="mt-1 break-words text-[11px]"
              style={{ color: 'var(--color-negative)' }}
            >
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
            className="mt-1 whitespace-pre-wrap text-xs leading-relaxed"
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
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
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

function TranscriptPanel({
  transcript,
  onChange,
  onCommit,
}: {
  transcript: string;
  onChange: (next: string) => void;
  onCommit: () => void;
}) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          Transcript
        </h2>
        <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
          {transcript.trim() ? `${wordCount(transcript)} words` : 'Empty'}
        </span>
      </div>
      <textarea
        className="input min-h-40 leading-relaxed"
        placeholder="Speak while recording, paste in a transcript, or type freely."
        value={transcript}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
    </section>
  );
}

interface NotePanelProps {
  session: Session;
  patient: Patient;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  transcript: string;
  busy: Busy;
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
  onTemplateChange,
  onGenerate,
  onFinalize,
  onUnfinalize,
  onSectionChange,
}: NotePanelProps) {
  const sections: NoteSection[] =
    note?.sections ??
    template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
    [];

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
            Note
          </h2>
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
        </div>
        <NoteActions
          note={note}
          busy={busy}
          canGenerate={transcript.trim().length > 0}
          onGenerate={onGenerate}
          onFinalize={onFinalize}
          onUnfinalize={onUnfinalize}
        />
      </div>

      {note?.finalized && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-positive)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-positive)',
          }}
        >
          Finalized {note.finalizedAt ? new Date(note.finalizedAt).toLocaleString() : ''} — unlock to edit.
        </div>
      )}

      <NoteEditor
        sections={sections}
        readOnly={!!note?.finalized}
        onChange={onSectionChange}
      />

      {note && template && <NoteExportRow note={note} template={template} patient={patient} />}
    </section>
  );
}

function NoteActions({
  note,
  busy,
  canGenerate,
  onGenerate,
  onFinalize,
  onUnfinalize,
}: {
  note: Note | undefined;
  busy: Busy;
  canGenerate: boolean;
  onGenerate: () => void;
  onFinalize: () => void;
  onUnfinalize: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy === 'generating' || !canGenerate}
        onClick={onGenerate}
      >
        {busy === 'generating' ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles size={14} strokeWidth={2} /> Generate from transcript
          </>
        )}
      </button>
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
          <div
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            {s.label}
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
          downloadFile(`${fileBase()}.md`, renderNoteMarkdown(note, template, patient), 'text/markdown')
        }
      >
        <Download size={12} strokeWidth={2} /> Download .md
      </button>
      <button
        type="button"
        className="btn btn-secondary text-xs"
        onClick={() =>
          downloadFile(`${fileBase()}.txt`, renderNotePlainText(note, template, patient), 'text/plain')
        }
      >
        <FileText size={12} strokeWidth={2} /> Download .txt
      </button>
    </div>
  );
}

function PulseDot() {
  return (
    <span
      className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
      style={{ background: 'var(--color-negative)' }}
      aria-hidden
    />
  );
}

function wordCount(s: string): number {
  return s.trim() === '' ? 0 : s.trim().split(/\s+/).length;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function mergeClipTranscripts(clips: SessionClip[]): string {
  return clips
    .filter((c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => c.transcript!.trim())
    .join('\n\n');
}

function labelForType(t: string): string {
  switch (t) {
    case 'evaluation':
      return 'Initial Evaluation';
    case 'progress':
      return 'Progress note';
    case 'discharge':
      return 'Discharge';
    default:
      return 'Follow-up';
  }
}
