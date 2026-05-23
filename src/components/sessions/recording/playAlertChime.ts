// ── Muted-mic alert chime (Web Audio API) ─────────────────────────────────────
// Two-tone ascending fifth (C5 → G5) at low gain — audible but unobtrusive.
export function playAlertChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    for (const [freq, start, dur] of [
      [523.25, 0, 0.12],    // C5
      [783.99, 0.15, 0.18], // G5
    ] as [number, number, number][]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.06, now + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + start + dur);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch {
    // AudioContext unavailable — skip chime
  }
}
