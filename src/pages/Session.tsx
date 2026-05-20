import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { SessionActionsContext } from '@/contexts/SessionActionsContext';
import { audioRepository } from '@/services/AudioRepository';
import { Modal } from '@/components/ui/Modal';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAppData } from '@/contexts/AppDataProvider';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import { useRecorder } from '@/hooks/useRecorder';
import { useWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import type { Session, SessionClip, NoteSection } from '@/types';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useAutoRotateClip } from '@/hooks/useAutoRotateClip';
import { useRecordingFlow } from '@/hooks/useRecordingFlow';
import { useTranscriptionFlow } from '@/hooks/useTranscriptionFlow';
import { useGenerationFlow, MAX_GENERATES_PER_SESSION } from '@/hooks/useGenerationFlow';
import { usePrivacyFilter } from '@/hooks/usePrivacyFilter';
import { RecordingPanel } from '@/components/sessions/RecordingPanel';
import { ClipsInspector } from '@/components/sessions/ClipsInspector';
import { TranscriptPanel } from '@/components/sessions/TranscriptPanel';
import type { TranscriptPanelHandle } from '@/components/sessions/TranscriptPanel';
import { NotePanel } from '@/components/sessions/NotePanel';
import { NoteToolbar } from '@/components/sessions/NoteToolbar';
import { renderNoteMarkdown } from '@/lib/clinical/noteFormat';
import { PhiConfirmDialog } from '@/components/sessions/PhiConfirmDialog';
import { WhisperUnavailableDialog } from '@/components/sessions/WhisperUnavailableDialog';
import { AiCallError } from '@/components/ai/AiCallError';
import { AiCallRetryStatus } from '@/components/ai/AiCallRetryStatus';
import { useWhisperLoading } from '@/hooks/useWhisperLoading';
import { DebugDrawer } from '@/components/sessions/DebugDrawer';
import { SessionTopBar } from '@/components/sessions/SessionTopBar';
import { ManageTemplatesModal } from '@/components/sessions/ManageTemplatesModal';
import { DemoCompleteModal } from '@/components/common/DemoCompleteModal';

type Busy = null | 'transcribing' | 'generating';

export function SessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <SessionRoute key={id} sessionId={id} />;
}

