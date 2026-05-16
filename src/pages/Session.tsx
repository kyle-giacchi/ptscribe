import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  LockOpen,
  Mic,
  Trash2,
  Upload,
} from 'lucide-react';
import { MicStatusPill, PtButton, type MicState } from '@/components/design';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAppData } from '@/contexts/AppDataProvider';
import { useRecorder } from '@/hooks/useRecorder';
import { useLiveTranscript } from '@/hooks/useLiveTranscript';
import { renderNoteMarkdown } from '@/lib/clinical/noteFormat';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import type { Session, SessionClip } from '@/types';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useAutoRotateClip } from '@/hooks/useAutoRotateClip';
import { mergeClipTranscripts, getTranscribableClips } from '@/utils/clips';
import { useRecordingFlow } from '@/hooks/useRecordingFlow';
import { useTranscriptionFlow, MAX_TRANSCRIBES_PER_SESSION } from '@/hooks/useTranscriptionFlow';
import { useGenerationFlow, MAX_GENERATES_PER_SESSION } from '@/hooks/useGenerationFlow';
import { RecordingPanel } from '@/components/sessions/RecordingPanel';
import { ClipsList } from '@/components/sessions/ClipsList';
import { AudioPreviewSection } from '@/components/sessions/AudioPreviewSection';
import { TranscriptPanel } from '@/components/sessions/TranscriptPanel';
import { NotePanel } from '@/components/sessions/NotePanel';
import { DebugDrawer } from '@/components/sessions/DebugDrawer';
import { SessionTabBar } from '@/components/sessions/SessionTabBar';

type Busy = null | 'transcribing' | 'generating';

export function SessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <SessionRoute key={id} sessionId={id} />;
}

