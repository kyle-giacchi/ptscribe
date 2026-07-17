import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { SessionResetContext } from '@/contexts/SessionResetContext';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useOrgConfig } from '@/contexts/OrgConfigProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import { useRecorder } from '@/hooks/useRecorder';
import { useWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import { useBelowBreakpoint } from '@/hooks/useBelowBreakpoint';
import { useSessionPatcher } from '@/hooks/useSessionPatcher';
import { useMemo } from 'react';
import { relativeFromNow } from '@/utils/dates';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useResizablePanes } from '@/hooks/useResizablePanes';
import { useSessionMachine, type SessionMachineEvent } from '@/hooks/useSessionMachine';
import { RecordingPanel } from '@/components/sessions/RecordingPanel';
import { ClipsDrawer } from '@/components/sessions/ClipsDrawer';
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
  const { templates, getTemplate } = useTemplates();
  const { sharedTemplates } = useOrgConfig();
  const { settings, updateSession } = useSettings();
  const { patchSession, patchClips, patchClip } = useSessionPatcher(sessionId);

  // Org shared templates resolve here just like local ones (read-only, sourced
  // from the org) so a session pointing at an org template generates correctly.
  const allTemplates = useMemo(() => {
    const localIds = new Set(templates.map((t) => t.id));
    return [...templates, ...sharedTemplates.filter((t) => !localIds.has(t.id))];
  }, [templates, sharedTemplates]);

  const session = getSession(sessionId);
  const patient = session ? getPatient(session.patientId) : undefined;
  const note = session ? forSession(session.id) : undefined;
  const template =
    getTemplate(session?.templateId ?? '') ??
    allTemplates.find((t) => t.id === session?.templateId) ??
    templates[0];

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
    [updatePatient],
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
    initial: { quickMode, autoRecord: searchParams.get('autoRecord') === '1' },
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
          clipsCount={sortedClips.length}
          clipsOpen={clipsOpen}
          onToggleClips={() => setClipsOpen((o) => !o)}
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
              zIndex: 20,
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
                      className="btn btn-ghost py-1 text-xs"
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
                      <h1
                        style={{
                          fontSize: 20,
                          fontWeight: 600,
                          color: 'var(--color-pt-text)',
                          margin: 0,
                        }}
                      >
                        Clinical note
                      </h1>
                      {note && (
                        <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
                          {selectors.busy === 'generating'
                            ? 'Generating…'
                            : `last generated ${note.updatedAt ? relativeFromNow(note.updatedAt) : ''}`}
                        </span>
                      )}
                    </div>

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
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 80,
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          height: 48,
                          borderRadius: 999,
                          background: 'var(--color-pt-border)',
                        }}
                      />
                    </div>
                  )}

                  {/* ── Right: Transcript ── */}
                  {!transcriptCollapsed && (
                    <div style={{ position: 'relative' }}>
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
          <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.55 }}>
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
