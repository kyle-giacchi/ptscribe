import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AudioLines, Headphones } from 'lucide-react';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { SessionResetContext } from '@/contexts/SessionResetContext';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useExercises } from '@/contexts/ExercisesProvider';
import { usePlans } from '@/contexts/PlansProvider';
import { PatientActivitiesCard } from '@/components/sessions/activities/PatientActivitiesCard';
import { SessionMeasures } from '@/components/sessions/SessionMeasures';
import { useMeasurements } from '@/contexts/MeasurementsProvider';
import { homeDiffersFromPlan, seedHomeFromPlan } from '@/services/note/activities';
import { useSettings } from '@/contexts/SettingsProvider';
import { isSelfHostedProvider } from '@/types';
import { useTemplateCatalog } from '@/hooks/useTemplateCatalog';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import { useRecorder } from '@/hooks/useRecorder';
import { useWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import { useBelowBreakpoint } from '@/hooks/useBelowBreakpoint';
import { useSessionPatcher } from '@/hooks/useSessionPatcher';
import { relativeFromNow } from '@/utils/dates';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useResizablePanes } from '@/hooks/useResizablePanes';
import { useSessionMachine, type SessionMachineEvent } from '@/hooks/useSessionMachine';
import { RecordingPanel } from '@/components/sessions/RecordingPanel';
import { ClipsDrawer, ClipsListView } from '@/components/sessions/ClipsDrawer';
import { type AudioFileInputHandle } from '@/components/common/AudioFileInput';
import { SegmentedControl } from '@/components/design/SegmentedControl';
import { TranscriptPanel } from '@/components/sessions/TranscriptPanel';
import { PIIScrubModal } from '@/components/sessions/PIIScrubModal';
import { NotePanel } from '@/components/sessions/NotePanel';
import { NoteToolbar } from '@/components/sessions/NoteToolbar';
import { PhiConfirmDialog } from '@/components/sessions/PhiConfirmDialog';
import { WhisperUnavailableDialog } from '@/components/sessions/WhisperUnavailableDialog';
import { StaleFinalizeDialog } from '@/components/sessions/StaleFinalizeDialog';
import { TemplateChangeDialog } from '@/components/sessions/TemplateChangeDialog';
import { AiCallError } from '@/components/ai/AiCallError';
import { AiCallRetryStatus } from '@/components/ai/AiCallRetryStatus';
import { useDebugDrawer, type PiiScrubDebug } from '@/contexts/DebugDrawerProvider';
import { SessionTopBar } from '@/components/sessions/SessionTopBar';
import { ManageTemplatesModal } from '@/components/sessions/ManageTemplatesModal';
import { DemoCompleteModal } from '@/components/common/DemoCompleteModal';

import { ReviewEmptyState } from '@/components/sessions/ReviewEmptyState';
import { TranscriptCollapsedTab } from '@/components/sessions/TranscriptCollapsedTab';
import { ResetSessionModal } from '@/components/sessions/ResetSessionModal';
import { UploadProcessingView } from '@/components/sessions/UploadProcessingView';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { Modal } from '@/components/ui/Modal';

export function SessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <SessionRoute key={id} sessionId={id} />;
}

