// Approximate public list-price rates as of 2026-04; real costs may vary.
export const WHISPER_USD_PER_MIN = 0.0023;
export const GEN_USD_PER_NOTE = 0.012;

export function formatCostRange(maxMinutes: number): string {
  const transcription = maxMinutes * WHISPER_USD_PER_MIN;
  const generation = GEN_USD_PER_NOTE;
  const total = transcription + generation;
  return `≤ $${total.toFixed(2)} for a ${maxMinutes}-min cap`;
}
