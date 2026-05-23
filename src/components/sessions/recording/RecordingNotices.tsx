import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { MAX_AUDIO_BYTES } from '@/lib/audioLimits';
import type { UseWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import { StatusBanner } from './StatusBanner';

// ── Estimated file size hint ───────────────────────────────────────────────────
const ESTIMATED_BYTES_PER_SEC = 8 * 1024;
const WARN_THRESHOLD_BYTES = 20 * 1024 * 1024;

export function RecordingSizeHint({ durationSec }: { durationSec: number }) {
  const estimatedBytes = durationSec * ESTIMATED_BYTES_PER_SEC;
  const estimatedMb = estimatedBytes / (1024 * 1024);
  const approachingCap = estimatedBytes >= WARN_THRESHOLD_BYTES;
  const overCap = estimatedBytes >= MAX_AUDIO_BYTES;

  if (overCap) {
    return (
      <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
        Estimated ~{estimatedMb.toFixed(1)} MB — past the 25 MB Whisper upload limit. Stop and
        start a new clip.
      </StatusBanner>
    );
  }
  if (approachingCap) {
    return (
      <StatusBanner icon={<Info className="h-3.5 w-3.5" />} color="info">
        Estimated ~{estimatedMb.toFixed(1)} MB of 25 MB. Consider stopping &amp; starting a new
        clip soon.
      </StatusBanner>
    );
  }
  return null;
}

export function RecordingNotices({
  recorderError,
  webspeechProvider,
  liveSupported,
  liveError,
  hasFailedClip,
}: {
  recorderError: string | null;
  webspeechProvider: boolean;
  liveSupported: boolean;
  liveError: string | null;
  hasFailedClip: boolean;
}) {
  return (
    <>
      {webspeechProvider && (
        <div
          className="flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
          style={{
            background: 'var(--color-pt-accent-soft)',
            color: 'var(--color-pt-accent-fg)',
            border: '1px solid var(--color-pt-accent-border)',
          }}
        >
          <CheckCircle2 size={10} strokeWidth={2.5} />
          Local Transcription Enabled
        </div>
      )}
      {recorderError && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
          {recorderError}
        </StatusBanner>
      )}
      {hasFailedClip && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="caution">
          One or more clips failed to transcribe. Open the Transcription step to retry.
        </StatusBanner>
      )}
      {webspeechProvider && !liveSupported && (
        <StatusBanner icon={<Info className="h-3.5 w-3.5" />} color="info">
          This browser doesn&apos;t support live transcription. Switch transcription to Cloudflare
          in Settings to transcribe recordings.
        </StatusBanner>
      )}
      {webspeechProvider && liveSupported && (
        <p className="text-xs" style={{ color: 'var(--color-pt-text-3)' }}>
          Browser transcription can&apos;t tell speakers apart, which can muddle the generated note.
          Upgrade to Cloudflare Nova-3 for speaker labeling.
        </p>
      )}
      {liveSupported && liveError && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
          Live captions stopped: {liveErrorHint(liveError)}
        </StatusBanner>
      )}
    </>
  );
}

function liveErrorHint(err: string): string {
  switch (err) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was blocked for speech recognition.';
    case 'no-speech':
      return 'No speech was detected.';
    case 'audio-capture':
      return 'No microphone was found.';
    case 'network':
      return 'Browser speech recognition was blocked — this is common in private/incognito mode. Your recording is still being saved and can be transcribed after.';
    default:
      return 'Switch to Cloudflare in Settings to transcribe saved clips instead.';
  }
}

// ── Live transcript overlay ────────────────────────────────────────────────────
export function LiveTranscriptPreview({ webSpeech }: { webSpeech: UseWebSpeechTranscript }) {
  if (!(webSpeech.listening || webSpeech.interimText || webSpeech.accumulatedText)) return null;
  return (
    <div
      className="rounded-lg px-3.5 py-2.5 text-xs"
      style={{
        border: '1px solid var(--color-pt-accent-border)',
        background: 'var(--color-pt-accent-soft)',
        color: 'var(--color-pt-text-2)',
      }}
    >
      <span className="font-semibold" style={{ color: 'var(--color-pt-accent-fg)' }}>
        Live:{' '}
      </span>
      <span style={{ color: 'var(--color-pt-text)' }}>{webSpeech.accumulatedText}</span>
      {webSpeech.interimText && (
        <span className="italic" style={{ color: 'var(--color-pt-text-3)' }}>
          {' '}
          {webSpeech.interimText}
        </span>
      )}
    </div>
  );
}
