import { useEffect, useRef } from 'react';
import type { MicState } from './MicStatusPill';

const COLORS: Record<MicState, string> = {
  connected: '#0ea5a8',
  paused: '#b4becd',
  weak: '#e08a14',
  disconnected: '#dc2942',
  idle: '#c2cad6',
};

export interface WaveformProps {
  micState: MicState;
  height?: number;
  analyser?: AnalyserNode | null;
}

export function Waveform({ micState, height = 48, analyser }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<MicState>(micState);
  const analyserRef = useRef<AnalyserNode | null>(analyser ?? null);
  const tdDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    stateRef.current = micState;
  }, [micState]);

  useEffect(() => {
    analyserRef.current = analyser ?? null;
    tdDataRef.current = analyser ? new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer> : null;
  }, [analyser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let raf = 0;
    let t = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      const cy = r.height / 2;
      const barCount = Math.floor(r.width / 4);
      const s = stateRef.current;

      ctx.strokeStyle = 'rgba(26,32,48,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(r.width, cy);
      ctx.stroke();

      ctx.fillStyle = COLORS[s];

      const a = analyserRef.current;
      const d = tdDataRef.current;

      if (s === 'connected' && a && d) {
        // Real audio: sample peak amplitude per bar from time-domain data
        a.getByteTimeDomainData(d);
        const sliceWidth = d.length / barCount;
        for (let i = 0; i < barCount; i++) {
          const x = i * 4;
          const start = Math.floor(i * sliceWidth);
          const end = Math.min(Math.floor((i + 1) * sliceWidth), d.length);
          let peak = 0;
          for (let j = start; j < end; j++) {
            const v = Math.abs(d[j] - 128);
            if (v > peak) peak = v;
          }
          const amp = Math.max(2, (peak / 128) * (cy - 4));
          ctx.fillRect(x, cy - amp, 2, amp * 2);
        }
      } else {
        // Synthetic fallback (no analyser, paused, weak, disconnected, idle)
        for (let i = 0; i < barCount; i++) {
          const x = i * 4;
          let amp;
          if (s === 'connected') {
            amp =
              (Math.sin(t * 0.06 + i * 0.35) * 0.5 + 0.55) *
              (Math.sin(t * 0.013 + i * 0.07) * 0.4 + 0.7) *
              (cy - 6);
            amp = Math.max(2, amp);
          } else if (s === 'paused') {
            amp = 1.5;
          } else if (s === 'weak') {
            const gate = Math.sin(t * 0.04 + i * 0.5) > 0.2 ? 1 : 0.1;
            amp = (Math.sin(t * 0.05 + i * 0.4) * 0.4 + 0.5) * (cy - 8) * gate;
            amp = Math.max(1.5, amp);
          } else if (s === 'disconnected') {
            amp = 1.5 + Math.sin(t * 0.1) * 0.5;
          } else {
            amp = 1;
          }
          ctx.fillRect(x, cy - amp, 2, amp * 2);
        }
      }

      if (s === 'disconnected') {
        ctx.strokeStyle = 'rgba(220,41,66,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(r.width - 80, 0);
        ctx.lineTo(r.width - 80, r.height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      t += 1;
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height, display: 'block' }} aria-hidden />;
}
