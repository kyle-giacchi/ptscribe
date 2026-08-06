// src/services/transcript/promoteTier.ts
//
// The single owner of the machine-tier ordering rule. PTScribe produces a
// transcript in up to three machine tiers — T1 (live Web Speech), T2 (local
// Whisper), T3 (cloud Nova) — and the invariant is: a freshly produced tier may
// become the active transcript ONLY if no strictly-higher tier has already
// produced output. (Cloud beats local beats live.) Previously this rule lived as
// an asymmetric `if (t3Transcript) skip` inside the T2 producer, with T1 relying
// on implicit ordering. Concentrating it here makes the order the single source
// of truth and the decision testable without React.
//
// Scope: governs the machine baseline only — `transcript` + `activeTranscriptTier`.
// It never reads or writes `editedTranscript`; the clinician's edit overlay is a
// separate entity. Each producer still freezes its own tier field
// (t1/t2/t3Transcript), whose value can differ from the baseline text (T1 freezes
// a live-only join while the baseline is the compiled per-clip text).

import type { Session } from '@/types';

const TIER_RANK = { t1: 1, t2: 2, t3: 3 } as const;

export type MachineTier = keyof typeof TIER_RANK;

export interface TierPromotion {
  transcript: string;
  activeTranscriptTier: MachineTier;
}

/**
 * Decide whether `produced` may become the active machine transcript.
 *
 * @param frozen   The session's frozen per-tier outputs (the durable evidence of
 *                 which tiers have run — read these, not `activeTranscriptTier`,
 *                 which can be moved by Revert/Unlock/edit).
 * @param produced The newly produced tier and its text.
 * @returns The baseline patch to apply, or `null` if a strictly-higher tier has
 *          already produced output (the produced tier must not clobber it).
 */
export function promoteTier(
  frozen: Pick<Session, 't1Transcript' | 't2Transcript' | 't3Transcript'>,
  produced: { tier: MachineTier; text: string },
): TierPromotion | null {
  const rank = TIER_RANK[produced.tier];
  const higherAlreadyRan = (Object.keys(TIER_RANK) as MachineTier[]).some(
    (t) => TIER_RANK[t] > rank && !!frozen[`${t}Transcript`]?.trim(),
  );
  if (higherAlreadyRan) return null;
  return { transcript: produced.text, activeTranscriptTier: produced.tier };
}

export type TierWritePatch = TierPromotion & {
  editedTranscript: undefined;
} & { [K in `${MachineTier}Transcript`]?: string };

/**
 * The complete tier-write protocol as one patch: promote (if allowed), freeze
 * the producing tier's own field, and clear `editedTranscript` so a stale
 * clinician edit never shadows a fresh machine result. Returns `null` under
 * the same condition as `promoteTier` (a higher tier already produced output).
 *
 * @param produced.freeze The tier field's own frozen value, when it differs
 *                        from the baseline `text` (T1's live-only join vs. the
 *                        compiled per-clip baseline). Defaults to `text`. Falsy
 *                        values are omitted so an empty freeze never clobbers
 *                        a previously-frozen field.
 */
export function applyTierWrite(
  frozen: Pick<Session, 't1Transcript' | 't2Transcript' | 't3Transcript'>,
  produced: { tier: MachineTier; text: string; freeze?: string },
): TierWritePatch | null {
  const promo = promoteTier(frozen, produced);
  if (!promo) return null;
  const freeze = produced.freeze ?? produced.text;
  return {
    ...promo,
    editedTranscript: undefined,
    ...(freeze ? { [`${produced.tier}Transcript`]: freeze } : {}),
  };
}

const LOCAL_TIERS: MachineTier[] = ['t2', 't1']; // descending rank, cloud (t3) excluded

/**
 * The "revert to local" rule: the highest-ranked local (non-cloud) tier that
 * has frozen output. Never returns t3 — reverting to local must not resurrect
 * a cloud result.
 */
export function demoteTier(
  frozen: Pick<Session, 't1Transcript' | 't2Transcript'>,
): { tier: MachineTier; text: string } | null {
  for (const tier of LOCAL_TIERS) {
    const text = frozen[`${tier}Transcript` as 't1Transcript' | 't2Transcript'];
    if (text?.trim()) return { tier, text };
  }
  return null;
}
