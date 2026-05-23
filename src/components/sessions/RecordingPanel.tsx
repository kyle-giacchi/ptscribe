import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsProvider';
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities';
import type { UseRecorder } from '@/hooks/useRecorder';
import type { UseWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import type { UploadStatus } from '@/hooks/sessionMachine/types';
import type { SessionClip } from '@/types';
import { StatusBanner } from './recording/StatusBanner';
import { IdleRecordingCard } from './recording/IdleRecordingCard';
import { ActiveRecordingCard } from './recording/ActiveRecordingCard';
import { RecordingSizeHint, RecordingNotices, LiveTranscriptPreview } from './recording/RecordingNotices';
import { playAlertChime } from './recording/playAlertChime';

export interface RecordingPanelProps {
  recorder: UseRecorder;
  webSpeech: UseWebSpeechTranscript;
  clips: SessionClip[];
  whisperBubbles: string[];
  uploadStatus: UploadStatus;
  onStart: () => void;
  onStopAndFinish: () => void;
  onPauseResume: () => void;
  onUpload: (file: File) => void;
  onSkip: () => void;
  wasBackgrounded: boolean;
  onDismissBackgroundWarning: () => void;
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function RecordingPanel({
  recorder,
  webSpeech,
  clips,
  whisperBubbles,
  uploadStatus,
  onStart,
  onStopAndFinish,
  onPauseResume,
  onUpload,
  onSkip,
  wasBackgrounded,
  onDismissBackgroundWarning,
}: RecordingPanelProps) {
  const { settings } = useSettings();
  const capabilities = useDeviceCapabilities();
  const recording = recorder.status === 'recording' || recorder.status === 'paused';
  const activelyRecording = recorder.status === 'recording';

  const [silenceWarnDismissed, setSilenceWarnDismissed] = useState(false);

  // Play chime once each time the silence warning fires.
  useEffect(() => {
    if (recorder.silenceWarning && activelyRecording) playAlertChime();
    // activelyRecording excluded from deps — we only want to react to silenceWarning transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.silenceWarning]);

  // Auto-clear the dismiss flag when voice resumes so the next silence period warns again.
  // Legitimate external-state mirror — silenceWarning is owned by the recorder
  // state machine and we need to reset our dismiss snapshot at its falling edge.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!recorder.silenceWarning) setSilenceWarnDismissed(false);
  }, [recorder.silenceWarning]);
  const idle =
    recorder.status === 'idle' || recorder.status === 'stopped' || recorder.status === 'error';
  const webspeechProvider = settings.ai.transcription.provider === 'webspeech';

  const [wasAutoStopped, setWasAutoStopped] = useState(false);

  useEffect(() => {
    if (recorder.hardCapStopped) {
      toast.warning(
        `Hit recording length cap (${settings.recordingLimits.maxMinutes} min) — auto-stopped.`,
      );
    }
  }, [recorder.hardCapStopped, settings.recordingLimits.maxMinutes]);

  // Legitimate external-state mirrors — recorder.idleAutoStopped and
  // recorder.status are owned by the recorder state machine; this component
  // latches its own "was auto-stopped" flag in response.
  useEffect(() => {
    if (recorder.idleAutoStopped) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWasAutoStopped(true);
    }
  }, [recorder.idleAutoStopped]);

  // recorderInterrupted is covered by the wasBackgrounded StatusBanner above.

  useEffect(() => {
    if (recorder.micDisconnected) {
      toast.warning('Microphone disconnected — recording stopped and audio saved.');
    }
  }, [recorder.micDisconnected]);

  useEffect(() => {
    if (recorder.status === 'recording') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWasAutoStopped(false);
    }
  }, [recorder.status]);

  if (idle && !wasAutoStopped) {
    return <IdleRecordingCard onStart={onStart} onUpload={onUpload} onSkip={onSkip} uploadStatus={uploadStatus} isAddingClip={clips.length > 0} capabilities={capabilities} />;
  }

  return (
    <div className="space-y-3">
      {wasBackgrounded && (
        <StatusBanner
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          color="caution"
          onDismiss={onDismissBackgroundWarning}
        >
          Tab was in the background — recording continued. Verify the clip duration after stopping.
        </StatusBanner>
      )}

      {activelyRecording && recorder.silenceWarning && !silenceWarnDismissed && (
        <StatusBanner
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          color="negative"
          onDismiss={() => setSilenceWarnDismissed(true)}
        >
          No audio detected for 30 seconds — microphone may be muted or disconnected. Check your mic and try speaking.
        </StatusBanner>
      )}

      {wasAutoStopped && !recording && (
        <StatusBanner
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          color="caution"
          action={
            <button
              type="button"
              className="btn btn-ghost shrink-0 py-0.5 text-xs font-medium"
              style={{ color: 'var(--color-pt-amber-fg)', touchAction: 'manipulation' }}
              onClick={() => {
                setWasAutoStopped(false);
                void onStart();
              }}
            >
              Resume
            </button>
          }
          onDismiss={() => setWasAutoStopped(false)}
        >
          Recording auto-stopped after {settings.recordingLimits.idleAutoStopMinutes} min of
          inactivity.
        </StatusBanner>
      )}

      {recording ? (
        <ActiveRecordingCard
          durationSec={recorder.durationSec}
          paused={recorder.status === 'paused'}
          chainActive={false}
          analyser={recorder.analyser}
          webSpeech={webSpeech}
          whisperBubbles={whisperBubbles}
          wasmSupported={capabilities?.wasmSupported}
          onPauseResume={onPauseResume}
          onStopAndFinish={onStopAndFinish}
        />
      ) : (
        <IdleRecordingCard onStart={onStart} onUpload={onUpload} onSkip={onSkip} uploadStatus={uploadStatus} isAddingClip={clips.length > 0} capabilities={capabilities} />
      )}

      {recording && <RecordingSizeHint durationSec={recorder.durationSec} />}

      {recording && recorder.softWarnReached && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="caution">
          This take has been recording for {Math.round(recorder.durationSec / 60)} min — consider
          stopping and starting a fresh clip. Auto-stop at {settings.recordingLimits.maxMinutes}{' '}
          min.
        </StatusBanner>
      )}

      <RecordingNotices
        recorderError={recorder.error}
        webspeechProvider={webspeechProvider}
        liveSupported={webSpeech.supported}
        liveError={webSpeech.error}
        hasFailedClip={clips.some((c) => c.status === 'failed')}
      />

      {!recording && <LiveTranscriptPreview webSpeech={webSpeech} />}
    </div>
  );
}
