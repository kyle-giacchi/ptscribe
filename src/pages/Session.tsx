import { useState } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Field, Select } from '@/components/ui/Field';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useSettings } from '@/contexts/SettingsProvider';
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
import { newId } from '@/utils/ids';
import type {
  Note,
  NoteFormat,
  NoteSection,
  NoteTemplate,
  Patient,
  Session,
} from '@/types';

type Busy = null | 'transcribing' | 'generating';

export function SessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <SessionRoute key={id} sessionId={id} />;
}

function SessionRoute({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const { getSession, updateSession, removeSession, setStatus } = useSessions();
  const { getPatient } = usePatients();
  const { forSession, addNote, updateNote, finalizeNote, unfinalizeNote, removeNote } = useNotes();
  const { templates, getTemplate } = useTemplates();
  const { settings } = useSettings();

  const session = getSession(sessionId);
  const patient = session ? getPatient(session.patientId) : undefined;
  const note = session ? forSession(session.id) : undefined;
  const template = getTemplate(session?.templateId ?? '') ?? templates[0];

  const recorder = useRecorder();
  const live = useLiveTranscript();

  // Initial transcript is captured ONCE per session (component is keyed on sessionId).
  const [transcript, setTranscript] = useState(session?.transcript ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session || !patient) return <NotFound />;

  function ensureNote(initialSections?: NoteSection[]): Note {
    if (note) return note;
    // eslint-disable-next-line react-hooks/purity
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
    updateSession(session!.id, { noteId: created.id });
    return created;
  }

  async function handleStartRecording() {
    setError(null);
    await recorder.start();
    if (settings.ai.transcription.provider === 'webspeech' && live.supported) {
      live.reset();
      live.start();
    }
    setStatus(session!.id, 'recording');
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
    const finalBlob = await recorder.stop();
    live.stop();
    if (finalBlob) {
      try {
        await audioRepository.save(session!.id, finalBlob);
        updateSession(session!.id, { audioRef: session!.id, status: 'draft' });
      } catch (e) {
        setError(`Could not save audio: ${(e as Error).message}`);
      }
    }
    if (live.finalText.trim()) {
      const merged = `${transcript} ${live.finalText}`.replace(/\s+/g, ' ').trim();
      setTranscript(merged);
      updateSession(session!.id, { transcript: merged, transcriptSource: 'webspeech' });
    }
  }

  async function handleTranscribe() {
    if (settings.ai.transcription.provider !== 'openai') {
      toast.error('OpenAI key required for batch transcription. Set one in Settings.');
      return;
    }
    setError(null);
    setBusy('transcribing');
    setStatus(session!.id, 'transcribing');
    try {
      const blob = await audioRepository.load(session!.id);
      if (!blob) throw new Error('No audio recording found for this session.');
      const result = await transcribe({
        blob,
        provider: settings.ai.transcription.provider,
        model: settings.ai.transcription.model,
        apiKey: settings.ai.transcription.apiKey,
      });
      setTranscript(result.text);
      updateSession(session!.id, {
        transcript: result.text,
        transcriptSource: result.source,
        status: 'draft',
      });
      toast.success('Transcript ready');
    } catch (e) {
      setError((e as Error).message);
      setStatus(session!.id, 'draft');
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate() {
    if (!template) return;
    if (!transcript.trim()) {
      toast.error('Add a transcript first.');
      return;
    }
    if (settings.ai.generation.provider !== 'anthropic' || !settings.ai.generation.apiKey) {
      toast.error('Anthropic API key required. Add one in Settings.');
      return;
    }
    setError(null);
    setBusy('generating');
    setStatus(session!.id, 'generating');
    try {
      const result = await generateNote({
        provider: settings.ai.generation.provider,
        model: settings.ai.generation.model,
        apiKey: settings.ai.generation.apiKey,
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
      updateSession(session!.id, { status: 'ready' });
      toast.success('Draft note generated');
    } catch (e) {
      setError((e as Error).message);
      setStatus(session!.id, 'draft');
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
    setStatus(session!.id, 'finalized');
    toast.success('Note finalized');
  }
  function handleUnfinalize() {
    if (!note) return;
    unfinalizeNote(note.id);
    setStatus(session!.id, 'ready');
  }

  async function handleDeleteSession() {
    if (!confirm('Delete this session, its audio, and any draft note?')) return;
    if (note) removeNote(note.id);
    try {
      await audioRepository.remove(session!.id);
    } catch {
      /* ignore */
    }
    removeSession(session!.id);
    navigate('/', { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to={`/patients/${patient.id}`} className="btn btn-ghost w-fit">
        <ArrowLeft size={14} strokeWidth={2} /> {patient.firstName} {patient.lastName}
      </Link>

      <PageHeader
        title={`${patient.firstName} ${patient.lastName}`}
        subtitle={`${labelForType(session.type)} · ${new Date(session.date).toLocaleString()}`}
        Icon={Mic}
        actions={
          <button
            type="button"
            className="btn btn-ghost text-xs"
            style={{ color: 'var(--color-negative)' }}
            onClick={handleDeleteSession}
          >
            <Trash2 size={12} strokeWidth={2} /> Delete session
          </button>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <RecordingPanel
        recorder={recorder}
        live={live}
        sessionId={session.id}
        webspeechProvider={settings.ai.transcription.provider === 'webspeech'}
        openaiProvider={settings.ai.transcription.provider === 'openai'}
        hasAudio={!!session.audioRef}
        busy={busy}
        onStart={handleStartRecording}
        onStop={handleStopRecording}
        onPauseResume={handlePauseResume}
        onTranscribe={handleTranscribe}
      />

      <TranscriptPanel
        transcript={transcript}
        onChange={setTranscript}
        onCommit={() =>
          updateSession(session.id, {
            transcript,
            transcriptSource: session.transcriptSource ?? 'manual',
          })
        }
      />

      <NotePanel
        session={session}
        patient={patient}
        note={note}
        template={template}
        templates={templates}
        transcript={transcript}
        busy={busy}
        onTemplateChange={(id) => updateSession(session.id, { templateId: id })}
        onGenerate={handleGenerate}
        onFinalize={handleFinalize}
        onUnfinalize={handleUnfinalize}
        onSectionChange={handleSectionChange}
      />
    </div>
  );
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
  sessionId: string;
  webspeechProvider: boolean;
  openaiProvider: boolean;
  hasAudio: boolean;
  busy: Busy;
  onStart: () => void;
  onStop: () => void;
  onPauseResume: () => void;
  onTranscribe: () => void;
}

function RecordingPanel({
  recorder,
  live,
  sessionId,
  webspeechProvider,
  openaiProvider,
  hasAudio,
  busy,
  onStart,
  onStop,
  onPauseResume,
  onTranscribe,
}: RecordingPanelProps) {
  const recording = recorder.status === 'recording' || recorder.status === 'paused';
  const minutes = Math.floor(recorder.durationSec / 60);
  const seconds = Math.floor(recorder.durationSec % 60);
  const idle =
    recorder.status === 'idle' || recorder.status === 'stopped' || recorder.status === 'error';

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          Recording
        </h2>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-sm tabular-nums"
            style={{ color: recording ? 'var(--color-negative)' : 'var(--color-fg-subtle)' }}
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
        hasAudio={hasAudio}
        canTranscribe={hasAudio && recorder.status !== 'recording' && openaiProvider}
        transcribing={busy === 'transcribing'}
        onStart={onStart}
        onPauseResume={onPauseResume}
        onStop={onStop}
        onTranscribe={onTranscribe}
      />

      <RecordingNotices
        recorderError={recorder.error}
        webspeechProvider={webspeechProvider}
        liveSupported={live.supported}
      />
      {hasAudio && recorder.status !== 'recording' && <PlaybackWaveform sessionId={sessionId} />}
      <LiveTranscriptPreview live={live} />
    </section>
  );
}

function RecordingControlRow({
  idle,
  paused,
  hasAudio,
  canTranscribe,
  transcribing,
  onStart,
  onPauseResume,
  onStop,
  onTranscribe,
}: {
  idle: boolean;
  recording: boolean;
  paused: boolean;
  hasAudio: boolean;
  canTranscribe: boolean;
  transcribing: boolean;
  onStart: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onTranscribe: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {idle ? (
        <button type="button" className="btn btn-primary" onClick={onStart}>
          <Mic size={14} strokeWidth={2} /> {hasAudio ? 'Re-record' : 'Start recording'}
        </button>
      ) : (
        <ActiveRecordingControls paused={paused} onPauseResume={onPauseResume} onStop={onStop} />
      )}
      {canTranscribe && <TranscribeButton busy={transcribing} onClick={onTranscribe} />}
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
          This browser doesn't support live transcription. Add an OpenAI API key in Settings to
          transcribe recordings.
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

function TranscribeButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClick}>
      {busy ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Transcribing…
        </>
      ) : (
        <>
          <RefreshCw size={14} strokeWidth={2} /> Transcribe (Whisper)
        </>
      )}
    </button>
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
