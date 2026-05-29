import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { audioRepository } from '@/services/AudioRepository';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { detectBrowser, detectOS, formatBytes, lsBytes } from '@/lib/debug/env';
import { CollapsibleSection, FeaturePill, KVRow, SectionLabel } from './atoms';

/**
 * Global (session-independent) Debug Menu panels migrated from the old Admin
 * page: browser/system fingerprint, browser-storage usage, and platform
 * feature-detection. All read-only diagnostics — safe to render off-session.
 */

export function EnvironmentPanel() {
  const browser = detectBrowser();
  const os = detectOS();
  const nav = navigator as unknown as Record<string, unknown>;
  const mem = nav.deviceMemory as number | undefined;
  const conn = nav.connection as { effectiveType?: string } | undefined;

  return (
    <CollapsibleSection title="Browser / system">
      <div>
        <KVRow label="Browser" value={`${browser.name} ${browser.version} (${browser.engine})`} />
        <KVRow label="OS" value={os} />
        <KVRow label="Language" value={navigator.language} />
        <KVRow label="CPU cores" value={String(navigator.hardwareConcurrency)} mono />
        {mem !== undefined && <KVRow label="Device memory" value={`${mem} GB`} mono />}
        {conn?.effectiveType && <KVRow label="Connection" value={conn.effectiveType} />}
        <KVRow
          label="Screen"
          value={`${screen.width}×${screen.height} @ ${window.devicePixelRatio}x DPR`}
          mono
        />
        <KVRow label="Timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} copyable />
        <KVRow label="Online" value={navigator.onLine ? 'Yes' : 'No'} />
      </div>
    </CollapsibleSection>
  );
}

interface StorageInfo {
  lsItems: { key: string; bytes: number }[];
  idbClipCount: number;
  idbChunkSessions: number;
  quota?: { usage: number; quota: number };
}

export function StoragePanel() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // `refreshing` flips to true at the refresh click and back to false in the
  // effect's async-finally — avoids a sync setState in the effect body.
  const [refreshing, setRefreshing] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const lsItems = Object.values(STORAGE_KEYS).map((key) => ({ key, bytes: lsBytes(key) }));
        const [idbKeys, chunkIds] = await Promise.all([
          audioRepository.listKeys(),
          audioRepository.listChunkSessionIds(),
        ]);
        let quota: StorageInfo['quota'];
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          if (est.usage != null && est.quota != null) {
            quota = { usage: est.usage, quota: est.quota };
          }
        }
        setInfo({
          lsItems,
          idbClipCount: idbKeys.length,
          idbChunkSessions: chunkIds.length,
          quota,
        });
      } catch {
        /* diagnostic panel — show stale data on error */
      } finally {
        setRefreshing(false);
      }
    }
    void load();
  }, [refreshKey]);

  const usagePct =
    info?.quota != null
      ? Math.min(100, Math.round((info.quota.usage / info.quota.quota) * 100))
      : null;

  const refreshButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setRefreshing(true);
        setRefreshKey((k) => k + 1);
      }}
      disabled={refreshing}
      title="Refresh storage info"
      className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
      style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: 'var(--color-pt-text-3)',
        cursor: 'pointer',
      }}
    >
      <RefreshCw size={12} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
    </button>
  );

  return (
    <CollapsibleSection title="Browser storage" badge={refreshButton}>
      {info?.quota != null && usagePct !== null && (
        <div>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: 'var(--color-pt-text-3)' }}>
              {formatBytes(info.quota.usage)} of {formatBytes(info.quota.quota)}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: usagePct > 80 ? '#ef4444' : usagePct > 60 ? '#f59e0b' : '#10b981',
              }}
            >
              {usagePct}%
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 999,
              background: 'var(--color-pt-surface-mut)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${usagePct}%`,
                borderRadius: 999,
                background: usagePct > 80 ? '#ef4444' : usagePct > 60 ? '#f59e0b' : '#10b981',
                transition: 'width 500ms ease',
              }}
            />
          </div>
        </div>
      )}

      {!info ? (
        <div
          className="flex items-center gap-2"
          style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}
        >
          <Loader2 size={12} className="animate-spin" />
          Loading…
        </div>
      ) : (
        <div>
          <SectionLabel>localStorage</SectionLabel>
          {info.lsItems.map(({ key, bytes }) => (
            <KVRow
              key={key}
              label={key.replace('ptnotes.', '')}
              value={bytes > 0 ? formatBytes(bytes) : '—'}
              mono={bytes > 0}
            />
          ))}
          <SectionLabel>IndexedDB · ptnotes-audio</SectionLabel>
          <KVRow label="Audio clips stored" value={String(info.idbClipCount)} mono />
          <KVRow label="In-progress recordings" value={String(info.idbChunkSessions)} mono />
        </div>
      )}
    </CollapsibleSection>
  );
}

export function FeaturesPanel() {
  const w = window as unknown as Record<string, unknown>;
  const hasWebSpeech = Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  const hasAudioContext = Boolean(w.AudioContext ?? w.webkitAudioContext);
  const hasSAB = typeof SharedArrayBuffer !== 'undefined';
  const hasIDB = typeof indexedDB !== 'undefined';
  const hasWorker = typeof Worker !== 'undefined';
  const webmOpus = hasMediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
  const oggOpus = hasMediaRecorder && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus');
  const hasSW = 'serviceWorker' in navigator;
  const hasPersist = Boolean(navigator.storage?.persist);

  const allFeatures = [
    hasWebSpeech,
    hasSAB,
    hasWorker,
    hasMediaRecorder,
    webmOpus,
    oggOpus,
    hasAudioContext,
    hasIDB,
    hasSW,
    hasPersist,
  ];
  const passCount = allFeatures.filter(Boolean).length;
  const total = allFeatures.length;
  const summaryColor =
    passCount === total ? '#10b981' : passCount >= Math.ceil(total * 0.7) ? '#f59e0b' : '#ef4444';

  const badge = (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        background: `color-mix(in oklab, ${summaryColor} 12%, transparent)`,
        color: summaryColor,
        border: `1px solid color-mix(in oklab, ${summaryColor} 28%, transparent)`,
      }}
    >
      {passCount}/{total}
    </span>
  );

  return (
    <CollapsibleSection title="Feature enablement" badge={badge}>
      <div>
        <SectionLabel>Transcription</SectionLabel>
        <FeaturePill ok={hasWebSpeech} label="Web Speech API (T1 live)" />
        <FeaturePill ok={hasSAB} label="SharedArrayBuffer (Whisper T2)" />
        <FeaturePill ok={hasWorker} label="Web Workers (Whisper T2)" />
        <SectionLabel>Recording</SectionLabel>
        <FeaturePill ok={hasMediaRecorder} label="MediaRecorder" />
        <FeaturePill ok={webmOpus} label="audio/webm;codecs=opus" />
        <FeaturePill ok={oggOpus} label="audio/ogg;codecs=opus" />
        <SectionLabel>Storage / Platform</SectionLabel>
        <FeaturePill ok={hasAudioContext} label="AudioContext" />
        <FeaturePill ok={hasIDB} label="IndexedDB" />
        <FeaturePill ok={hasSW} label="Service Worker" />
        <FeaturePill ok={hasPersist} label="Persistent Storage API" />
      </div>
    </CollapsibleSection>
  );
}
