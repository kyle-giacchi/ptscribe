import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { BlobWaveform } from '@/components/audio/BlobWaveform';
import { ClipsAudioDebug } from '@/components/sessions/ClipsAudioDebug';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { audioRepository } from '@/services/AudioRepository';
import { mergeAudioBlobs } from '@/lib/audio/merge';
import { vault } from '@/lib/vault/vault';
import type { Session } from '@/types';
import { CollapsibleSection, SettingChip } from './atoms';

/**
 * Session-scoped audio inspection panel for the Debug Menu, migrated from the
 * Admin page's AudioClipsAccordion. Lazy-loads clip blobs from IndexedDB only
 * while the vault is unlocked, then renders per-clip waveforms and the merged
 * silenced blob that is the canonical T2/T3 transcription source.
 */

function ClipAudioPlayer({ clipIndex, blob }: { clipIndex: number; blob: Blob }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-pt-text-3)',
        }}
      >
        Clip {clipIndex + 1}
      </div>
      <BlobWaveform blob={blob} />
    </div>
  );
}

function SessionMergedAudio({ mergedBlob }: { mergedBlob: Blob }) {
  const { activeSilenced, compilingSilence } = useAudioProcessing(mergedBlob);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-pt-text-2)', marginBottom: 4 }}>
          Merged Full Audio
        </div>
        <BlobWaveform blob={mergedBlob} />
      </div>

      <div>
        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-pt-text-2)' }}>
            Merged Silenced
          </span>
          <span style={{ fontSize: 9.5, color: '#0ea5e9' }}>T2 / T3 source</span>
          {activeSilenced && activeSilenced.savedSec > 0 && (
            <span style={{ fontSize: 9.5, fontWeight: 600, color: '#10b981' }}>
              −{activeSilenced.savedSec.toFixed(1)}s saved
            </span>
          )}
        </div>
        {compilingSilence ? (
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
            <Loader2 size={11} className="animate-spin" /> Computing…
          </div>
        ) : activeSilenced ? (
          <BlobWaveform blob={activeSilenced.blob} />
        ) : null}
      </div>
    </div>
  );
}

function SessionAudioBody({ session }: { session: Session }) {
  // Track which session.id the loaded blobs belong to so `loading` derives
  // synchronously — avoids a sync setState(true) in the effect body.
  const [loaded, setLoaded] = useState<{
    id: string;
    clipBlobs: Map<string, Blob>;
    mergedBlob: Blob | null;
  } | null>(null);
  const vaultUnlocked = vault.isUnlocked();
  const loading = vaultUnlocked && loaded?.id !== session.id;
  const clipBlobs = loaded?.clipBlobs ?? new Map<string, Blob>();
  const mergedBlob = loaded?.mergedBlob ?? null;

  useEffect(() => {
    if (!vaultUnlocked) return;
    let cancelled = false;
    async function load() {
      const sorted = [...session.clips].sort((a, b) => a.index - b.index);
      const entries = await Promise.all(
        sorted.map(async (c) => {
          const blob = await audioRepository.load(c.id);
          return [c.id, blob] as [string, Blob | null];
        }),
      );
      if (cancelled) return;
      const map = new Map<string, Blob>();
      for (const [id, blob] of entries) {
        if (blob) map.set(id, blob);
      }

      const blobs = sorted.map((c) => map.get(c.id)).filter((b): b is Blob => Boolean(b));
      let merged: Blob | null = null;
      if (blobs.length > 0) {
        try {
          merged = await mergeAudioBlobs(blobs);
        } catch {
          // merge failure — merged section simply won't render
        }
      }
      if (cancelled) return;
      setLoaded({ id: session.id, clipBlobs: map, mergedBlob: merged });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [session.id, session.clips, vaultUnlocked]);

  if (!vaultUnlocked) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg p-3"
        style={{ background: 'var(--color-pt-surface-mut)' }}
      >
        <AlertCircle size={13} style={{ color: 'var(--color-pt-text-3)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
          Vault locked — unlock to access audio
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
        <Loader2 size={12} className="animate-spin" /> Loading audio from IndexedDB…
      </div>
    );
  }

  const sortedClips = [...session.clips].sort((a, b) => a.index - b.index);
  const clipsWithBlobs = sortedClips.filter((c) => clipBlobs.has(c.id));

  if (clipsWithBlobs.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {clipsWithBlobs.length > 1 && (
        <div className="flex flex-col gap-3">
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-pt-text-3)',
            }}
          >
            Individual Clips
          </div>
          {clipsWithBlobs.map((clip) => (
            <ClipAudioPlayer key={clip.id} clipIndex={clip.index} blob={clipBlobs.get(clip.id)!} />
          ))}
        </div>
      )}

      {mergedBlob && <SessionMergedAudio mergedBlob={mergedBlob} />}
    </div>
  );
}

export function SessionAudioPanel({ session }: { session: Session }) {
  const { settings } = useSettings();
  const sd = settings.audio.silenceDetection;
  const sortedClips = useMemo(
    () => [...session.clips].sort((a, b) => a.index - b.index),
    [session.clips],
  );

  const badge = (
    <span style={{ fontSize: 10.5, color: 'var(--color-pt-text-3)' }}>
      {session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}
    </span>
  );

  return (
    <CollapsibleSection title="Audio clips" badge={badge}>
      <div className="mb-1 flex flex-wrap gap-2">
        <SettingChip
          label="Silence removal"
          value={sd.enabled ? `ON · ${sd.sensitivity} · ${sd.padMs}ms pad` : 'OFF'}
          ok={sd.enabled}
        />
      </div>
      <ClipsAudioDebug clips={sortedClips} />
      {session.clips.length > 0 && (
        <div className="mt-3">
          <SessionAudioBody session={session} />
        </div>
      )}
    </CollapsibleSection>
  );
}
