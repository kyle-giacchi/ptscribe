import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Mic,
  Cpu,
  Sparkles,
  Pencil,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Clock,
  HardDrive,
  Monitor,
  Zap,
} from 'lucide-react';
import { SurfaceCard, Eyebrow } from '@/components/design';
import { BlobWaveform } from '@/components/audio/BlobWaveform';
import { ClipsList } from '@/components/sessions/ClipsList';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { audioRepository } from '@/services/AudioRepository';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { vault } from '@/lib/vault/vault';
import type { Patient, Session } from '@/types';

// ─── Copy hook ────────────────────────────────────────────────────────────────

function useCopy(): { copied: string | null; copy: (text: string, key?: string) => void } {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, key?: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        const k = key ?? text;
        setCopied(k);
        setTimeout(() => setCopied(null), 1800);
      })
      .catch(() => {});
  }, []);
  return { copied, copy };
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

type TierLevel = 1 | 2 | 3 | 4;

const TIER_META: Record<
  TierLevel,
  { label: string; color: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }
> = {
  1: { label: 'T1 Live Whisper', color: '#6366f1', Icon: Mic },
  2: { label: 'T2 Post Whisper', color: '#0ea5e9', Icon: Cpu },
  3: { label: 'T3 Nova', color: '#10b981', Icon: Sparkles },
  4: { label: 'Edited', color: '#f59e0b', Icon: Pencil },
};