function SessionRoute({ sessionId }: { sessionId: string }) {
  const { getSession } = useSessions();
  const { getPatient } = usePatients();
  const { forSession } = useNotes();
  const { templates, getTemplate } = useTemplates();
  const { settings } = useSettings();
  const { updateSessionsSlice } = useAppData();

  const session = getSession(sessionId);
  const patient = session ? getPatient(session.patientId) : undefined;
  const note = session ? forSession(session.id) : undefined;
  const template = getTemplate(session?.templateId ?? '') ?? templates[0];

  const recorder = useRecorder({ limits: settings.recordingLimits });
  const live = useLiveTranscript();

  // ── URL params — read before first render so initial tab/mode are correct ──
  const [searchParams, setSearchParams] = useSearchParams();
  const quickMode = searchParams.get('mode') === 'quick';

  // Initial transcript captured ONCE per session (component is keyed on sessionId).
  const [transcript, setTranscript] = useState(session?.transcript ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingSkipped, setRecordingSkipped] = useState(quickMode);
  const [pendingDeleteSession, setPendingDeleteSession] = useState(false);

  const [activeTab, setActiveTab] = useState<'record' | 'review' | 'clips'>(quickMode ? 'review' : 'record');
  // Once dismissed per session, the re-record warning does not resurface.
  const [recordWarnDismissed, setRecordWarnDismissed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [silenceDebugOn, setSilenceDebugOn] = useState(false);
  const [speedDebugOn, setSpeedDebugOn] = useState(false);

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

  // ── Transcription flow (must be initialised before recording flow because
  // recording's stop/upload handlers schedule the local-Whisper background pass). ──
  const transcription = useTranscriptionFlow({
    session,
    settings,
    setTranscript,
    patchSession,
    patchClips,
    patchClip,
    setBusy,
  });
  const {
    mergedAudioBlob,
    setMergedAudioBlob,
    isMerging,
    setIsMerging,
    debugStats,
    transcribeUsed,
    generateUsed,
    checkActionGuard,
    recordAction,
    handleCreateTranscript,
    handleRevertToLocal,
    handleRemergeFromClips,
  } = transcription;

  // ── Recording flow ───────────────────────────────────────────────────────
  const recording = useRecordingFlow({
    session,
    recorder,
    live,
    sortedClips,
    patchSession,
    patchClips,
    patchClip,
    setError,
    setActiveTab,
    setTranscript,
    setMergedAudioBlob,
    setIsMerging,
  });
  const {
    backgroundWarningDismissed,
    setBackgroundWarningDismissed,
    whisperLiveText,
    handleStartRecording,
    handleStopRecording,
    handlePauseResume,
    handleStopAndFinish,
    handleUploadAudio,
    handleDeleteClip,
    handleRecordingComplete,
  } = recording;

  useAutoRotateClip(
    recorder.status,
    recorder.durationSec,
    handleStopRecording,
    handleStartRecording,
  );

  // ── Note/generation flow ─────────────────────────────────────────────────
  const generation = useGenerationFlow({
    session,
    patient,
    note,
    template,
    settings,
    transcript,
    patchSession,
    setError,
    setBusy,
    setTranscript,
    setActiveTab,
    setPendingDeleteSession,
    checkActionGuard,
    recordAction,
  });
  const {
    handleGenerate,
    handleSectionChange,
    handleFinalize,
    handleUnfinalize,
    handleDeleteSession,
    handleCopyNoteMarkdown,
    missingRequiredLabels,
  } = generation;

  // ── ?autoRecord=1 deep link auto-start ──────────────────────────────────
  // Lets Dashboard / NewSession links jump straight into recording with one tap.
  // Guards: only fires once per mount, only when recorder is idle and no clips
  // exist yet (so refreshing a populated session never re-records).
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

  if (!session || !patient) return <NotFound />;

  // ── Copy full note ────────────────────────────────────────────────────────
  function handleCopyNote() {
    if (!note || !template) return;
    const md = renderNoteMarkdown(note, template, patient!);
    handleCopyNoteMarkdown(md);
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

  // ── Skip recording step ───────────────────────────────────────────────────
  function handleSkipRecording() {
    setRecordingSkipped(true);
    setActiveTab('review');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── Error banner ──────────────────────────────────── */}
      {error && (
        <div style={{ padding: '12px 22px 0' }}>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* ── Tab bar ───────────────────────────────────────── */}
      <SessionTabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        clipsCount={sortedClips.length}
        noteFinalized={note?.finalized}
        hasNote={!!note}
        onOpenDrawer={() => setDrawerOpen(true)}
        recorderStatus={recorder.status}
        durationSec={recorder.durationSec}
        onStartRecording={() => { setActiveTab('record'); void handleStartRecording(); }}
        onStopRecording={handleStopRecording}
        onStopAndFinish={handleStopAndFinish}
        onPauseResume={handlePauseResume}
      />

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
          <div style={{ maxWidth: 960, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            <RecordingPanel
              recorder={recorder}
              live={live}
              clips={sortedClips}
              whisperLiveText={whisperLiveText}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
              onStopAndFinish={() => { void handleStopAndFinish(); setActiveTab('review'); }}
              onPauseResume={handlePauseResume}
              onUpload={handleUploadAudio}
              onSkip={handleSkipRecording}
              wasBackgrounded={recorder.wasBackgrounded && !backgroundWarningDismissed}
              onDismissBackgroundWarning={() => setBackgroundWarningDismissed(true)}
            />
          </div>
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
            <div style={{ maxWidth: 680, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {quickMode && (
                <div
                  style={{
                    padding: '9px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--color-pt-border)',
                    background: 'var(--color-pt-surface-mut)',
                    fontSize: 12.5,
                    color: 'var(--color-pt-text-3)',
                    lineHeight: 1.5,
                  }}
                >
                  Quick note mode — type your note directly in the sections below. You can still
                  record audio from the Record tab if needed.
                </div>
              )}
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 0',
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'var(--color-pt-border)' }} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: 'var(--color-fg-subtle)',
                  }}
                >
                  Note
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--color-pt-border)' }} />
              </div>
              <NotePanel
                patient={patient}
                note={note}
                template={template}
                templates={templates}
                transcript={transcript}
                totalDurationSec={sortedClips.reduce((sum, c) => sum + (c.durationSec ?? 0), 0)}
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
            </div>
          ))}
        {/* ③ Clips tab */}
        {activeTab === 'clips' && (
          <div style={{ maxWidth: 680, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setActiveTab('record'); void handleStartRecording(); }}
                style={{ minHeight: 44, touchAction: 'manipulation' }}
              >
                <Mic size={14} strokeWidth={2} /> Add clip
              </button>
              <label className="btn btn-ghost cursor-pointer" style={{ minHeight: 44, touchAction: 'manipulation' }}>
                <Upload size={14} strokeWidth={2} /> Upload audio
                <input
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { void handleUploadAudio(file); e.target.value = ''; }
                  }}
                />
              </label>
            </div>
            <ClipsList clips={sortedClips} recordingDisabled={isRecording} onDeleteClip={handleDeleteClip} />
            {sortedClips.length > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  className="btn btn-primary w-full sm:w-auto"
                  disabled={isMerging || isRecording}
                  onClick={() => { void handleRecordingComplete(); setActiveTab('review'); }}
                  style={{ minHeight: 44, touchAction: 'manipulation' }}
                >
                  {isMerging ? (
                    <><Loader2 size={15} className="animate-spin" /> Combining clips…</>
                  ) : (
                    <><CheckCircle2 size={15} strokeWidth={2} /> Generate Notes</>
                  )}
                </button>
              </div>
            )}
            {mergedAudioBlob && <AudioPreviewSection mergedAudioBlob={mergedAudioBlob} />}
          </div>
        )}
      </div>

      {/* ── Bottom action bar (review tab only) ─────────────── */}
      {activeTab === 'review' && <div
        className="flex items-center gap-3 rounded-lg px-4 py-3"
        style={{
          margin: '0 22px 22px',
          paddingBottom: 'env(safe-area-inset-bottom)',
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
      </div>}

      {/* ── Debug drawer ──────────────────────────────────── */}
      {drawerOpen && (
        <DebugDrawer
          onClose={() => setDrawerOpen(false)}
          silenceDebugOn={silenceDebugOn}
          setSilenceDebugOn={setSilenceDebugOn}
          speedDebugOn={speedDebugOn}
          setSpeedDebugOn={setSpeedDebugOn}
          debugStats={debugStats}
          speedFactor={settings.audio.speedUp.speed}
        />
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

