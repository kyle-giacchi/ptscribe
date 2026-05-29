import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { PtButton } from '@/components/design';
import { Waveform } from '@/components/design/Waveform';
import type { MicState } from '@/components/design/MicStatusPill';
import { useSettings } from '@/contexts/SettingsProvider';

/** deviceId sentinel meaning "let the browser pick the default mic". */
const DEFAULT_DEVICE = 'default';

// dBFS below which we flag the input as too quiet (matches CheckingRequirements).
const QUIET_DBFS = -60;

type Phase = 'connecting' | 'live' | 'denied' | 'unsupported';

/**
 * Pre-record microphone check. Opens a short-lived stream so the clinician can
 * see a live level meter + waveform and pick which input device a real recording
 * will use. The chosen `deviceId` persists to `Settings.audio.inputDeviceId`.
 *
 * This is a pre-flight check, NOT a recording: it never holds a wake lock and
 * tears its stream + AudioContext down on close/unmount (per the recorder-
 * lifecycle invariant — only a real clip owns the wake lock).
 */
export function AudioCheck({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, updateAudio } = useSettings();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>(
    settings.audio.inputDeviceId ?? DEFAULT_DEVICE,
  );
  const [phase, setPhase] = useState<Phase>('connecting');
  const [level, setLevel] = useState(0); // 0–100, smoothed
  const [dbfs, setDbfs] = useState<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    setAnalyser(null);
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (ctxRef.current) {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      void ctx.close().catch(() => {
        /* best-effort */
      });
    }
    setLevel(0);
    setDbfs(null);
  }, []);

  // (Re)open the stream whenever the modal is open or the selected device changes.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setPhase('unsupported');
        return;
      }
      setPhase('connecting');
      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedId === DEFAULT_DEVICE ? true : { deviceId: { exact: selectedId } },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;

        // Labels are only populated once permission is granted — refresh the list now.
        const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setDevices(all.filter((d) => d.kind === 'audioinput'));

        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          setPhase('unsupported');
          return;
        }
        const ctx = new Ctor();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const node = ctx.createAnalyser();
        node.fftSize = 2048;
        source.connect(node);
        setAnalyser(node);
        setPhase('live');

        // Poll RMS for the numeric meter (~8/s). The Waveform runs its own rAF
        // loop off the same analyser, so we don't re-render per frame here.
        const buf = new Float32Array(node.fftSize);
        meterTimerRef.current = setInterval(() => {
          node.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const db = 20 * Math.log10(rms || 1e-7);
          // Map roughly -60..0 dBFS → 0..100, instant attack / eased decay.
          const target = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
          setLevel((prev) => (target > prev ? target : prev * 0.7 + target * 0.3));
          setDbfs(db);
        }, 120);
      } catch {
        if (!cancelled) setPhase('denied');
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [open, selectedId, teardown]);

  // Belt-and-suspenders: release on unmount even if `open` never flips.
  useEffect(() => () => teardown(), [teardown]);

  const handleUse = () => {
    updateAudio({ inputDeviceId: selectedId === DEFAULT_DEVICE ? undefined : selectedId });
    onClose();
  };

  const tooQuiet = phase === 'live' && dbfs != null && dbfs < QUIET_DBFS;
  const micState: MicState =
    phase === 'denied' || phase === 'unsupported'
      ? 'disconnected'
      : phase === 'connecting'
        ? 'idle'
        : tooQuiet
          ? 'weak'
          : 'connected';

  return (
    <Modal open={open} onClose={onClose} title="Microphone check" size="md">
      <p style={{ fontSize: 13, color: 'var(--color-pt-text-3)', lineHeight: 1.5 }}>
        Speak normally and watch the level move. Pick the input you'll use for the visit —
        recordings will use this microphone.
      </p>

      <label
        style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-pt-text-2)' }}
      >
        Input device
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={phase === 'unsupported'}
          style={{
            marginTop: 6,
            width: '100%',
            padding: '9px 10px',
            borderRadius: 8,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-surface)',
            color: 'var(--color-pt-text)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <option value={DEFAULT_DEVICE}>System default</option>
          {devices.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
      </label>

      <div
        style={{
          borderRadius: 10,
          border: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface-2, var(--color-pt-surface))',
          padding: 12,
        }}
      >
        <Waveform micState={micState} analyser={analyser} height={56} />
        {/* Numeric level meter */}
        <div
          aria-hidden
          style={{
            marginTop: 10,
            height: 8,
            borderRadius: 999,
            background: 'var(--color-pt-border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${level}%`,
              height: '100%',
              background: tooQuiet ? 'var(--color-pt-amber, #c47a09)' : 'var(--color-pt-accent)',
              transition: 'width 100ms linear',
            }}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-pt-text-3)' }}>
          {phase === 'connecting' && 'Connecting to microphone…'}
          {phase === 'denied' &&
            'Microphone access was blocked — allow the mic in your browser, then reopen this check.'}
          {phase === 'unsupported' && 'This browser does not expose microphone access.'}
          {phase === 'live' &&
            (tooQuiet
              ? 'Input is very quiet — check that the right mic is selected and unmuted.'
              : 'Microphone is working.')}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <PtButton variant="ghost" onClick={onClose}>
          Cancel
        </PtButton>
        <PtButton
          variant="primary"
          onClick={handleUse}
          disabled={phase !== 'live'}
          iconLeft={<Mic size={14} />}
        >
          Use this microphone
        </PtButton>
      </div>
    </Modal>
  );
}
