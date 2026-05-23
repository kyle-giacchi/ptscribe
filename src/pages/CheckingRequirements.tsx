import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Cpu, Database, Globe, Mic, X } from 'lucide-react';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { useSettings } from '@/contexts/SettingsProvider';
import { isDemoMode, DEMO_SESSION_ID } from '@/lib/demoMode';
import { whisperLoader, LOCAL_WHISPER_DEFAULT_MODEL } from '@/services/ai/client/localWhisper';

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckId = 'browser' | 'mic' | 'whisper' | 'storage';
type CheckStatus = 'pending' | 'active' | 'pass' | 'warn' | 'fail';

interface CheckResult {
  status: CheckStatus;
  detail: string;
  fix?: { label: string; onClick: () => void };
}

type GateState = Record<CheckId, CheckResult>;

const CHECK_ORDER: CheckId[] = ['browser', 'mic', 'whisper', 'storage'];

const MODEL_LABEL = LOCAL_WHISPER_DEFAULT_MODEL.replace(/^.*\//, ''); // "whisper-tiny.en"

const META: Record<CheckId, { title: string; icon: ReactNode }> = {
  browser: { title: 'Browser compatibility', icon: <Globe size={20} strokeWidth={1.8} /> },
  mic: { title: 'Microphone', icon: <Mic size={20} strokeWidth={1.8} /> },
  whisper: { title: 'Local audio processing', icon: <Cpu size={20} strokeWidth={1.8} /> },
  storage: { title: 'Storage', icon: <Database size={20} strokeWidth={1.8} /> },
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pending: 'queued',
  active: 'checking…',
  pass: 'ready',
  warn: 'warning',
  fail: 'blocked',
};

// ── Formatting helpers ──────────────────────────────────────────────────────────

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

function fmtMb(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}

function browserLabel(): string {
  const uaData = (navigator as { userAgentData?: { brands?: { brand: string; version: string }[] } })
    .userAgentData;
  const brand = uaData?.brands?.find((b) => !/not.?a.?brand/i.test(b.brand));
  if (brand) return `${brand.brand} ${brand.version}`;
  const m = navigator.userAgent.match(/(Edg|OPR|Chrome|Firefox|Safari)\/(\d+)/);
  if (m) {
    const name = m[1] === 'Edg' ? 'Edge' : m[1] === 'OPR' ? 'Opera' : m[1];
    return `${name} ${m[2]}`;
  }
  return 'Browser';
}

// ── Status pip ──────────────────────────────────────────────────────────────────

function Pip({ status }: { status: CheckStatus }) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: '50%',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  };

  if (status === 'active') {
    return (
      <span
        aria-hidden
        style={{
          ...base,
          background: 'var(--color-pt-surface-alt)',
          border: '1px solid var(--color-pt-accent)',
        }}
      >
        <span
          className="animate-spin"
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '1.6px solid var(--color-pt-accent)',
            borderTopColor: 'transparent',
          }}
        />
      </span>
    );
  }
  if (status === 'pass') {
    return (
      <span style={{ ...base, background: 'var(--color-pt-accent)', color: '#fff' }} aria-hidden>
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  if (status === 'warn') {
    return (
      <span
        style={{
          ...base,
          background: 'color-mix(in oklab, var(--color-pt-amber) 20%, var(--color-pt-surface))',
          color: 'var(--color-pt-amber)',
          border: '1px solid color-mix(in oklab, var(--color-pt-amber) 50%, transparent)',
        }}
        aria-hidden
      >
        !
      </span>
    );
  }
  if (status === 'fail') {
    return (
      <span style={{ ...base, background: 'var(--color-pt-red)', color: '#fff' }} aria-hidden>
        <X size={12} strokeWidth={3} />
      </span>
    );
  }
  // pending
  return (
    <span
      aria-hidden
      style={{ ...base, background: 'transparent', border: '1px solid var(--color-pt-border)' }}
    />
  );
}

// ── Check row ─────────────────────────────────────────────────────────────────

function CheckRow({ id, result, last }: { id: CheckId; result: CheckResult; last: boolean }) {
  const { status, detail, fix } = result;
  const pending = status === 'pending';
  return (
    <li
      aria-live={status === 'active' ? 'polite' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--color-pt-border)',
        background: status === 'active' ? 'var(--color-pt-surface-alt)' : 'transparent',
      }}
    >
      <span
        style={{ color: pending ? 'var(--color-pt-text-3)' : 'var(--color-pt-text-2)', display: 'flex' }}
        aria-hidden
      >
        {META[id].icon}
      </span>
      <div style={{ flex: 1, display: 'grid', gap: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: status === 'active' || status === 'pass' ? 600 : 500,
            color: pending ? 'var(--color-pt-text-3)' : 'var(--color-pt-text)',
          }}
        >
          {META[id].title}
        </span>
        {detail && (
          <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>{detail}</span>
        )}
        {fix && (
          <button
            onClick={fix.onClick}
            style={{
              justifySelf: 'start',
              marginTop: 4,
              fontSize: 11.5,
              fontWeight: 600,
              color: 'var(--color-pt-accent-fg)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {fix.label}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-pt-text-3)',
          }}
        >
          {STATUS_LABEL[status]}
        </span>
        <Pip status={status} />
      </div>
    </li>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

const INITIAL: GateState = {
  browser: { status: 'pending', detail: '' },
  mic: { status: 'pending', detail: '' },
  whisper: { status: 'pending', detail: '' },
  storage: { status: 'pending', detail: '' },
};

export function CheckingRequirements() {
  const navigate = useNavigate();
  const { updateFirstRun } = useSettings();
  const [params] = useSearchParams();
  const demo = isDemoMode();

  const [state, setState] = useState<GateState>(INITIAL);
  // Don't auto-advance if the user signals intent to stay by hovering Cancel.
  const cancelHoveredRef = useRef(false);

  const update = useCallback((id: CheckId, patch: Partial<CheckResult>) => {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // ── Individual checks ──────────────────────────────────────────────────────
  const runMicCheck = useCallback(async () => {
    // Inner declaration so the "try again" fix can recurse without the callback
    // referencing itself before it is initialised.
    async function attempt(): Promise<void> {
      update('mic', { status: 'active', detail: 'Requesting access…', fix: undefined });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const track = stream.getAudioTracks()[0];
        const s = track?.getSettings?.() ?? {};
        const label = track?.label?.trim() || 'Default microphone';
        const sr = s.sampleRate ? `${Math.round(s.sampleRate / 1000)} kHz` : '';
        const ch = s.channelCount === 1 ? 'mono' : s.channelCount === 2 ? 'stereo' : '';
        const dBFS = await sampleRms(stream).catch(() => null);
        stream.getTracks().forEach((t) => t.stop());
        const detail = [label, [sr, ch].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
        if (dBFS != null && dBFS < -60) {
          update('mic', { status: 'warn', detail: `${detail} · input is very quiet` });
        } else {
          update('mic', { status: 'pass', detail });
        }
      } catch {
        update('mic', {
          status: 'fail',
          detail: 'Permission denied — allow the mic in your browser to record',
          fix: { label: 'Request access again', onClick: () => void attempt() },
        });
      }
    }
    await attempt();
  }, [update]);

  const runWhisperCheck = useCallback(() => {
    function attempt(): void {
      update('whisper', {
        status: 'active',
        detail: 'Preparing on-device model…',
        fix: undefined,
      });
      const unsub = whisperLoader.onProgress((p) => {
        if (p.phase === 'downloading') {
          const mb =
            p.loadedBytes != null && p.totalBytes != null
              ? ` (${fmtMb(p.loadedBytes)}/${fmtMb(p.totalBytes)})`
              : '';
          update('whisper', {
            status: 'active',
            detail: `Downloading ${MODEL_LABEL} · ${p.pct ?? 0}%${mb}`,
          });
        } else if (p.phase === 'loading') {
          update('whisper', { status: 'active', detail: `Loading ${MODEL_LABEL}…` });
        }
      });
      whisperLoader
        .ensureReady()
        .then(() =>
          update('whisper', { status: 'pass', detail: `${MODEL_LABEL} loaded · runs on-device` }),
        )
        .catch(() =>
          update('whisper', {
            status: 'fail',
            detail: "Couldn't load the model — check your connection",
            fix: {
              label: 'Retry download',
              onClick: () => {
                whisperLoader.reset();
                attempt();
              },
            },
          }),
        )
        .finally(() => unsub());
    }
    attempt();
  }, [update]);

  // Kick off every check on mount. The model download starts immediately here
  // even though it reads as a later step in the list.
  useEffect(() => {
    runBrowserCheck(update);
    void runStorageCheck(update);
    void runMicCheck();
    runWhisperCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPass = CHECK_ORDER.every((id) => state[id].status === 'pass');

  const finishGate = useCallback(
    (target: string) => {
      updateFirstRun({ setupCheckDoneAt: Date.now() });
      navigate(target, { replace: true });
    },
    [navigate, updateFirstRun],
  );

  const continueTarget =
    params.get('return') ?? (demo ? `/sessions/${DEMO_SESSION_ID}` : '/today');

  // Gentle auto-advance once everything is green (unless the user hovers Cancel).
  useEffect(() => {
    if (!allPass || cancelHoveredRef.current) return;
    const t = setTimeout(() => finishGate(continueTarget), 800);
    return () => clearTimeout(t);
  }, [allPass, continueTarget, finishGate]);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-pt-landing-bg)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 22px',
          background: 'var(--color-pt-surface)',
          borderBottom: '1px solid var(--color-pt-border)',
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: 'var(--color-pt-accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          P
        </div>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-pt-text)' }}>PTScribe</span>
      </header>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          minHeight: 'calc(100dvh - 51px)',
        }}
      >
        <div style={{ textAlign: 'center', display: 'grid', gap: 6, marginBottom: 28 }}>
          <Eyebrow>Getting ready</Eyebrow>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
            Checking your setup
          </h1>
          <p
            style={{
              fontSize: 12.5,
              color: 'var(--color-pt-text-2)',
              maxWidth: 460,
              margin: '0 auto',
              lineHeight: 1.5,
            }}
          >
            A one-time check before you record — confirms audio capture &amp; on-device transcription
            will work.
          </p>
        </div>

        <SurfaceCard padding={0} style={{ width: 560, maxWidth: '100%' }}>
          <ul aria-label="Setup checks" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {CHECK_ORDER.map((id, i) => (
              <CheckRow
                key={id}
                id={id}
                result={state[id]}
                last={i === CHECK_ORDER.length - 1}
              />
            ))}
          </ul>
        </SurfaceCard>

        <div style={{ display: 'flex', gap: 12, marginTop: 22, alignItems: 'center' }}>
          <PtButton
            variant="ghost"
            onClick={() => finishGate(demo ? `/sessions/${DEMO_SESSION_ID}` : '/today')}
            onMouseEnter={() => {
              cancelHoveredRef.current = true;
            }}
            onMouseLeave={() => {
              cancelHoveredRef.current = false;
            }}
          >
            Cancel
          </PtButton>
          <PtButton variant="primary" onClick={() => finishGate(continueTarget)}>
            Continue to recording →
          </PtButton>
        </div>

        <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
          Transcription runs locally. Off-device AI enhancements available.
        </p>
      </div>
    </div>
  );
}

// ── Standalone check runners (module scope keeps the component lean) ─────────────

type UpdateFn = (id: CheckId, patch: Partial<CheckResult>) => void;

function runBrowserCheck(update: UpdateFn) {
  update('browser', { status: 'active', detail: 'Detecting capabilities…' });
  const hasAudio =
    typeof AudioContext !== 'undefined' ||
    typeof (window as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  const hasStorageMgr =
    typeof navigator.storage !== 'undefined' && typeof navigator.storage.estimate === 'function';
  const hasWasm = typeof WebAssembly !== 'undefined' && typeof WebAssembly.compile === 'function';

  if (hasAudio && hasMediaRecorder && hasStorageMgr && hasWasm) {
    update('browser', { status: 'pass', detail: `${browserLabel()} · all APIs supported` });
  } else {
    update('browser', {
      status: 'fail',
      detail: 'Unsupported browser — use Chrome, Edge or Brave',
      fix: {
        label: 'Copy this page’s URL',
        onClick: () => void navigator.clipboard?.writeText(window.location.href),
      },
    });
  }
}

async function runStorageCheck(update: UpdateFn) {
  update('storage', { status: 'active', detail: 'Checking quota…' });
  try {
    // Reduce eviction risk so cached models survive between visits.
    await navigator.storage?.persist?.();
    const est = await navigator.storage.estimate();
    const available = (est.quota ?? 0) - (est.usage ?? 0);
    if (available < 200 * MB) {
      update('storage', { status: 'fail', detail: 'Storage full — free ~1 GB to continue' });
    } else if (available < GB) {
      update('storage', {
        status: 'warn',
        detail: `${fmtMb(available)} available · long visits may not save`,
      });
    } else {
      update('storage', { status: 'pass', detail: `${(available / GB).toFixed(1)} GB available` });
    }
  } catch {
    update('storage', { status: 'pass', detail: 'Storage available' });
  }
}

/** Sample the live mic for ~300 ms and return a rough peak level in dBFS. */
async function sampleRms(stream: MediaStream): Promise<number> {
  const ctx = new AudioContext();
  try {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    await new Promise((r) => setTimeout(r, 300));
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    return 20 * Math.log10(rms || 1e-7);
  } finally {
    void ctx.close();
  }
}
