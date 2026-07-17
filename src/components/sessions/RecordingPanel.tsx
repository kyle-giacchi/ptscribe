import { useReducer, useEffect } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsProvider';
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities';
import { duration, ease } from '@/lib/motion';
import type { UseRecorder } from '@/hooks/useRecorder';
import type { UseWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import type { UploadStatus } from '@/hooks/sessionMachine/types';
import type { SessionClip } from '@/types';
import { StatusBanner } from './recording/StatusBanner';
import { IdleRecordingCard } from './recording/IdleRecordingCard';
import { ActiveRecordingCard } from './recording/ActiveRecordingCard';
import {
  RecordingSizeHint,
  RecordingNotices,
  LiveTranscriptPreview,
  RecordingElapsedMinutes,
} from './recording/RecordingNotices';
import { playAlertChime } from './recording/playAlertChime';
import { advisoriesReducer, initialAdvisories } from './recordingAdvisories';

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
  const reduceMotion = useReducedMotion();
  const recording = recorder.status === 'recording' || recorder.status === 'paused';
  const activelyRecording = recorder.status === 'recording';

  const [advisories, dispatchAdvisory] = useReducer(advisoriesReducer, initialAdvisories);
  const { silenceActive, silenceWarnDismissed, softWarnActive, wasAutoStopped } = advisories;
  const idle =
    recorder.status === 'idle' || recorder.status === 'stopped' || recorder.status === 'error';
  const webspeechProvider = settings.ai.transcription.provider === 'webspeech';

  useEffect(() => {
    return recorder.subscribeEvents((e) => {
      switch (e.type) {
        case 'silenceStart':
          if (activelyRecording) playAlertChime();
          dispatchAdvisory({ type: 'silenceStart' });
          break;
        case 'silenceEnd':
          dispatchAdvisory({ type: 'silenceEnd' });
          break;
        case 'softWarn':
          dispatchAdvisory({ type: 'softWarn' });
          break;
        case 'stopped':
          if (e.reason === 'hardCap') {
            toast.warning(
              `Hit recording length cap (${settings.recordingLimits.maxMinutes} min) — auto-stopped.`,
            );
          } else if (e.reason === 'idleAuto') {
            dispatchAdvisory({ type: 'autoStopped' });
          } else if (e.reason === 'micDisconnected') {
            toast.warning('Microphone disconnected — recording stopped and audio saved.');
          }
          break;
      }
    });
  }, [recorder.subscribeEvents, activelyRecording, settings.recordingLimits.maxMinutes]);

  useEffect(() => {
    if (recorder.status === 'recording') {
      dispatchAdvisory({ type: 'reset' });
    }
  }, [recorder.status]);

  if (idle && !wasAutoStopped) {
    return (
      <IdleRecordingCard
        onStart={onStart}
        onUpload={onUpload}
        onSkip={onSkip}
        uploadStatus={uploadStatus}
        isAddingClip={clips.length > 0}
        capabilities={capabilities}
      />
    );
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

      {activelyRecording && silenceActive && !silenceWarnDismissed && (
        <StatusBanner
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          color="negative"
          onDismiss={() => dispatchAdvisory({ type: 'dismissSilenceWarn' })}
        >
          No audio detected for 30 seconds — microphone may be muted or disconnected. Check your mic
          and try speaking.
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
                dispatchAdvisory({ type: 'clearAutoStopped' });
                void onStart();
              }}
            >
              Resume
            </button>
          }
          onDismiss={() => dispatchAdvisory({ type: 'clearAutoStopped' })}
        >
          Recording auto-stopped after {settings.recordingLimits.idleAutoStopMinutes} min of
          inactivity.
        </StatusBanner>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {recording ? (
          <motion.div
            key="active"
            className="relative"
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : duration.slow, ease: ease.enter }}
          >
            {!reduceMotion && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  borderRadius: 16,
                  background:
                    'radial-gradient(circle at 20% 15%, color-mix(in srgb, var(--color-pt-red) 30%, transparent), transparent 65%)',
                }}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: ease.exit }}
              />
            )}
            <ActiveRecordingCard
              subscribeDuration={recorder.subscribeDuration}
              getDurationSec={recorder.getDurationSec}
              paused={recorder.status === 'paused'}
              chainActive={false}
              analyser={recorder.analyser}
              webSpeech={webSpeech}
              whisperBubbles={whisperBubbles}
              wasmSupported={capabilities?.wasmSupported}
              onPauseResume={onPauseResume}
              onStopAndFinish={onStopAndFinish}
            />
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : duration.base, ease: ease.enter }}
          >
            <IdleRecordingCard
              onStart={onStart}
              onUpload={onUpload}
              onSkip={onSkip}
              uploadStatus={uploadStatus}
              isAddingClip={clips.length > 0}
              capabilities={capabilities}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {recording && (
        <RecordingSizeHint
          subscribeDuration={recorder.subscribeDuration}
          getDurationSec={recorder.getDurationSec}
        />
      )}

      {recording && softWarnActive && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="caution">
          This take has been recording for{' '}
          <RecordingElapsedMinutes
            subscribeDuration={recorder.subscribeDuration}
            getDurationSec={recorder.getDurationSec}
          />{' '}
          min — consider stopping and starting a fresh clip. Auto-stop at{' '}
          {settings.recordingLimits.maxMinutes} min.
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
