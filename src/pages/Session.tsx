import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Mic, RotateCcw, Upload } from 'lucide-react';
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
import { renderNoteMarkdown } from '@/lib/clinical/noteFormat';
import type { Session, SessionClip, NoteSection } from '@/types';
import { useAudioRecovery } from '@/hooks/useAudioRecovery';
import { useAutoRotateClip } from '@/hooks/useAutoRotateClip';
import { mergeClipTranscripts, getTranscribableClips } from '@/utils/clips';
import { useRecordingFlow } from '@/hooks/useRecordingFlow';
import { useTranscriptionFlow, MAX_TRANSCRIBES_PER_SESSION } from '@/hooks/useTranscriptionFlow';
import { useGenerationFlow, MAX_GENERATES_PER_SESSION } from '@/hooks/useGenerationFlow';
import { usePrivacyFilter } from '@/hooks/usePrivacyFilter';
import { RecordingPanel } from '@/components/sessions/RecordingPanel';
import { ClipsList } from '@/components/sessions/ClipsList';
import { AudioPreviewSection } from '@/components/sessions/AudioPreviewSection';
import { TranscriptPanel } from '@/components/sessions/TranscriptPanel';
import { NotePanel } from '@/components/sessions/NotePanel';
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
  const { settings } = useSettings();
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
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingSkipped, setRecordingSkipped] = useState(quickMode);
  const [pendingDeleteSession, setPendingDeleteSession] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'record' | 'review' | 'clips'>(quickMode ? 'review' : 'record');
  // Once dismissed per session, the re-record warning does not resurface.
  const [recordWarnDismissed, setRecordWarnDismissed] = useState(false);
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
  } = transcription;

  // ── Recording flow ───────────────────────────────────────────────────────
  const recording = useRecordingFlow({
    session,
    recorder,
    webSpeech,
    webSpeechEnabled: settings.session.webSpeechEnabled,
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
    handleReplaceSections,
    handleFinalize,
    handleUnfinalize,
    handleCopyNoteMarkdown,
    missingRequiredLabels,
    lastRawPayload,
  } = generation;

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

  // ── Copy full note ────────────────────────────────────────────────────────
  function handleCopyNote() {
    if (!note || !template) return;
    const md = renderNoteMarkdown(note, template, patient!);
    handleCopyNoteMarkdown(md);
  }

  function handleCopyTranscript() {
    navigator.clipboard.writeText(transcript).then(
      () => toast.success('Transcript copied'),
      () => toast.error('Copy failed'),
    );
  }

  function handleApplyScrub(scrubbed: string) {
    setTranscript(scrubbed);
    patchSession({
      transcript: scrubbed,
      activeTranscriptTier: session?.activeTranscriptTier ?? 'edited',
    });
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
    transcript.trim().length > 0 &&
    settings.ai.generation.provider === 'anthropic' &&
    generateUsed < MAX_GENERATES_PER_SESSION;

  const isTranscriptLocked = sortedClips.length === 0 && !transcript.trim() && !recordingSkipped;
  const isRecording = recorder.status === 'recording' || recorder.status === 'paused';

  const hasT2Transcript = sortedClips.some((c) => !!c.t2Transcript);
  // Nova-eligible: clips not yet AI-transcribed (local result still in transcript, or not yet transcribed)
  const novaEligible = !isRecording && getTranscribableClips(sortedClips).length > 0;

  const currentClipMerge = mergeClipTranscripts(session.clips).trim();
  const hasUserEdits = transcript.trim().length > 0 && transcript.trim() !== currentClipMerge;

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
    if (recorder.status !== 'idle') {
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

    if (clip.status === 'transcribed' || clip.status === 'failed') {
      const elapsed = Date.now() - (processingStartedAtRef.current ?? Date.now());
      const delay = Math.max(0, 3000 - elapsed);
      const t = setTimeout(() => {
        setProcessingUploadClipId(null);
        setActiveTab('review');
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
        missingRequiredLabels={missingRequiredLabels}
        pendingDeleteSession={pendingDeleteSession}
        onCopyNote={handleCopyNote}
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
                onStart={handleStartRecording}
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
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
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
                <NotePanel
                  patient={patient}
                  note={note}
                  template={template}
                  templates={templates}
                  transcript={transcript}
                  totalDurationSec={totalDurationSec}
                  busy={busy}
                  canGenerate={canGenerate}
                  onSectionChange={handleSectionChange}
                  onTemplateChange={handleTemplateChange}
                  onManageTemplates={() => setManageTemplatesOpen(true)}
                  onGenerate={handleGenerate}
                />
              </div>

              {/* ── Right: Transcript ── */}
              <div>
                <TranscriptPanel
                  transcript={transcript}
                  clips={sortedClips}
                  canTranscribe={novaEligible}
                  transcribing={busy === 'transcribing'}
                  transcribeUsed={transcribeUsed}
                  transcribeCap={MAX_TRANSCRIBES_PER_SESSION}
                  hasUserEdits={hasUserEdits}
                  hasT2Transcript={hasT2Transcript}
                  totalDurationSec={totalDurationSec}
                  onChange={setTranscript}
                  onCommit={() =>
                    patchSession({
                      transcript,
                      activeTranscriptTier: session.activeTranscriptTier ?? 'edited',
                    })
                  }
                  onCreateTranscript={handleCreateTranscript}
                  onRevertToLocal={handleRevertToLocal}
                  onAddRecording={() => setActiveTab('record')}
                  onViewRecordings={() => setActiveTab('clips')}
                  clipsCount={sortedClips.length}
                  onCopyTranscript={handleCopyTranscript}
                  onScrubPII={scrubPIIFn}
                  onApplyScrub={handleApplyScrub}
                  piiScrubbing={piiScrubbing}
                  piiProgress={scrubProgress}
                />
              </div>
            </div>
          ))}

        {/* ③ Clips tab */}
        {activeTab === 'clips' && (
          <div role="tabpanel" id="panel-clips" aria-labelledby="tab-clips" style={{ maxWidth: 680, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveTab('record')}
                style={{ minHeight: 44, touchAction: 'manipulation' }}
              >
                <Mic size={14} strokeWidth={2} /> Add clip
              </button>
              <label className="btn btn-ghost cursor-pointer" style={{ minHeight: 44, touchAction: 'manipulation', position: 'relative' }}>
                <Upload size={14} strokeWidth={2} /> Upload audio
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { void handleUploadAudio(file); e.target.value = ''; }
                  }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                />
              </label>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setActiveTab('review')}
                style={{ minHeight: 44, touchAction: 'manipulation' }}
              >
                <ArrowLeft size={14} strokeWidth={2} /> Return to Notes
              </button>
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