function SessionRoute({ sessionId }: { sessionId: string }) {
  const { getSession } = useSessions();
  const { getPatient, updatePatient } = usePatients();
  const { forSession, removeNote } = useNotes();
  const { templates, getTemplate } = useTemplates();
  const { settings, updateSession } = useSettings();
  const { updateSessionsSlice } = useAppData();

  const session = getSession(sessionId);
  const patient = session ? getPatient(session.patientId) : undefined;
  const note = session ? forSession(session.id) : undefined;
  const template = getTemplate(session?.templateId ?? '') ?? templates[0];

  const recorder = useRecorder({ limits: settings.recordingLimits });
  const webSpeech = useWebSpeechTranscript();

  // ── URL params — read before first render so initial tab/mode are correct ──
  const [searchParams, setSearchParams] = useSearchParams();
  const quickMode = searchParams.get('mode') === 'quick';

  // Initial transcript captured ONCE per session (component is keyed on sessionId).
  const [transcript, setTranscript] = useState(session?.transcript ?? '');
  const [editedTranscript, setEditedTranscript] = useState(session?.editedTranscript ?? '');
  const effectiveTranscript = editedTranscript.trim() ? editedTranscript : transcript;
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingSkipped, setRecordingSkipped] = useState(quickMode);
  const [pendingDeleteSession, setPendingDeleteSession] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'record' | 'review'>(quickMode ? 'review' : 'record');
  // Once dismissed per session, the re-record warning does not resurface.
  const [recordWarnDismissed, setRecordWarnDismissed] = useState(false);

  // ── Whisper recovery: session-scoped transcription provider override ─────
  const [transcriptionProviderOverride, setTranscriptionProviderOverride] = useState<
    'webspeech' | 'none' | null
  >(null);
  const [whisperDialogOpen, setWhisperDialogOpen] = useState(false);
  const [pendingStartRecording, setPendingStartRecording] = useState(false);
  const {
    loading: whisperLoading,
    failed: whisperFailed,
    retry: retryWhisperLoad,
  } = useWhisperLoading();
  const transcriptRef = useRef<TranscriptPanelHandle>(null);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024
  );
  const [clipsOpen, setClipsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [silenceDebugOn, setSilenceDebugOn] = useState(false);
  const [speedDebugOn, setSpeedDebugOn] = useState(false);
  const [sectionCache, setSectionCache] = useState<Map<string, NoteSection[]>>(new Map());
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [processingUploadClipId, setProcessingUploadClipId] = useState<string | null>(null);
  const processingStartedAtRef = useRef<number | null>(null);

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
    setEditedTranscript,
    patchSession,
    patchClips,
    patchClip,
    setBusy,
  });
  const {
    setMergedAudioBlob,
    setSilencedMergedBlob,
    setIsMerging,
    debugStats,
    generateUsed,
    checkActionGuard,
    recordAction,
    handleCreateTranscript,
    handleRevertToLocal,
    aiError: transcribeAiError,
    retryStatus: transcribeRetryStatus,
    clearAiError: clearTranscribeAiError,
  } = transcription;

  // ── Recording flow ───────────────────────────────────────────────────────
  const recording = useRecordingFlow({
    session,
    recorder,
    webSpeech,
    webSpeechEnabled: settings.session.webSpeechEnabled,
    transcriptionProviderOverride,
    sortedClips,
    patchSession,
    patchClips,
    patchClip,
    setError,
    setActiveTab,
    setTranscript,
    setMergedAudioBlob,
    setSilencedMergedBlob,
    setIsMerging,
  });
  const {
    backgroundWarningDismissed,
    setBackgroundWarningDismissed,
    whisperBubbles,
    uploadStatus,
    handleStartRecording,
    handleFinishedRecording,
    handlePauseResume,
    handleStopAndFinish,
    handleUploadAudio,
    handleDeleteClip,
    handleRecordingComplete,
  } = recording;

  useAutoRotateClip(
    recorder.status,
    recorder.durationSec,
    handleFinishedRecording,
    handleStartRecording,
  );

  // ── Whisper recovery: gate Start Recording behind dialog when preload failed ──
  function handleStartRecordingWithGate() {
    const provider = transcriptionProviderOverride ?? settings.ai.transcription.provider;
    if (provider === 'local' && whisperFailed) {
      setPendingStartRecording(true);
      setWhisperDialogOpen(true);
      return;
    }
    void handleStartRecording();
  }

  function handleUseWebSpeech() {
    setTranscriptionProviderOverride('webspeech');
    setWhisperDialogOpen(false);
    if (pendingStartRecording) {
      setPendingStartRecording(false);
      void handleStartRecording();
    }
  }

  function handleRecordWithoutTranscription() {
    setTranscriptionProviderOverride('none');
    setWhisperDialogOpen(false);
    if (pendingStartRecording) {
      setPendingStartRecording(false);
      void handleStartRecording();
    }
  }

  function handleCancelWhisperDialog() {
    setWhisperDialogOpen(false);
    setPendingStartRecording(false);
  }

  // Auto-close + proceed when the user's retry succeeds while the dialog is open.
  useEffect(() => {
    if (whisperDialogOpen && !whisperLoading && !whisperFailed && pendingStartRecording) {
      setWhisperDialogOpen(false);
      setPendingStartRecording(false);
      void handleStartRecording();
    }
    // handleStartRecording is a function declaration that closes over fresh state
    // each render — intentionally excluded from deps so we only fire on the
    // load-state transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whisperDialogOpen, whisperLoading, whisperFailed, pendingStartRecording]);

  // ── Note/generation flow ─────────────────────────────────────────────────
  const generation = useGenerationFlow({
    session,
    patient,
    note,
    template,
    settings,
    transcript: effectiveTranscript,
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
    handleGenerate: handleGenerateRaw,
    handleSectionChange,
    handleReplaceSections,
    handleFinalize,
    handleUnfinalize,
    handleCopyNoteMarkdown,
    missingRequiredLabels,
    lastRawPayload,
    aiError: generationAiError,
    retryStatus: generationRetryStatus,
    clearAiError: clearGenerationAiError,
  } = generation;

  // ── PHI confirmation gate before generation ─────────────────────────────
  // Always shown (regardless of PII filter state) unless user has dismissed it
  // via the "Don't show this again" checkbox.
  const [phiConfirmOpen, setPhiConfirmOpen] = useState(false);
  function handleGenerate() {
    if (settings.session.phiConfirmDismissed) {
      handleGenerateRaw();
    } else {
      setPhiConfirmOpen(true);
    }
  }
  function handlePhiConfirm(dontShowAgain: boolean) {
    setPhiConfirmOpen(false);
    if (dontShowAgain) updateSession({ phiConfirmDismissed: true });
    handleGenerateRaw();
  }

  function handleCopyNote() {
    if (!note || !template) return;
    const md = renderNoteMarkdown(note, template, patient!);
    handleCopyNoteMarkdown(md);
  }

  const { scrubbing: piiScrubbing, scrubProgress, scrub: scrubPIIFn } = usePrivacyFilter();

  const [demoCompleteOpen, setDemoCompleteOpen] = useState(false);

  function handleFinalizeWrapped() {
    handleFinalize();
    if (isDemoMode() && patient?.id === DEMO_PATIENT_ID) {
      updatePatient(DEMO_PATIENT_ID, { status: 'discharged', updatedAt: Date.now() });
      setDemoCompleteOpen(true);
    }
  }

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

  function handleCopyTranscript() {
    navigator.clipboard.writeText(effectiveTranscript).then(
      () => toast.success('Transcript copied'),
      () => toast.error('Copy failed'),
    );
  }

  function handleApplyScrub(scrubbed: string) {
    setEditedTranscript(scrubbed);
    patchSession({ editedTranscript: scrubbed, activeTranscriptTier: 'edited' });
  }

  function handleRevertEdits() {
    setEditedTranscript('');
    patchSession({ editedTranscript: undefined });
  }

  function handleTemplateChange(newTemplateId: string) {
    const newTpl = templates.find((t) => t.id === newTemplateId);
    if (!newTpl) return;
    // Snapshot sections for the template we're leaving
    if (note?.sections && session?.templateId) {
      setSectionCache((prev) => {
        const next = new Map(prev);
        next.set(session!.templateId!, note!.sections);
        return next;
      });
    }
    patchSession({ templateId: newTemplateId });
    // Restore cached sections for the incoming template, or reset to empty
    const cached = sectionCache.get(newTemplateId);
    const targetSections =
      cached ?? newTpl.sections.map((s) => ({ key: s.key, label: s.label, body: '' }));
    if (note) handleReplaceSections(targetSections);
  }

  // ── Derived display values ────────────────────────────────────────────────
  const canGenerate =
    effectiveTranscript.trim().length > 0 &&
    settings.ai.generation.provider === 'anthropic' &&
    generateUsed < MAX_GENERATES_PER_SESSION;

  const isTranscriptLocked = sortedClips.length === 0 && !effectiveTranscript.trim() && !recordingSkipped;
  const isRecording = recorder.status === 'recording' || recorder.status === 'paused';

  const hasT2Transcript = !!session.t2Transcript;

  const hasUserEdits = editedTranscript.trim().length > 0;

  // Show a strong warning when the user navigates back to Record after a note has been generated.
  const showRecordWarning = activeTab === 'record' && !recordWarnDismissed && !!note;

  const totalDurationSec = sortedClips.reduce((sum, c) => sum + (c.durationSec ?? 0), 0);

  // ── Skip recording step ───────────────────────────────────────────────────
  function handleSkipRecording() {
    setRecordingSkipped(true);
    setActiveTab('review');
  }

  // ── Reset session — wipe all recordings, transcripts, and the generated note ──
  async function handleResetSession() {
    setResetModalOpen(false);
    if (!session) return;
    if (isRecording) {
      toast.error('Stop recording before resetting the session.');
      return;
    }
    await Promise.allSettled(session.clips.map((c) => audioRepository.remove(c.id)));
    if (session.noteId) removeNote(session.noteId);
    patchSession({
      status: 'draft',
      clips: [],
      transcript: undefined,
      t1Transcript: undefined,
      t2Transcript: undefined,
      t3Transcript: undefined,
      editedTranscript: undefined,
      activeTranscriptTier: undefined,
      noteId: undefined,
      durationMin: undefined,
    });
    setTranscript('');
    setActiveTab('record');
    setMergedAudioBlob(null);
    setIsMerging(false);
    setError(null);
    setBusy(null);
    setRecordingSkipped(false);
  }

  // ── Upload audio + auto-transcribe ────────────────────────────────────────
  async function handleUpload(file: File) {
    const clipId = await handleUploadAudio(file);
    if (clipId) {
      processingStartedAtRef.current = Date.now();
      setProcessingUploadClipId(clipId);
    }
  }

  useEffect(() => {
    if (!processingUploadClipId) return;
    const clip = session?.clips.find((c) => c.id === processingUploadClipId);
    if (!clip) return;

    // T2 no longer runs per-clip — it fires after handleRecordingComplete builds
    // the combined blob. Treat 'ready' (audio saved) as "processing done" and call
    // handleRecordingComplete to create the combined blob, kick off T2, and navigate.
    if (clip.status === 'ready' || clip.status === 'transcribed' || clip.status === 'failed') {
      const elapsed = Date.now() - (processingStartedAtRef.current ?? Date.now());
      const delay = Math.max(0, 2000 - elapsed);
      const t = setTimeout(() => {
        setProcessingUploadClipId(null);
        void handleRecordingComplete();
      }, delay);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.clips, processingUploadClipId]);

  return (
    <SessionActionsContext.Provider value={{ onResetSession: () => setResetModalOpen(true) }}>
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── Error banner ──────────────────────────────────── */}
      {error && (
        <div style={{ padding: '12px 22px 0' }}>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* ── Top bar (replaces SessionTabBar) ──────────────── */}
      <SessionTopBar
        patient={patient}
        session={session}
        note={note}
        totalDurationSec={totalDurationSec}
        clipsCount={sortedClips.length}
        clipsOpen={clipsOpen}
        onToggleClips={() => setClipsOpen((o) => !o)}
        onRecord={() => setActiveTab('record')}
        onUpload={(file) => { void handleUpload(file); }}
        missingRequiredLabels={missingRequiredLabels}
        pendingDeleteSession={pendingDeleteSession}
        onFinalize={handleFinalizeWrapped}
        onUnfinalize={handleUnfinalize}
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
          <div role="tabpanel" id="panel-record" aria-labelledby="tab-record" style={{ maxWidth: 960, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(sortedClips.length > 0 || effectiveTranscript.trim().length > 0) && (
              <div>
                <button
                  type="button"
                  className="btn btn-ghost py-1 text-xs"
                  onClick={() => setActiveTab('review')}
                >
                  <ArrowLeft size={13} strokeWidth={2} /> Return to Notes
                </button>
              </div>
            )}
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
            {processingUploadClipId ? (
              <UploadProcessingView
                durationSec={sortedClips.find((c) => c.id === processingUploadClipId)?.durationSec}
              />
            ) : (
              <RecordingPanel
                recorder={recorder}
                webSpeech={webSpeech}
                clips={sortedClips}
                whisperBubbles={whisperBubbles}
                uploadStatus={uploadStatus}
                onStart={handleStartRecordingWithGate}
                onStopAndFinish={() => { void handleStopAndFinish(); setActiveTab('review'); }}
                onPauseResume={handlePauseResume}
                onUpload={handleUpload}
                onSkip={handleSkipRecording}
                wasBackgrounded={recorder.wasBackgrounded && !backgroundWarningDismissed}
                onDismissBackgroundWarning={() => setBackgroundWarningDismissed(true)}
              />
            )}
          </div>
        )}

        {/* ② Review tab */}
        {activeTab === 'review' &&
          (isTranscriptLocked ? (
            <div
              role="tabpanel"
              id="panel-review"
              aria-labelledby="tab-review"
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
            <div
              role="tabpanel"
              id="panel-review"
              aria-labelledby="tab-review"
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: transcriptCollapsed ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: 24,
                alignItems: 'start',
              }}
            >
              {/* ── Left: Clinical Note ── */}
              <div>
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
                      marginBottom: 12,
                    }}
                  >
                    Quick note mode — type your note directly in the sections below.
                  </div>
                )}
                {/* Title row */}
                <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-pt-text)', margin: 0 }}>
                    Clinical note
                  </h1>
                  {note && (
                    <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
                      {busy === 'generating'
                        ? 'Generating…'
                        : `last generated ${relativeTime(note.updatedAt)}`}
                    </span>
                  )}
                </div>

                <NoteToolbar
                  template={template}
                  templates={templates}
                  hasDraftContent={!!note?.sections.some((s) => s.body.trim().length > 0)}
                  canGenerate={canGenerate}
                  isGenerating={busy === 'generating'}
                  noteExists={!!note}
                  onTemplateChange={handleTemplateChange}
                  onManageTemplates={() => setManageTemplatesOpen(true)}
                  onGenerate={handleGenerate}
                  onCopyNote={handleCopyNote}
                />

                <NotePanel
                  patient={patient}
                  note={note}
                  template={template}
                  onSectionChange={handleSectionChange}
                />
                {generationRetryStatus ? (
                  <div style={{ marginTop: 8 }}>
                    <AiCallRetryStatus {...generationRetryStatus} />
                  </div>
                ) : null}
                {generationAiError ? (
                  <div style={{ marginTop: 8 }}>
                    <AiCallError
                      error={generationAiError}
                      onRetry={() => {
                        clearGenerationAiError();
                        void handleGenerateRaw();
                      }}
                      onDismiss={clearGenerationAiError}
                    />
                  </div>
                ) : null}
              </div>

              {/* ── Right: Transcript ── */}
              <div style={{ position: 'relative' }}>
                {transcriptCollapsed ? (
                  <button
                    type="button"
                    onClick={() => setTranscriptCollapsed(false)}
                    aria-label="Expand transcript panel"
                    style={{
                      position: 'absolute', top: 0, right: 0,
                      writingMode: 'vertical-rl',
                      height: 120, padding: '12px 6px',
                      border: '1px solid var(--color-pt-border)',
                      borderRight: 'none', borderRadius: '8px 0 0 8px',
                      background: 'var(--color-pt-surface)',
                      color: 'var(--color-pt-text-2)', cursor: 'pointer',
                      fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em',
                    }}
                  >
                    Transcript
                  </button>
                ) : (
                  <>
                    <TranscriptPanel
                      ref={transcriptRef}
                      transcript={effectiveTranscript}
                      clips={sortedClips}
                      transcribing={busy === 'transcribing'}
                      hasUserEdits={hasUserEdits}
                      hasT2Transcript={hasT2Transcript}
                      totalDurationSec={totalDurationSec}
                      collapsed={transcriptCollapsed}
                      onCollapse={() => setTranscriptCollapsed(true)}
                      onChange={setEditedTranscript}
                      onCommit={() => {
                        if (editedTranscript.trim()) {
                          patchSession({ editedTranscript, activeTranscriptTier: 'edited' });
                        } else if (session.editedTranscript) {
                          patchSession({ editedTranscript: undefined });
                        }
                      }}
                      onCreateTranscript={handleCreateTranscript}
                      onRevertToLocal={handleRevertToLocal}
                      onCopyTranscript={handleCopyTranscript}
                      onScrubPII={scrubPIIFn}
                      onApplyScrub={handleApplyScrub}
                      piiScrubbing={piiScrubbing}
                      piiProgress={scrubProgress}
                      hasEditedTranscript={hasUserEdits}
                      onRevertEdits={handleRevertEdits}
                    />
                    {transcribeRetryStatus ? (
                      <div style={{ marginTop: 8 }}>
                        <AiCallRetryStatus {...transcribeRetryStatus} />
                      </div>
                    ) : null}
                    {transcribeAiError ? (
                      <div style={{ marginTop: 8 }}>
                        <AiCallError
                          error={transcribeAiError}
                          onRetry={() => {
                            clearTranscribeAiError();
                            void handleCreateTranscript();
                          }}
                          onDismiss={clearTranscribeAiError}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <ClipsInspector
                open={clipsOpen}
                clips={sortedClips}
                onClose={() => setClipsOpen(false)}
                onJump={(t) => {
                  setClipsOpen(false);
                  if (transcriptCollapsed) setTranscriptCollapsed(false);
                  setTimeout(() => transcriptRef.current?.scrollToTimestamp(t), 30);
                }}
                onDelete={handleDeleteClip}
                onRecord={() => { setClipsOpen(false); setActiveTab('record'); }}
                onUpload={(file) => { setClipsOpen(false); void handleUpload(file); }}
              />
            </div>
          ))}


      </div>

      {/* ── PHI confirmation before sending transcript to Anthropic ── */}
      <PhiConfirmDialog
        open={phiConfirmOpen}
        onCancel={() => setPhiConfirmOpen(false)}
        onConfirm={handlePhiConfirm}
      />

      {/* ── Local Whisper unavailable recovery dialog ───── */}
      <WhisperUnavailableDialog
        open={whisperDialogOpen}
        retryingLoad={whisperLoading}
        onUseWebSpeech={handleUseWebSpeech}
        onRecordWithoutTranscription={handleRecordWithoutTranscription}
        onRetryLoad={retryWhisperLoad}
        onCancel={handleCancelWhisperDialog}
      />

      {/* ── Demo complete modal ──────────────────────────── */}
      <DemoCompleteModal open={demoCompleteOpen} onClose={() => setDemoCompleteOpen(false)} />

      {/* ── Manage templates modal ────────────────────────── */}
      <ManageTemplatesModal
        open={manageTemplatesOpen}
        onClose={() => setManageTemplatesOpen(false)}
      />

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
          lastRawPayload={lastRawPayload}
        />
      )}

      {/* ── Reset session confirmation ────────────────────── */}
      <Modal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Reset Session"
        size="sm"
      >
        <p style={{ fontSize: 14, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
          This will permanently delete all recordings and transcriptions for this session,
          including any generated note. The session will return to a fresh state.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={() => setResetModalOpen(false)}>
            Cancel
          </button>
          <button
            className="btn"
            style={{ background: 'var(--color-pt-danger, #dc2626)', color: '#fff', border: 'none' }}
            onClick={() => void handleResetSession()}
          >
            <RotateCcw size={13} strokeWidth={2} />
            Reset Session
          </button>
        </div>
      </Modal>
    </div>
    </SessionActionsContext.Provider>
  );
}