function TierBadge({ tier, active }: { tier: TierLevel; active: boolean }) {
  const { label, Icon, color } = TIER_META[tier];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        background: active
          ? `color-mix(in oklab, ${color} 12%, transparent)`
          : 'var(--color-pt-surface-mut)',
        color: active ? color : 'var(--color-pt-text-3)',
        border: `1px solid ${active ? `color-mix(in oklab, ${color} 30%, transparent)` : 'transparent'}`,
      }}
    >
      <Icon size={10} strokeWidth={2} />
      {label}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:     { label: 'draft',      color: 'var(--color-pt-text-3)' },
  recording: { label: 'recording',  color: '#ef4444' },
  ready:     { label: 'ready',      color: '#10b981' },
  finalized: { label: 'final',      color: 'var(--color-pt-accent-fg, #2563eb)' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'var(--color-pt-text-3)' };
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        padding: '2px 6px',
        borderRadius: 4,
        background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
        color: meta.color,
        border: `1px solid color-mix(in oklab, ${meta.color} 25%, transparent)`,
      }}
    >
      {meta.label}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${units[i]}`;
}

function lsBytes(key: string): number {
  const v = localStorage.getItem(key);
  return v ? (key.length + v.length) * 2 : 0;
}

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/'))
    return { name: 'Edge', version: ua.match(/Edg\/(\d+)/)?.[1] ?? '?', engine: 'Blink' };
  if (ua.includes('Chrome/'))
    return { name: 'Chrome', version: ua.match(/Chrome\/(\d+)/)?.[1] ?? '?', engine: 'Blink' };
  if (ua.includes('Firefox/'))
    return { name: 'Firefox', version: ua.match(/Firefox\/(\d+)/)?.[1] ?? '?', engine: 'Gecko' };
  if (ua.includes('Version/') && ua.includes('Safari/'))
    return { name: 'Safari', version: ua.match(/Version\/(\d+)/)?.[1] ?? '?', engine: 'WebKit' };
  return { name: 'Unknown', version: '?', engine: '?' };
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown';
}

function wordCount(text?: string): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

// ─── Primitive display atoms ──────────────────────────────────────────────────

function KVRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const { copied, copy } = useCopy();
  const isCopied = copied === value;
  return (
    <div
      className="group flex items-baseline justify-between gap-3 py-1.5 transition-colors"
      style={{
        borderBottom: '1px solid var(--color-pt-border)',
        cursor: copyable ? 'pointer' : 'default',
        borderRadius: copyable ? 4 : 0,
      }}
      onClick={copyable ? () => copy(value) : undefined}
      title={copyable ? `Click to copy` : undefined}
    >
      <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)', flexShrink: 0 }}>{label}</span>
      <span
        className="flex items-center gap-1.5"
        style={{
          fontSize: 11,
          color: 'var(--color-pt-text)',
          textAlign: 'right',
          wordBreak: 'break-all',
          fontFamily: mono ? 'var(--font-mono, ui-monospace, monospace)' : undefined,
        }}
      >
        {value}
        {copyable && (
          <span
            className="opacity-0 transition-opacity group-hover:opacity-100"
            style={{ flexShrink: 0, color: isCopied ? '#10b981' : 'var(--color-pt-text-3)' }}
          >
            {isCopied ? (
              <Check size={10} strokeWidth={2.5} />
            ) : (
              <Copy size={10} strokeWidth={1.75} />
            )}
          </span>
        )}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.9px',
        textTransform: 'uppercase',
        color: 'var(--color-pt-text-3)',
        paddingTop: 12,
        paddingBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function FeaturePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={{ borderBottom: '1px solid var(--color-pt-border)' }}
    >
      <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>{label}</span>
      <span
        className="rounded-full px-2 py-0.5"
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
          background: ok
            ? 'color-mix(in oklab, #10b981 12%, transparent)'
            : 'color-mix(in oklab, #ef4444 12%, transparent)',
          color: ok ? '#10b981' : '#ef4444',
          border: `1px solid ${
            ok
              ? 'color-mix(in oklab, #10b981 30%, transparent)'
              : 'color-mix(in oklab, #ef4444 30%, transparent)'
          }`,
        }}
      >
        {ok ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

function SettingChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
      style={{
        fontSize: 10.5,
        background: ok
          ? 'color-mix(in oklab, #10b981 10%, transparent)'
          : 'var(--color-pt-surface-mut)',
        color: ok ? '#10b981' : 'var(--color-pt-text-3)',
        border: `1px solid ${
          ok ? 'color-mix(in oklab, #10b981 25%, transparent)' : 'var(--color-pt-border)'
        }`,
      }}
    >
      <span style={{ fontWeight: 700 }}>{label}:</span>
      <span>{value}</span>
    </span>
  );
}

// ─── Info cards ───────────────────────────────────────────────────────────────

function BrowserSystemCard() {
  const browser = detectBrowser();
  const os = detectOS();
  const nav = navigator as unknown as Record<string, unknown>;
  const mem = nav.deviceMemory as number | undefined;
  const conn = nav.connection as { effectiveType?: string } | undefined;

  return (
    <SurfaceCard padding="14px">
      <div className="flex items-center gap-2">
        <Monitor size={13} strokeWidth={1.75} style={{ color: 'var(--color-pt-text-3)' }} />
        <Eyebrow>Browser / System</Eyebrow>
      </div>
      <div className="mt-3">
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
        <KVRow
          label="Timezone"
          value={Intl.DateTimeFormat().resolvedOptions().timeZone}
          copyable
        />
        <KVRow label="Online" value={navigator.onLine ? 'Yes' : 'No'} />
      </div>
    </SurfaceCard>
  );
}

interface StorageInfo {
  lsItems: { key: string; bytes: number }[];
  idbClipCount: number;
  idbChunkSessions: number;
  quota?: { usage: number; quota: number };
}

function StorageCard() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setRefreshing(true);
    async function load() {
      try {
        const lsItems = Object.values(STORAGE_KEYS).map((key) => ({
          key,
          bytes: lsBytes(key),
        }));
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
        setInfo({ lsItems, idbClipCount: idbKeys.length, idbChunkSessions: chunkIds.length, quota });
      } catch {
        /* diagnostic card — show stale data on error */
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

  return (
    <SurfaceCard padding="14px">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive size={13} strokeWidth={1.75} style={{ color: 'var(--color-pt-text-3)' }} />
          <Eyebrow>Browser Storage</Eyebrow>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
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
          <RefreshCw
            size={12}
            strokeWidth={2}
            style={{ transition: 'transform 400ms', transform: refreshing ? 'rotate(360deg)' : 'none' }}
            className={refreshing ? 'animate-spin' : ''}
          />
        </button>
      </div>

      {/* Quota bar */}
      {info?.quota != null && usagePct !== null && (
        <div style={{ marginTop: 12 }}>
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
                background:
                  usagePct > 80 ? '#ef4444' : usagePct > 60 ? '#f59e0b' : '#10b981',
                transition: 'width 500ms ease',
              }}
            />
          </div>
        </div>
      )}

      {!info ? (
        <div
          className="mt-3 flex items-center gap-2"
          style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}
        >
          <Loader2 size={12} className="animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="mt-1">
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
    </SurfaceCard>
  );
}

function FeaturesCard() {
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
    hasWebSpeech, hasSAB, hasWorker,
    hasMediaRecorder, webmOpus, oggOpus,
    hasAudioContext, hasIDB, hasSW, hasPersist,
  ];
  const passCount = allFeatures.filter(Boolean).length;
  const total = allFeatures.length;

  const summaryColor =
    passCount === total ? '#10b981' : passCount >= Math.ceil(total * 0.7) ? '#f59e0b' : '#ef4444';

  return (
    <SurfaceCard padding="14px">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={13} strokeWidth={1.75} style={{ color: 'var(--color-pt-text-3)' }} />
          <Eyebrow>Feature Enablement</Eyebrow>
        </div>
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
          {passCount}/{total} passed
        </span>
      </div>
      <div className="mt-3">
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
    </SurfaceCard>
  );
}

// ─── Per-clip audio player ────────────────────────────────────────────────────

function ClipAudioPlayer({ clipIndex, blob }: { clipIndex: number; blob: Blob }) {
  const { settings } = useSettings();
  const { activeSilenced, activeSpedup, compilingSilence, compilingSpeed } =
    useAudioProcessing(blob);
  const su = settings.audio.speedUp;

  return (
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
        Clip {clipIndex + 1}
      </div>

      {/* Full */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-pt-text-2)', marginBottom: 4 }}>
          Full Audio Clip
        </div>
        <BlobWaveform blob={blob} />
      </div>

      {/* Silenced */}
      <div>
        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-pt-text-2)' }}>
            Silenced Audio Clip
          </span>
          {activeSilenced && (
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

      {/* Speed Up */}
      <div>
        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-pt-text-2)' }}>
            Speed Up Audio Clip ({su.speed}×)
          </span>
          {activeSpedup && (
            <span style={{ fontSize: 9.5, fontWeight: 600, color: '#10b981' }}>
              −{activeSpedup.savedSec.toFixed(1)}s saved
            </span>
          )}
        </div>
        {compilingSpeed ? (
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
            <Loader2 size={11} className="animate-spin" /> Computing…
          </div>
        ) : activeSpedup ? (
          <BlobWaveform blob={activeSpedup.blob} />
        ) : null}
      </div>
    </div>
  );
}

// ─── Session audio section (lazy-mounted on expand) ───────────────────────────

function SessionAudioSection({ session }: { session: Session }) {
  const [clipBlobs, setClipBlobs] = useState<Map<string, Blob>>(new Map());
  const [loading, setLoading] = useState(true);
  const vaultUnlocked = vault.isUnlocked();

  useEffect(() => {
    if (!vaultUnlocked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    async function load() {
      const entries = await Promise.all(
        session.clips.map(async (c) => {
          const blob = await audioRepository.load(c.id);
          return [c.id, blob] as [string, Blob | null];
        }),
      );
      const map = new Map<string, Blob>();
      for (const [id, blob] of entries) {
        if (blob) map.set(id, blob);
      }
      setClipBlobs(map);
      setLoading(false);
    }
    void load();
  }, [session.id, vaultUnlocked]);

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
      {clipsWithBlobs.map((clip) => (
        <ClipAudioPlayer key={clip.id} clipIndex={clip.index} blob={clipBlobs.get(clip.id)!} />
      ))}
    </div>
  );
}

// ─── Transcript tabs ──────────────────────────────────────────────────────────

const TRANSCRIPT_TABS = [
  { key: 't1' as const, label: 'T1 Live Whisper', color: '#6366f1', Icon: Mic },
  { key: 't2' as const, label: 'T2 Post Whisper', color: '#0ea5e9', Icon: Cpu },
  { key: 't3' as const, label: 'T3 Nova AI', color: '#10b981', Icon: Sparkles },
  { key: 'edited' as const, label: 'Edited', color: '#f59e0b', Icon: Pencil },
];

type TranscriptKey = (typeof TRANSCRIPT_TABS)[number]['key'];

function TranscriptTabs({ session }: { session: Session }) {
  const { copied, copy } = useCopy();
  const texts: Record<TranscriptKey, string | undefined> = {
    t1: session.t1Transcript,
    t2: session.t2Transcript,
    t3: session.t3Transcript,
    edited: session.editedTranscript,
  };

  const available = TRANSCRIPT_TABS.filter((t) => texts[t.key]);
  const [activeKey, setActiveKey] = useState<TranscriptKey>(available[0]?.key ?? 't1');

  if (available.length === 0) {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
        No session-level transcripts yet.
      </span>
    );
  }

  const active = TRANSCRIPT_TABS.find((t) => t.key === activeKey);
  const text = texts[activeKey];

  return (
    <div>
      {/* Tab strip */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TRANSCRIPT_TABS.map((tab) => {
          const hasText = Boolean(texts[tab.key]);
          const isActive = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              disabled={!hasText}
              onClick={() => setActiveKey(tab.key)}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors"
              style={{
                fontSize: 11,
                fontWeight: 600,
                cursor: hasText ? 'pointer' : 'default',
                opacity: hasText ? 1 : 0.38,
                background: isActive
                  ? `color-mix(in oklab, ${tab.color} 12%, transparent)`
                  : 'var(--color-pt-surface-mut)',
                color: isActive ? tab.color : 'var(--color-pt-text-2)',
                border: `1px solid ${
                  isActive
                    ? `color-mix(in oklab, ${tab.color} 30%, transparent)`
                    : 'transparent'
                }`,
              }}
            >
              <tab.Icon size={10} strokeWidth={2} />
              {tab.label}
              {hasText && (
                <span
                  className="rounded-full px-1.5"
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    background: isActive
                      ? `color-mix(in oklab, ${tab.color} 18%, transparent)`
                      : 'var(--color-pt-surface-alt)',
                    color: isActive ? tab.color : 'var(--color-pt-text-3)',
                  }}
                >
                  {wordCount(texts[tab.key])}w
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Per-clip breakdown */}
      {session.clips.length > 0 && (
        <details className="mb-3">
          <summary
            style={{
              fontSize: 10.5,
              color: 'var(--color-pt-text-3)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            Per-clip breakdown ({session.clips.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {session.clips.map((clip) => (
              <div
                key={clip.id}
                className="flex items-center gap-2 rounded-md px-3 py-2"
                style={{ background: 'var(--color-pt-surface-mut)', fontSize: 11 }}
              >
                <span style={{ fontWeight: 600, color: 'var(--color-pt-text)', flexShrink: 0 }}>
                  Clip {clip.index + 1}
                </span>
                <span style={{ color: 'var(--color-pt-text-3)', flexShrink: 0 }}>
                  {Math.round(clip.durationSec)}s
                </span>
                <div className="ml-auto flex items-center gap-3">
                  {clip.t1Transcript ? (
                    <span style={{ color: '#6366f1' }}>T1 · {wordCount(clip.t1Transcript)}w</span>
                  ) : (
                    <span style={{ color: 'var(--color-pt-text-3)', opacity: 0.5 }}>T1 —</span>
                  )}
                  {clip.t2Transcript ? (
                    <span style={{ color: '#0ea5e9' }}>T2 · {wordCount(clip.t2Transcript)}w</span>
                  ) : (
                    <span style={{ color: 'var(--color-pt-text-3)', opacity: 0.5 }}>T2 —</span>
                  )}
                  {clip.t3Transcript ? (
                    <span style={{ color: '#10b981' }}>T3 · {wordCount(clip.t3Transcript)}w</span>
                  ) : (
                    <span style={{ color: 'var(--color-pt-text-3)', opacity: 0.5 }}>T3 —</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Active transcript */}
      {text && active && (
        <div
          className="rounded-lg p-3"
          style={{
            background: `color-mix(in oklab, ${active.color} 5%, transparent)`,
            borderLeft: `3px solid ${active.color}`,
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: active.color,
              }}
            >
              {active.label} · {wordCount(text)} words
            </div>
            <button
              type="button"
              onClick={() => copy(text, activeKey)}
              className="inline-flex items-center gap-1 transition-opacity hover:opacity-70"
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: copied === activeKey ? '#10b981' : active.color,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              {copied === activeKey ? (
                <>
                  <Check size={10} strokeWidth={2.5} /> Copied
                </>
              ) : (
                <>
                  <Copy size={10} strokeWidth={1.75} /> Copy
                </>
              )}
            </button>
          </div>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.65,
              color: 'var(--color-pt-text)',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {text}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Transcript accordion (sub-accordion inside a session row) ───────────────

function TranscriptAccordion({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const hasAny =
    session.t1Transcript || session.t2Transcript || session.t3Transcript || session.editedTranscript;

  const availableCount = [
    session.t1Transcript,
    session.t2Transcript,
    session.t3Transcript,
    session.editedTranscript,
  ].filter(Boolean).length;

  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid var(--color-pt-border)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          background: open ? 'var(--color-pt-surface-mut)' : 'var(--color-pt-surface-alt)',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: 'var(--color-pt-text-3)', flexShrink: 0 }}>
          {open ? (
            <ChevronDown size={13} strokeWidth={2} />
          ) : (
            <ChevronRight size={13} strokeWidth={2} />
          )}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-pt-text)', flex: 1, textAlign: 'left' }}>
          Transcriptions
        </span>
        {hasAny ? (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 999,
              background: 'color-mix(in oklab, var(--color-pt-accent) 12%, transparent)',
              color: 'var(--color-pt-accent-fg)',
            }}
          >
            {availableCount} tier{availableCount !== 1 ? 's' : ''}
          </span>
        ) : (
          <span style={{ fontSize: 10.5, color: 'var(--color-pt-text-3)' }}>none</span>
        )}
      </button>

      {open && (
        <div style={{ padding: '12px' }}>
          <TranscriptTabs session={session} />
        </div>
      )}
    </div>
  );
}

// ─── Audio clips accordion ────────────────────────────────────────────────────

function AudioClipsAccordion({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const { settings } = useSettings();
  const sd = settings.audio.silenceDetection;
  const su = settings.audio.speedUp;
  const sortedClips = useMemo(
    () => [...session.clips].sort((a, b) => a.index - b.index),
    [session.clips],
  );

  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid var(--color-pt-border)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          background: open ? 'var(--color-pt-surface-mut)' : 'var(--color-pt-surface-alt)',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: 'var(--color-pt-text-3)', flexShrink: 0 }}>
          {open ? (
            <ChevronDown size={13} strokeWidth={2} />
          ) : (
            <ChevronRight size={13} strokeWidth={2} />
          )}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-pt-text)', flex: 1, textAlign: 'left' }}>
          Audio Clips
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--color-pt-text-3)' }}>
          {session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div style={{ padding: '12px' }}>
          <div className="mb-3 flex flex-wrap gap-2">
            <SettingChip
              label="Silence removal"
              value={sd.enabled ? `ON · ${sd.sensitivity} · ${sd.padMs}ms pad` : 'OFF'}
              ok={sd.enabled}
            />
            <SettingChip
              label="Speed-up"
              value={su.enabled ? `ON · ${su.speed}×` : 'OFF'}
              ok={su.enabled}
            />
          </div>
          <ClipsList clips={sortedClips} />
          {session.clips.length > 0 && (
            <div className="mt-4">
              <SessionAudioSection session={session} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Session debug row ────────────────────────────────────────────────────────

function SessionDebugRow({
  session,
  patient,
}: {
  session: Session;
  patient: Patient | undefined;
}) {
  const [open, setOpen] = useState(false);
  const { copied, copy } = useCopy();

  const hasT1 = Boolean(session.t1Transcript);
  const hasT2 = Boolean(session.t2Transcript);
  const hasT3 = Boolean(session.t3Transcript);

  const patientName = patient
    ? `${patient.firstName} ${patient.lastName}`.trim()
    : 'Unknown patient';

  const sessionDate = new Date(session.date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const shortId = session.id.slice(0, 8);

  return (
    <div style={{ borderBottom: '1px solid var(--color-pt-border)' }}>
      {/* Row header */}
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        style={{ padding: '10px 14px', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: 'var(--color-pt-text-3)', flexShrink: 0 }}>
          {open ? (
            <ChevronDown size={14} strokeWidth={2} />
          ) : (
            <ChevronRight size={14} strokeWidth={2} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text)' }}>
            {patientName}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)', marginLeft: 8 }}>
            {sessionDate} · {session.type.replace('_', ' ')} ·{' '}
            {session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={session.status} />
          <TierBadge tier={1} active={hasT1} />
          <TierBadge tier={2} active={hasT2} />
          <TierBadge tier={3} active={hasT3} />
        </span>
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Meta strip */}
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5"
            style={{
              paddingBottom: 12,
              borderBottom: '1px solid var(--color-pt-border)',
              fontSize: 11,
              color: 'var(--color-pt-text-3)',
            }}
          >
            <span className="flex items-center gap-1">
              <Clock size={11} strokeWidth={1.75} />
              {relativeTime(session.date)} · {sessionDate}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 transition-opacity hover:opacity-70"
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: copied === session.id ? '#10b981' : 'var(--color-pt-text-3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              onClick={() => copy(session.id)}
              title={`Copy session ID: ${session.id}`}
            >
              {copied === session.id ? (
                <Check size={10} strokeWidth={2.5} />
              ) : (
                <Copy size={10} strokeWidth={1.75} />
              )}
              {shortId}…
            </button>
          </div>

          <AudioClipsAccordion session={session} />
          <TranscriptAccordion session={session} />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { sessions } = useSessions();
  const { patients } = usePatients();
  const { copied, copy } = useCopy();

  const patientMap = useMemo(
    () => new Map(patients.map((p) => [p.id, p])),
    [patients],
  );

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.date - a.date),
    [sessions],
  );

  function buildReport(): string {
    const browser = detectBrowser();
    return [
      `PTScribe Debug Report — ${new Date().toISOString()}`,
      `Browser: ${browser.name} ${browser.version} (${browser.engine})`,
      `OS: ${detectOS()}`,
      `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      `Sessions: ${sessions.length}`,
      `Patients: ${patients.length}`,
      `Vault: ${vault.isUnlocked() ? 'unlocked' : 'locked'}`,
    ].join('\n');
  }

  return (
    <div
      className="flex flex-col gap-5"
      style={{ padding: '20px 16px', maxWidth: 960, margin: '0 auto' }}
    >
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-pt-text)', margin: 0 }}
          >
            Debug
          </h1>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-pt-text-3)',
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Environment info, storage state, and per-session audio/transcript inspection.
          </p>
        </div>
        <button
          type="button"
          onClick={() => copy(buildReport(), 'report')}
          className="inline-flex shrink-0 items-center gap-1.5 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-surface)',
            color: copied === 'report' ? '#10b981' : 'var(--color-pt-text-2)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copied === 'report' ? (
            <>
              <Check size={12} strokeWidth={2.5} /> Copied
            </>
          ) : (
            <>
              <Copy size={12} strokeWidth={1.75} /> Copy report
            </>
          )}
        </button>
      </div>

      {/* Three info cards */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        <BrowserSystemCard />
        <StorageCard />
        <FeaturesCard />
      </div>

      {/* Session inspector */}
      <SurfaceCard style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '14px 14px 10px',
            borderBottom: '1px solid var(--color-pt-border)',
          }}
        >
          <Eyebrow>Session Inspector</Eyebrow>
          <p
            style={{
              fontSize: 11.5,
              color: 'var(--color-pt-text-3)',
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            {sorted.length} session{sorted.length !== 1 ? 's' : ''} — expand to inspect
            clips, audio pipeline, and transcripts
          </p>
        </div>
        {sorted.length === 0 ? (
          <p
            style={{ padding: '12px 14px', fontSize: 13, color: 'var(--color-pt-text-3)' }}
          >
            No sessions yet.
          </p>
        ) : (
          sorted.map((session) => (
            <SessionDebugRow
              key={session.id}
              session={session}
              patient={patientMap.get(session.patientId)}
            />
          ))
        )}
      </SurfaceCard>
    </div>
  );
}
