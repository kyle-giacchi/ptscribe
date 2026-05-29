import { useSyncExternalStore } from 'react';
import { formatDuration } from '@/utils/format';

export interface RecordingTimerProps {
  /** Subscribe to the recorder's live-duration store (from `useRecorder`). */
  subscribeDuration: (cb: () => void) => () => void;
  /** Read the current elapsed seconds snapshot (from `useRecorder`). */
  getDurationSec: () => number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Leaf that renders the live recording elapsed time as `mm:ss`. It subscribes
 * to the recorder's duration external store via `useSyncExternalStore`, so only
 * this element re-renders on each ~250 ms tick — the parent SessionRoute and the
 * review panels are not reconciled by the recording clock. See plan 11.
 */
export function RecordingTimer({
  subscribeDuration,
  getDurationSec,
  className,
  style,
}: RecordingTimerProps) {
  const durationSec = useSyncExternalStore(subscribeDuration, getDurationSec, getDurationSec);
  return (
    <span className={className} style={style}>
      {formatDuration(durationSec)}
    </span>
  );
}
