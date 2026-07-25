import { mergeAudioBlobs } from '@/lib/audio/merge';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { isMergeable } from '@/utils/clips';
import type { SessionClip, Settings } from '@/types';

export interface CaptureEndInput {
  /** The full, current clip list — not a stale render snapshot. */
  clips: SessionClip[];
  loadAudio: (clipId: string) => Promise<Blob | null>;
  silenceDetection: Settings['audio']['silenceDetection'];
}

export interface CaptureEndResult {
  /** Silence-trimmed, merged session audio. `null` when no clip audio loaded. */
  silenced: Blob | null;
  /** Mergeable clips whose audio could not be read back from the repository. */
  droppedClips: number;
  /** Clips whose silence trim threw — their untrimmed audio was used instead. */
  trimFailures: number;
  /** Compiled baseline: best available text per clip (transcript › t2 › t1). */
  baseline: string;
  /** T1-only join, frozen separately from the compiled baseline. */
  t1: string;
}

/**
 * The Capture-end pipeline (CONTEXT.md §Capture phase): consolidate clips →
 * silence-remove → compile the transcript baseline.
 *
 * Pure by construction — audio comes in through `loadAudio`, nothing is
 * persisted, nothing is navigated. Callers own promoteTier, persistence and
 * the tab switch, so this runs with fake blobs in a test.
 */
export async function runCaptureEnd({
  clips,
  loadAudio,
  silenceDetection,
}: CaptureEndInput): Promise<CaptureEndResult> {
  const mergeable = clips.filter(isMergeable);
  const loaded = await Promise.all(mergeable.map((c) => loadAudio(c.id).catch(() => null)));
  const blobs = loaded.filter((b): b is Blob => b !== null);

  let trimFailures = 0;
  const trimmed = silenceDetection.enabled
    ? await Promise.all(
        blobs.map((blob) =>
          trimSilence(blob, {
            sensitivity: silenceDetection.sensitivity,
            padMs: silenceDetection.padMs,
          })
            .then((r) => r.trimmed)
            .catch(() => {
              trimFailures++;
              return blob;
            }),
        ),
      )
    : blobs;

  // Trim per clip, then merge once. The pre-trim merge this used to also
  // compute had no reader — a full decode + WAV re-encode of the whole visit.
  const silenced = trimmed.length > 0 ? await mergeAudioBlobs(trimmed) : null;

  const join = (texts: (string | undefined)[]) =>
    texts
      .map((t) => t?.trim())
      .filter((t): t is string => Boolean(t))
      .join('\n\n');

  return {
    silenced,
    droppedClips: mergeable.length - blobs.length,
    trimFailures,
    t1: join(clips.map((c) => c.t1Transcript)),
    baseline: join(clips.map((c) => c.transcript || c.t2Transcript || c.t1Transcript)),
  };
}
