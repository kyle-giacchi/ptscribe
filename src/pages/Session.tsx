import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { SessionResetContext } from '@/contexts/SessionResetContext';
import { audioRepository } from '@/services/AudioRepository';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import { useRecorder } from '@/hooks/useRecorder';
import { useWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import { useBelowBreakpoint } from '@/hooks/useBelowBreakpoint';
import { useSessionPatcher } from '@/hooks/useSessionPatcher';
import type { NoteSection } from '@/types';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useAutoRotateClip } from '@/hooks/useAutoRotateClip';
import { useSessionMachine } from '@/hooks/useSessionMachine';
import { MAX_GENERATES_PER_SESSION } from '@/hooks/useActionGuard';
import { RecordingPanel } from '@/components/sessions/RecordingPanel';
import { ClipsDrawer } from '@/components/sessions/ClipsDrawer';
import { TranscriptPanel } from '@/components/sessions/TranscriptPanel';
import { PIIScrubModal } from '@/components/sessions/PIIScrubModal';
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
import { RecordWarningBanner } from '@/components/sessions/RecordWarningBanner';
import { ReviewEmptyState } from '@/components/sessions/ReviewEmptyState';
import { TranscriptCollapsedTab } from '@/components/sessions/TranscriptCollapsedTab';
import { ResetSessionModal } from '@/components/sessions/ResetSessionModal';
import { UploadProcessingView } from '@/components/sessions/UploadProcessingView';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { Modal } from '@/components/ui/Modal';

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
  const { patchSession, patchClips, patchClip } = useSessionPatcher(sessionId);

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
  const { exhausted: whisperExhausted } = useWhisperLoading();
  const isNarrowViewport = useBelowBreakpoint(1024);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(isNarrowViewport);
  // Note/transcript split as a percentage of the note column. Live-drag only; resets to 50/50 on mount.
  const [notePct, setNotePct] = useState(50);
  const reviewGridRef = useRef<HTMLDivElement>(null);
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const grid = reviewGridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    function onMove(ev: PointerEvent) {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setNotePct(Math.min(70, Math.max(30, pct)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.userSelect = 'none';
  }
  const [piiScrubOpen, setPiiScrubOpen] = useState(false);
  const [seekSignal, setSeekSignal] = useState<{ seconds: number; id: number } | null>(null);
  const [clipsOpen, setClipsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [silenceDebugOn, setSilenceDebugOn] = useState(false);
  const [speedDebugOn, setSpeedDebugOn] = useState(false);
  const [sectionCache, setSectionCache] = useState<Map<string, NoteSection[]>>(new Map());
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [processingUploadClipId, setProcessingUploadClipId] = useState<string | null>(null);
  const processingStartedAtRef = useRef<number | null>(null);
  const [isUploadInProgress, setIsUploadInProgress] = useState(false);

  useAudioRecovery(sessionId, session, patchClips);

  const sortedClips = session ? [...session.clips].sort((a, b) => a.createdAt - b.createdAt) : [];

  // ── Session lifecycle machine (owns generate, transcribe, AND capture slices) ──
  const sessionMachine = useSessionMachine({
    session,
    patient,
    note,
    template,
    settings,
    transcript: effectiveTranscript,
    recorder,
    webSpeech,
    webSpeechEnabled: settings.session.webSpeechEnabled,
    transcriptionProviderOverride,
    sortedClips,
    patchSession,
    patchClips,
    patchClip,
    setTranscript,
    setEditedTranscript,
    setError,
    setBusy,
    setActiveTab,
  });
  const handleCreateTranscript = sessionMachine.transcribe.run;
  const handleRevertToLocal = sessionMachine.transcribe.revertToLocal;
  const clearTranscribeAiError = sessionMachine.transcribe.clearAiError;
  const { setMergedAudioBlob, setIsMerging } = sessionMachine.transcribe;
  const { aiError: transcribeAiError, retryStatus: transcribeRetryStatus, debugStats } =
    sessionMachine.state.transcribe;
  const { generateUsed } = sessionMachine.actionGuard;
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
    buildMergedAudioForReview,
  } = sessionMachine.capture;
  const { phase: t2Phase, progressLabel: t2Label, retry: retryT2 } = sessionMachine.backgroundT2;

  // Ref so effects can call the latest handler without re-firing when its
  // identity changes each render.
  const handleStartRecordingRef = useRef(handleStartRecording);
  useEffect(() => {
    handleStartRecordingRef.current = handleStartRecording;
  });

  useAutoRotateClip(
    recorder.status,
    recorder.durationSec,
    handleFinishedRecording,
    handleStartRecording,
  );

  // ── Whisper recovery: gate Start Recording behind dialog when preload failed ──
  function handleStartRecordingWithGate() {
    const provider = transcriptionProviderOverride ?? settings.ai.transcription.provider;
    if (provider === 'local' && whisperExhausted) {
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

  // ── Note/generation flow — sourced from the same sessionMachine above ────
  const handleGenerateRaw = sessionMachine.generate.run;
  const handleSectionChange = sessionMachine.generate.sectionChange;
  const handleReplaceSections = sessionMachine.generate.replaceSections;
  const handleFinalize = sessionMachine.generate.finalize;
  const handleUnfinalize = sessionMachine.generate.unfinalize;
  const handleCopyNoteMarkdown = sessionMachine.generate.copyMarkdown;
  const { missingRequiredLabels } = sessionMachine.generate;
  const { lastRawPayload, lastAiPrompts, lastKeyReport, aiError: generationAiError, retryStatus: generationRetryStatus } =
    sessionMachine.state.generate;
  const clearGenerationAiError = sessionMachine.generate.clearAiError;

  // ── PHI confirmation gate before generation ─────────────────────────────
  // Always shown (regardless of PII filter state) unless user has dismissed it
  // via the "Don't show this again" checkbox.
  const [phiConfirmOpen, setPhiConfirmOpen] = useState(false);
  const pendingGenerateMode = useRef<'replace' | 'append'>('replace');
  function handleGenerate(mode: 'replace' | 'append') {
    pendingGenerateMode.current = mode;
    if (settings.session.phiConfirmDismissed) {
      handleGenerateRaw(mode);
    } else {
      setPhiConfirmOpen(true);
    }
  }
  function handlePhiConfirm(dontShowAgain: boolean) {
    setPhiConfirmOpen(false);
    if (dontShowAgain) updateSession({ phiConfirmDismissed: true });
    handleGenerateRaw(pendingGenerateMode.current);
  }

  function handleCopyNote() {
    if (!note || !template) return;
    const md = renderNoteMarkdown(note, template, patient!);
    handleCopyNoteMarkdown(md);
  }


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
    void handleStartRecordingRef.current();
  }, [autoRecordRequested, recorder.status, session, patient, searchParams, setSearchParams]);

  // Tracks whether buildMergedAudioForReview has been called for the current upload.
  // Reset when processingUploadClipId clears so a subsequent upload re-triggers it.
  const mergeStartedRef = useRef(false);
  useEffect(() => {
    if (!processingUploadClipId) {
      mergeStartedRef.current = false;
      return;
    }
    const clip = session?.clips.find((c) => c.id === processingUploadClipId);
    if (!clip) return;

    const audioSaved =
      clip.status === 'ready' || clip.status === 'transcribed' || clip.status === 'failed';

    // Once audio is saved: kick off merge+T2 once (skipNav keeps us on the processing screen).
    if (audioSaved && !mergeStartedRef.current) {
      mergeStartedRef.current = true;
      void buildMergedAudioForReview({ skipNav: true });
      return;
    }

    // T2 finished — navigate to review after a brief minimum display time.
    if (mergeStartedRef.current && t2Phase === 'done') {
      const elapsed = Date.now() - (processingStartedAtRef.current ?? Date.now());
      const delay = Math.max(0, 2000 - elapsed);
      const t = setTimeout(() => {
        setProcessingUploadClipId(null);
        setActiveTab('review');
      }, delay);
      return () => clearTimeout(t);
    }
    // t2Phase === 'error': stay on processing screen; retry/go-to-notes buttons handle it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.clips, processingUploadClipId, t2Phase]);

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
    if (newTemplateId === session?.templateId) return;
    // Warn before discarding hand-written note content when switching templates.
    const hasNoteContent = !!note?.sections.some((s) => s.body.trim().length > 0);
    if (hasNoteContent) {
      setPendingTemplateId(newTemplateId);
      return;
    }
    applyTemplateChange(newTemplateId);
  }

  function applyTemplateChange(newTemplateId: string) {
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

  const currentModifiers = session.modifiers ?? { emphasis: [] };

  const canRegenerate = !note || (
    effectiveTranscript !== (note.generatedFromTranscript ?? '') ||
    JSON.stringify(currentModifiers) !== JSON.stringify(note.modifiers ?? { emphasis: [] })
  );

  function handleModifiersChange(next: import('@/types').SessionModifiers) {
    patchSession({ modifiers: next });
  }

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
    setIsUploadInProgress(true);
    setActiveTab('record');
    const clipId = await handleUploadAudio(file);
    setIsUploadInProgress(false);
    if (clipId) {
      processingStartedAtRef.current = Date.now();
      setProcessingUploadClipId(clipId);
    }
  }

  return (
    <SessionResetContext.Provider value={{ onResetSession: () => setResetModalOpen(true) }}>
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
        onFinalize={handleFinalizeWrapped}
        onUnfinalize={handleUnfinalize}
      />

      {/* Collapsed transcript: a zero-height sticky bar pins the reopen pill to the top of
          the scroll area (its nearest scroll ancestor is <main>, not the content div below
          which has its own overflow). Lives outside the scroll content so it can't ride off. */}
      {activeTab === 'review' && !isTranscriptLocked && transcriptCollapsed && (
        <div
          style={{
            position: 'sticky', top: 0, height: 0, zIndex: 20,
            display: 'flex', justifyContent: 'flex-end',
            padding: '0 22px', pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <TranscriptCollapsedTab onExpand={() => setTranscriptCollapsed(false)} />
          </div>
        </div>
      )}

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
              <RecordWarningBanner
                onBackToReview={() => setActiveTab('review')}
                onDismiss={() => setRecordWarnDismissed(true)}
              />
            )}
            {(processingUploadClipId || isUploadInProgress) ? (
              <UploadProcessingView
                durationSec={sortedClips.find((c) => c.id === processingUploadClipId)?.durationSec}
                t2Phase={t2Phase}
                t2Label={t2Label}
                onRetry={() => { retryT2(); }}
                onGoToNotes={() => { setProcessingUploadClipId(null); setActiveTab('review'); }}
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
            <ReviewEmptyState />
          ) : (
            <div role="tabpanel" id="panel-review" aria-labelledby="tab-review" style={{ position: 'relative' }}>
              <div
                ref={reviewGridRef}
                style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: transcriptCollapsed
                    ? 'minmax(0, 1fr)'
                    : `minmax(0, ${notePct}fr) 10px minmax(0, ${100 - notePct}fr)`,
                  gap: transcriptCollapsed ? 24 : 16,
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
                  canRegenerate={canRegenerate}
                  isGenerating={busy === 'generating'}
                  noteExists={!!note}
                  modifiers={currentModifiers}
                  onTemplateChange={handleTemplateChange}
                  onManageTemplates={() => setManageTemplatesOpen(true)}
                  onGenerate={handleGenerate}
                  onCopyNote={handleCopyNote}
                  onModifiersChange={handleModifiersChange}
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

              {/* ── Drag-to-resize divider ── */}
              {!transcriptCollapsed && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize transcript panel"
                  onPointerDown={startResize}
                  style={{
                    alignSelf: 'stretch', cursor: 'col-resize',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: 80,
                  }}
                >
                  <div style={{ width: 4, height: 48, borderRadius: 999, background: 'var(--color-pt-border)' }} />
                </div>
              )}

              {/* ── Right: Transcript ── */}
              {!transcriptCollapsed && (
                <div style={{ position: 'relative' }}>
                    <TranscriptPanel
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
                      canImproveWithAI={!isDemoMode() && !session.t3Transcript}
                      onRevertToLocal={handleRevertToLocal}
                      onCopyTranscript={handleCopyTranscript}
                      onOpenPIIScrub={() => setPiiScrubOpen(true)}
                      hasEditedTranscript={hasUserEdits}
                      onRevertEdits={handleRevertEdits}
                      seekSignal={seekSignal}
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
                </div>
              )}
              <ClipsDrawer
                open={clipsOpen}
                clips={sortedClips}
                onClose={() => setClipsOpen(false)}
                onJump={(t) => {
                  setClipsOpen(false);
                  if (transcriptCollapsed) setTranscriptCollapsed(false);
                  setSeekSignal({ seconds: t, id: Date.now() });
                }}
                onDelete={handleDeleteClip}
                onRecord={() => { setClipsOpen(false); setActiveTab('record'); }}
                onUpload={(file) => { setClipsOpen(false); void handleUpload(file); }}
                t2Phase={t2Phase}
                t2Label={t2Label}
              />
              </div>
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
        onUseWebSpeech={handleUseWebSpeech}
        onRecordWithoutTranscription={handleRecordWithoutTranscription}
        onCancel={handleCancelWhisperDialog}
      />

      {/* ── Demo complete modal ──────────────────────────── */}
      <DemoCompleteModal open={demoCompleteOpen} onClose={() => setDemoCompleteOpen(false)} />

      {/* ── PII scrub modal ──────────────────────────────── */}
      <PIIScrubModal
        open={piiScrubOpen}
        transcript={effectiveTranscript}
        onApply={handleApplyScrub}
        onClose={() => setPiiScrubOpen(false)}
      />

      {/* ── Manage templates modal ────────────────────────── */}
      <ManageTemplatesModal
        open={manageTemplatesOpen}
        onClose={() => setManageTemplatesOpen(false)}
      />

      {/* ── Template-change confirmation (note has content) ── */}
      <Modal
        open={pendingTemplateId !== null}
        onClose={() => setPendingTemplateId(null)}
        title="Change template?"
        size="sm"
      >
        <p style={{ fontSize: 14, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
          Switching to{' '}
          <strong>{templates.find((t) => t.id === pendingTemplateId)?.name ?? 'another template'}</strong>{' '}
          will clear the text you've written in this note.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setPendingTemplateId(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const target = pendingTemplateId;
              setPendingTemplateId(null);
              if (target) applyTemplateChange(target);
            }}
          >
            Change template
          </button>
        </div>
      </Modal>

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
          lastAiPrompts={lastAiPrompts}
          lastKeyReport={lastKeyReport}
        />
      )}

      {/* ── Reset session confirmation ────────────────────── */}
      <ResetSessionModal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={() => void handleResetSession()}
      />
    </div>
    </SessionResetContext.Provider>
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

