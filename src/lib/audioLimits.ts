/**
 * Audio recording limits.
 *
 * Cloudflare Workers AI Whisper (whisper-large-v3-turbo) reliably handles
 * single-shot transcription requests around the 30-minute mark. We auto-rotate
 * to a new clip a few minutes before that to leave a safety margin, so even a
 * very long session is split into chunks each provider accepts cleanly.
 */

/** Hard cap — when a single clip's recorded duration crosses this, the page rotates to a new clip. */
export const MAX_CLIP_DURATION_SEC = 1500; // 25 min

/** Soft warning threshold — surface a visual hint before the auto-rotate. */
export const WARN_CLIP_DURATION_SEC = 1200; // 20 min (80% of the cap)