function relativeTime(ts: number | undefined): string {
  if (!ts) return '';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / (60 * 24))}d ago`;
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

const PROCESSING_STEPS = [
  { label: 'Reading audio file',               threshold: 0.00 },
  { label: 'Sending to transcription service', threshold: 0.10 },
  { label: 'Transcribing audio',               threshold: 0.25 },
  { label: 'Finalizing transcript',            threshold: 0.88 },
] as const;

function UploadProcessingView({ durationSec }: { durationSec?: number }) {
  // ~150ms per second of audio; realtime transcription is typically 5–10× faster than playback
  const estimatedMs = Math.max(3000, (durationSec ?? 30) * 150);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = Date.now();
    const cap = 0.95;

    function tick() {
      const t = Math.min(1, (Date.now() - start) / estimatedMs);
      const eased = Math.min(cap, 1 - Math.pow(1 - t, 3)); // ease-out cubic
      setProgress(eased);
      if (eased < cap) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [estimatedMs]);

  const stepLabel =
    [...PROCESSING_STEPS].reverse().find((s) => progress >= s.threshold)?.label ??
    PROCESSING_STEPS[0].label;

  return (
    <div className="flex flex-col items-center gap-6 py-16 px-8">
      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-pt-text)' }}>
        Processing audio
      </span>
      <div className="flex w-full flex-col items-center gap-2" style={{ maxWidth: 320 }}>
        <div
          className="w-full overflow-hidden rounded-full"
          style={{ height: 6, background: 'var(--color-pt-border)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(progress * 100)}%`,
              background: 'var(--color-pt-accent)',
              transition: 'width 120ms linear',
            }}
          />
        </div>
        <span className="text-xs" style={{ color: 'var(--color-pt-text-3)' }}>
          {stepLabel}
        </span>
      </div>
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