function SessionRoute({ sessionId }: { sessionId: string }) {
  const { getSession, sessions } = useSessions();
  const { getPatient, updatePatient } = usePatients();
  const { forSession } = useNotes();
  const { getTemplate } = useTemplates();
  const { settings, updateSession } = useSettings();
  const { patchSession, patchClips, patchClip } = useSessionPatcher(sessionId);

  // Org-shared templates resolve here just like local ones (read-only, sourced
  // from the org) so a session pointing at an org template generates correctly.
  const { all: allTemplates } = useTemplateCatalog();

  const session = getSession(sessionId);
  const patient = session ? getPatient(session.patientId) : undefined;
  const note = session ? forSession(session.id) : undefined;
  const template =
    getTemplate(session?.templateId ?? '') ??
    allTemplates.find((t) => t.id === session?.templateId) ??
    allTemplates[0];

  // Full history, not just this visit — the Measures tab shows each measure's
  // last reading so today's is one number rather than a lookup.
  const { forPatient: measurementsFor, addMeasurement, removeMeasurement } = useMeasurements();
  const patientMeasurements = patient ? measurementsFor(patient.id) : [];

  // ── Patient activities (per-visit exercise log) ──────────────────────────
  const { exercises } = useExercises();
  const { activePlanForPatient } = usePlans();
  const activePlan = patient ? activePlanForPatient(patient.id) : undefined;

  // Seed is COMPUTED, never auto-written — persisting on mount would create a
  // phantom Note for every session whose Review tab was merely opened.
  // ponytail: a plain call, not useMemo — it is a map over a handful of
  // prescriptions, and memoizing it made the React Compiler bail on this file.
  const seededHome = seedHomeFromPlan(activePlan, exercises);
  const displayActivities = note?.activities ?? { performed: [], home: seededHome };
  const seededFromPlan = !note?.activities && seededHome.length > 0;

  const recorder = useRecorder({
    limits: settings.recordingLimits,
    inputDeviceId: settings.audio.inputDeviceId,
  });
  const webSpeech = useWebSpeechTranscript();

  // ── URL params — read before first render so initial tab/mode are correct ──
  const [searchParams, setSearchParams] = useSearchParams();
  const quickMode = searchParams.get('mode') === 'quick';

  // ── Layout state (page-owned; never affects workflow correctness) ────────
  const isNarrowViewport = useBelowBreakpoint(1024);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(isNarrowViewport);
  const { notePct, containerRef: reviewGridRef, startResize } = useResizablePanes();
  const [piiScrubOpen, setPiiScrubOpen] = useState(false);
  const [piiScrub, setPiiScrub] = useState<PiiScrubDebug | null>(null);
  const [seekSignal, setSeekSignal] = useState<{ seconds: number; id: number } | null>(null);
  const [clipsOpen, setClipsOpen] = useState(false);
  // Desktop-only (≥1024px): persistent Transcription/Clips tabs replace the
  // ClipsDrawer on-demand sheet, which stays as the <1024px fallback (no room
  // for a second column there). See CONTEXT.md#clips.
  const [rightPanelTab, setRightPanelTab] = useState<'transcript' | 'clips'>('transcript');
  const [noteTab, setNoteTab] = useState<'notes' | 'activities' | 'measures'>('notes');
  const clipsFileRef = useRef<AudioFileInputHandle>(null);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [demoCompleteOpen, setDemoCompleteOpen] = useState(false);
  const [recordWarnOpen, setRecordWarnOpen] = useState(false);
  const { setActiveSessionId, setSessionDebug } = useDebugDrawer();

  useAudioRecovery(sessionId, session, patchClips);

  // ── Cross-slice policy (machine emits outcomes; the page applies them) ───
  const persistPhiConfirmDismissed = useCallback(
    () => updateSession({ phiConfirmDismissed: true }),
    [updateSession],
  );
  const handleMachineEvent = useCallback(
    (event: SessionMachineEvent) => {
      if (event.type === 'note/finalized') {
        // Demo policy is host policy: finalizing the demo patient's session
        // discharges them and shows the demo-complete modal.
        if (isDemoMode() && event.patientId === DEMO_PATIENT_ID) {
          updatePatient(DEMO_PATIENT_ID, { status: 'discharged', updatedAt: Date.now() });
          setDemoCompleteOpen(true);
        }
      }
    },
    [updatePatient, setDemoCompleteOpen],
  );

  // ── The session workflow module (CONTEXT.md: Capture → Curate → Generate → Finalize) ──
  const { state, selectors, actions, whisperBubbles, backgroundT2 } = useSessionMachine({
    session,
    patient,
    note,
    template,
    allTemplates,
    settings,
    recorder,
    webSpeech,
    patchSession,
    patchClips,
    patchClip,
    persistPhiConfirmDismissed,
    initial: {
      quickMode,
      autoRecord: searchParams.get('autoRecord') === '1',
      tab: searchParams.get('tab') === 'review' ? 'review' : undefined,
    },
    onEvent: handleMachineEvent,
  });

  // The machine consumed the deep-link intent at mount; strip the param so a
  // refresh doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('autoRecord') !== '1') return;
    const next = new URLSearchParams(searchParams);
    next.delete('autoRecord');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Register this session with the app-global Debug drawer ──────────────
  const speedFactor = settings.audio.speedUp.speed;
  useEffect(() => {
    setActiveSessionId(sessionId);
    return () => {
      setActiveSessionId(null);
      setSessionDebug(null);
    };
  }, [sessionId, setActiveSessionId, setSessionDebug]);
  useEffect(() => {
    setSessionDebug({
      debugStats: state.transcribe.debugStats,
      speedFactor,
      lastRawPayload: state.generate.lastRawPayload,
      lastAiPrompts: state.generate.lastAiPrompts,
      lastKeyReport: state.generate.lastKeyReport,
      lastPiiScrub: piiScrub,
    });
  }, [
    state.transcribe.debugStats,
    speedFactor,
    state.generate.lastRawPayload,
    state.generate.lastAiPrompts,
    state.generate.lastKeyReport,
    piiScrub,
    setSessionDebug,
  ]);

  // A self-hosted generation failure can offer one cloud run — only if the user
  // picked a fallback provider in Settings, and only on explicit confirm (ADR-0011).
  const cloudFallback = settings.ai.generation.cloudFallback;
  const generateCloudFallback =
    cloudFallback && isSelfHostedProvider(settings.ai.generation.provider)
      ? {
          label: 'Use cloud once',
          confirm: `This sends the transcript to ${cloudFallback} for this note only. Your settings stay on your own server.`,
          onUse: () => {
            actions.clearGenerateAiError();
            actions.generate('replace', undefined, cloudFallback);
          },
        }
      : undefined;

  if (!session || !patient) return <NotFound />;

  const gate = state.gate;

  function handleRecordStart() {
    if (selectors.hasGeneratedNote) {
      setRecordWarnOpen(true);
    } else {
      actions.startRecording();
    }
  }
  const sortedClips = selectors.sortedClips;
  const hasEverRecorded = sessions.some((s) => s.clips.length > 0);

  // Mirror PII scrub runs into the Debug Menu (live) and, on a deep-scan
  // failure, persist it to the session's error log so it survives reload.
  function handleScrubDebug(debug: PiiScrubDebug) {
    setPiiScrub(debug);
    if (debug.error) actions.logScrubFailure(debug.model, debug.error);
  }

  return (
    <SessionResetContext.Provider value={{ onResetSession: actions.requestReset }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        {/* ── Error banner ──────────────────────────────────── */}
        {state.error && (
          <div style={{ padding: '12px 22px 0' }}>
            <ErrorBanner message={state.error} onDismiss={actions.dismissError} />
          </div>
        )}

        {/* ── Top bar (replaces SessionTabBar) ──────────────── */}
        <SessionTopBar
          patient={patient}
          session={session}
          note={note}
          totalDurationSec={selectors.totalDurationSec}
          onRecord={() => actions.setTab('record')}
          onUpload={(file) => {
            void actions.uploadAudio(file);
          }}
          missingRequiredLabels={selectors.missingRequiredLabels}
          onFinalize={actions.finalize}
          onUnfinalize={actions.unfinalize}
          showNoteActions={state.view.tab === 'review'}
        />

        {/* Collapsed transcript: a zero-height sticky bar pins the reopen pill to the top of
          the scroll area (its nearest scroll ancestor is <main>, not the content div below
          which has its own overflow). Lives outside the scroll content so it can't ride off. */}
        {state.view.tab === 'review' && !selectors.isTranscriptLocked && transcriptCollapsed && (
          <div
            style={{
              position: 'sticky',
              top: 0,
              height: 0,
              // Below SessionTopBar's zIndex:10 — otherwise this pill's hit area
              // (right-aligned, same padding as the header) sits on top of the
              // AddClipButton dropdown and swallows clicks meant for it.
              zIndex: 5,
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '0 22px',
              pointerEvents: 'none',
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
          {state.view.tab === 'record' && (
            <div
              role="tabpanel"
              id="panel-record"
              aria-labelledby="tab-record"
              style={{
                maxWidth: 960,
                margin: '0 auto',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {hasEverRecorded &&
                (sortedClips.length > 0 || selectors.effectiveTranscript.trim().length > 0) && (
                  <div>
                    <button
                      type="button"
                      className="btn btn-ghost py-1 text-sm"
                      onClick={() => actions.setTab('review')}
                    >
                      <ArrowLeft size={13} strokeWidth={2} /> Return to Notes
                    </button>
                  </div>
                )}

              {state.uploadFlow.active ? (
                <UploadProcessingView
                  durationSec={
                    sortedClips.find((c) => c.id === state.uploadFlow.clipId)?.durationSec
                  }
                  t2Phase={backgroundT2.phase}
                  t2Label={backgroundT2.progressLabel}
                  onRetry={backgroundT2.retry}
                  onGoToNotes={actions.dismissUploadProcessing}
                />
              ) : (
                <RecordingPanel
                  recorder={recorder}
                  webSpeech={webSpeech}
                  clips={sortedClips}
                  whisperBubbles={whisperBubbles}
                  uploadStatus={state.capture.uploadStatus}
                  onStart={handleRecordStart}
                  onStopAndFinish={actions.stopAndFinish}
                  onPauseResume={actions.pauseResume}
                  onUpload={(file) => {
                    void actions.uploadAudio(file);
                  }}
                  onSkip={actions.skipRecording}
                  wasBackgrounded={selectors.showBackgroundWarning}
                  onDismissBackgroundWarning={actions.dismissBackgroundWarning}
                  advisories={state.capture.advisories}
                  dispatchAdvisory={actions.dispatchAdvisory}
                />
              )}
            </div>
          )}

          {/* ② Review tab */}
          {state.view.tab === 'review' &&
            (selectors.isTranscriptLocked ? (
              <ReviewEmptyState />
            ) : (
              <div
                role="tabpanel"
                id="panel-review"
                aria-labelledby="tab-review"
                style={{
                  position: 'relative',
                  maxWidth: transcriptCollapsed ? 860 : '100%',
                  width: '100%',
                  margin: '0 auto',
                  transition: 'max-width 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div
                  ref={reviewGridRef}
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: transcriptCollapsed
                      ? 'minmax(0, 1fr)'
                      : `minmax(0, ${notePct}fr) 10px minmax(0, ${100 - notePct}fr)`,
                    gap: transcriptCollapsed ? 24 : 16,
                    alignItems: 'stretch',
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
                          fontSize: 'var(--text-sm)',
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
                      <SegmentedControl
                        value={noteTab}
                        onChange={setNoteTab}
                        items={[
                          { value: 'notes', label: 'Notes' },
                          { value: 'activities', label: 'Activities' },
                          { value: 'measures', label: 'Measures' },
                        ]}
                      />
                      {noteTab === 'notes' && note && (
                        <span
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-3)' }}
                        >
                          {selectors.busy === 'generating'
                            ? 'Generating…'
                            : `last generated ${note.updatedAt ? relativeFromNow(note.updatedAt) : ''}`}
                        </span>
                      )}
                    </div>

                    {noteTab === 'notes' ? (
                      <>
                        <NoteToolbar
                          template={template}
                          templates={allTemplates}
                          hasDraftContent={!!note?.sections.some((s) => s.body.trim().length > 0)}
                          canGenerate={selectors.canGenerate}
                          requiresFeedback={selectors.inputsUnchanged}
                          isGenerating={selectors.busy === 'generating'}
                          note={note}
                          patient={patient}
                          modifiers={selectors.currentModifiers}
                          onTemplateChange={actions.changeTemplate}
                          onManageTemplates={() => setManageTemplatesOpen(true)}
                          onGenerate={actions.generate}
                          onModifiersChange={actions.setModifiers}
                        />

                        <NotePanel
                          patient={patient}
                          note={note}
                          template={template}
                          isStale={selectors.noteIsStale}
                          onSectionChange={actions.sectionChange}
                        />
                      </>
                    ) : noteTab === 'activities' ? (
                      <PatientActivitiesCard
                        activities={displayActivities}
                        exercises={exercises}
                        readOnly={!!note?.finalized}
                        seededFromPlan={seededFromPlan}
                        canSyncPlan={homeDiffersFromPlan(displayActivities.home, activePlan)}
                        onChange={actions.activitiesChange}
                        // Task 6 replaces this with actions.syncPlanOfCare.
                        onSyncPlan={() => {}}
                      />
                    ) : (
                      <SessionMeasures
                        patientId={session.patientId}
                        sessionId={session.id}
                        sessionDate={session.date}
                        measurements={patientMeasurements}
                        onAdd={addMeasurement}
                        onRemove={removeMeasurement}
                        readOnly={!!note?.finalized}
                      />
                    )}
                    {state.generate.retryStatus ? (
                      <div style={{ marginTop: 8 }}>
                        <AiCallRetryStatus {...state.generate.retryStatus} />
                      </div>
                    ) : null}
                    {state.generate.aiError ? (
                      <div style={{ marginTop: 8 }}>
                        <AiCallError
                          error={state.generate.aiError}
                          onRetry={() => {
                            actions.clearGenerateAiError();
                            actions.generate();
                          }}
                          onDismiss={actions.clearGenerateAiError}
                          fallback={generateCloudFallback}
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
                        alignSelf: 'stretch',
                        cursor: 'col-resize',
                        display: 'flex',
                        alignItems: 'stretch',
                        justifyContent: 'center',
                        minHeight: 80,
                      }}
                    >
                      <div
                        style={{
                          width: 1,
                          alignSelf: 'stretch',
                          background: 'var(--color-pt-border)',
                        }}
                      />
                    </div>
                  )}

                  {/* ── Right: Transcription / Clips ── */}
                  {!transcriptCollapsed && (
                    <div
                      style={{
                        position: 'relative',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div role="tablist" className="flex items-stretch" style={{ gap: 8 }}>
                        <RightPanelTab
                          active={rightPanelTab === 'transcript'}
                          onClick={() => setRightPanelTab('transcript')}
                          icon={<Headphones size={13} strokeWidth={2} />}
                          label="Transcription"
                        />
                        <RightPanelTab
                          active={rightPanelTab === 'clips'}
                          onClick={() => setRightPanelTab('clips')}
                          icon={<AudioLines size={13} strokeWidth={2} />}
                          label="Clips"
                          count={sortedClips.length}
                        />
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          flex: 1,
                          minHeight: 0,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {rightPanelTab === 'transcript' ? (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              flex: 1,
                              minHeight: 0,
                            }}
                          >
                            <TranscriptPanel
                              transcript={selectors.effectiveTranscript}
                              clips={sortedClips}
                              transcribing={selectors.busy === 'transcribing'}
                              hasUserEdits={selectors.hasUserEdits}
                              hasT2Transcript={selectors.hasT2Transcript}
                              hasT3Transcript={selectors.hasT3Transcript}
                              totalDurationSec={selectors.totalDurationSec}
                              collapsed={transcriptCollapsed}
                              onCollapse={() => setTranscriptCollapsed(true)}
                              onChange={actions.editTranscript}
                              onCommit={actions.commitTranscriptEdits}
                              onCreateTranscript={() => {
                                void actions.improveWithAI();
                              }}
                              canImproveWithAI={selectors.canImproveWithAI}
                              cloudDisabledReason={selectors.cloudDisabledReason}
                              onRevertToLocal={actions.revertToLocal}
                              onCopyTranscript={actions.copyTranscript}
                              onOpenPIIScrub={() => setPiiScrubOpen(true)}
                              hasEditedTranscript={selectors.hasUserEdits}
                              onRevertEdits={actions.revertEdits}
                              seekSignal={seekSignal}
                            />
                            {state.transcribe.retryStatus ? (
                              <div style={{ marginTop: 8 }}>
                                <AiCallRetryStatus {...state.transcribe.retryStatus} />
                              </div>
                            ) : null}
                            {state.transcribe.aiError ? (
                              <div style={{ marginTop: 8 }}>
                                <AiCallError
                                  error={state.transcribe.aiError}
                                  onRetry={() => {
                                    actions.clearTranscribeAiError();
                                    void actions.improveWithAI();
                                  }}
                                  onDismiss={actions.clearTranscribeAiError}
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div
                            className="card"
                            style={{
                              padding: 0,
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              flex: 1,
                            }}
                          >
                            <ClipsListView
                              clips={sortedClips}
                              total={sortedClips.reduce((sum, c) => sum + (c.durationSec ?? 0), 0)}
                              newest={
                                sortedClips.length > 0
                                  ? sortedClips.reduce((a, b) =>
                                      a.createdAt > b.createdAt ? a : b,
                                    )
                                  : null
                              }
                              fileRef={clipsFileRef}
                              isMobile={false}
                              onClose={() => setRightPanelTab('transcript')}
                              onJump={(t) => {
                                setRightPanelTab('transcript');
                                setSeekSignal({ seconds: t, id: Date.now() });
                              }}
                              onDelete={(clipId) => {
                                void actions.deleteClip(clipId);
                              }}
                              onRecord={() => {
                                actions.setTab('record');
                              }}
                              onUpload={(file) => {
                                void actions.uploadAudio(file);
                              }}
                              t2Phase={backgroundT2.phase}
                              t2Label={backgroundT2.progressLabel}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {transcriptCollapsed && (
                    <ClipsDrawer
                      open={clipsOpen}
                      clips={sortedClips}
                      onClose={() => setClipsOpen(false)}
                      onJump={(t) => {
                        setClipsOpen(false);
                        setTranscriptCollapsed(false);
                        setSeekSignal({ seconds: t, id: Date.now() });
                      }}
                      onDelete={(clipId) => {
                        void actions.deleteClip(clipId);
                      }}
                      onRecord={() => {
                        setClipsOpen(false);
                        actions.setTab('record');
                      }}
                      onUpload={(file) => {
                        setClipsOpen(false);
                        void actions.uploadAudio(file);
                      }}
                      t2Phase={backgroundT2.phase}
                      t2Label={backgroundT2.progressLabel}
                    />
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* ── Workflow gates (CONTEXT.md §Workflow gate) — rendered from state.gate ── */}

        {/* PHI confirmation before sending transcript to the generation provider */}
        <PhiConfirmDialog
          open={gate?.kind === 'phi-confirm'}
          onCancel={() => actions.resolveGate({ kind: 'phi-confirm', outcome: 'cancel' })}
          onConfirm={(dontShowAgain) =>
            actions.resolveGate({ kind: 'phi-confirm', outcome: 'confirm', dontShowAgain })
          }
        />

        {/* Local Whisper unavailable recovery */}
        <WhisperUnavailableDialog
          open={gate?.kind === 'whisper-unavailable'}
          onUseWebSpeech={() =>
            actions.resolveGate({ kind: 'whisper-unavailable', outcome: 'use-web-speech' })
          }
          onRecordWithoutTranscription={() =>
            actions.resolveGate({
              kind: 'whisper-unavailable',
              outcome: 'record-without-transcription',
            })
          }
          onCancel={() => actions.resolveGate({ kind: 'whisper-unavailable', outcome: 'cancel' })}
        />

        {/* Stale-note finalize confirmation (B2 stale-tracking) */}
        <StaleFinalizeDialog
          open={gate?.kind === 'stale-finalize'}
          onCancel={() => actions.resolveGate({ kind: 'stale-finalize', outcome: 'cancel' })}
          onRegenerate={() =>
            actions.resolveGate({ kind: 'stale-finalize', outcome: 'regenerate' })
          }
          onFinalizeAnyway={() =>
            actions.resolveGate({ kind: 'stale-finalize', outcome: 'finalize-anyway' })
          }
        />

        {/* Template-change confirmation (note has content) */}
        <TemplateChangeDialog
          open={gate?.kind === 'template-change'}
          targetTemplateName={
            (gate?.kind === 'template-change' &&
              allTemplates.find((t) => t.id === gate.targetTemplateId)?.name) ||
            'another template'
          }
          onCancel={() => actions.resolveGate({ kind: 'template-change', outcome: 'cancel' })}
          onConfirm={() => actions.resolveGate({ kind: 'template-change', outcome: 'confirm' })}
        />

        {/* Reset session confirmation */}
        <ResetSessionModal
          open={gate?.kind === 'reset-confirm'}
          onClose={() => actions.resolveGate({ kind: 'reset-confirm', outcome: 'cancel' })}
          onConfirm={() => actions.resolveGate({ kind: 'reset-confirm', outcome: 'confirm' })}
        />

        {/* ── Demo complete modal (host-applied demo policy) ── */}
        <DemoCompleteModal open={demoCompleteOpen} onClose={() => setDemoCompleteOpen(false)} />

        {/* ── New-recording warning (existing generated note will become stale) ── */}
        <Modal
          open={recordWarnOpen}
          onClose={() => setRecordWarnOpen(false)}
          title="Recording more will invalidate your generated note"
          size="sm"
        >
          <p
            style={{
              fontSize: 'var(--text-base)',
              color: 'var(--color-pt-text-2)',
              lineHeight: 1.55,
            }}
          >
            Any new clips will be added to your transcript, but your note was generated from the
            previous transcript. You&apos;ll need to re-run transcription and regenerate before the
            note reflects this recording.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRecordWarnOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setRecordWarnOpen(false);
                actions.startRecording();
              }}
            >
              Continue recording
            </button>
          </div>
        </Modal>

        {/* ── PII scrub modal ──────────────────────────────── */}
        <PIIScrubModal
          open={piiScrubOpen}
          transcript={selectors.effectiveTranscript}
          onApply={actions.applyScrub}
          onClose={() => setPiiScrubOpen(false)}
          onScrubDebug={handleScrubDebug}
        />

        {/* ── Manage templates modal ────────────────────────── */}
        <ManageTemplatesModal
          open={manageTemplatesOpen}
          onClose={() => setManageTemplatesOpen(false)}
        />

        {/* Debug drawer is rendered app-globally (GlobalDebugDrawer); this page
          only registers its session id + live debug data with the provider. */}
      </div>
    </SessionResetContext.Provider>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function RightPanelTab({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center transition-colors"
      style={{
        gap: 6,
        padding: '9px 12px',
        borderRadius: 8,
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        border: 'none',
        borderBottom: active ? '2px solid var(--color-pt-accent)' : '2px solid transparent',
        cursor: 'pointer',
        background: 'transparent',
        color: active ? 'var(--color-pt-text-1)' : 'var(--color-pt-text-2)',
      }}
    >
      {icon}
      {label}
      {typeof count === 'number' && count > 0 && (
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            fontWeight: 700,
            borderRadius: 999,
            padding: '0 6px',
            background: active ? 'var(--color-pt-accent)' : 'var(--color-pt-border)',
            color: active ? '#ffffff' : 'var(--color-pt-text-2)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

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
