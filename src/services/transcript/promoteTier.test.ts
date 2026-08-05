import { describe, it, expect } from 'vitest';
import { promoteTier, applyTierWrite, demoteTier } from './promoteTier';

// promoteTier owns the single ordering rule for machine transcript tiers:
// t1 < t2 < t3, and a freshly produced tier may never clobber a higher tier
// that already produced frozen output. It governs the machine baseline only
// (transcript + activeTranscriptTier); it never touches editedTranscript.

const empty = { t1Transcript: undefined, t2Transcript: undefined, t3Transcript: undefined };

describe('promoteTier', () => {
  it('promotes a tier when nothing higher has run', () => {
    expect(promoteTier(empty, { tier: 't2', text: 'hello' })).toEqual({
      transcript: 'hello',
      activeTranscriptTier: 't2',
    });
  });

  it('blocks T2 when a T3 result already exists', () => {
    expect(
      promoteTier({ ...empty, t3Transcript: 'cloud' }, { tier: 't2', text: 'local' }),
    ).toBeNull();
  });

  it('blocks T1 when a T2 result already exists', () => {
    expect(
      promoteTier({ ...empty, t2Transcript: 'whisper' }, { tier: 't1', text: 'live' }),
    ).toBeNull();
  });

  it('lets T3 win over an existing T2', () => {
    expect(
      promoteTier({ ...empty, t2Transcript: 'whisper' }, { tier: 't3', text: 'cloud' }),
    ).toEqual({
      transcript: 'cloud',
      activeTranscriptTier: 't3',
    });
  });

  it('lets T3 win even when both lower tiers are present (top tier never blocked)', () => {
    expect(
      promoteTier(
        { t1Transcript: 'a', t2Transcript: 'b', t3Transcript: undefined },
        { tier: 't3', text: 'c' },
      ),
    ).toEqual({ transcript: 'c', activeTranscriptTier: 't3' });
  });

  it('allows a same-tier re-run to replace (re-merge re-transcription)', () => {
    expect(promoteTier({ ...empty, t2Transcript: 'old' }, { tier: 't2', text: 'new' })).toEqual({
      transcript: 'new',
      activeTranscriptTier: 't2',
    });
  });

  it('treats a whitespace-only higher tier as absent (does not block)', () => {
    expect(promoteTier({ ...empty, t3Transcript: '   ' }, { tier: 't2', text: 'local' })).toEqual({
      transcript: 'local',
      activeTranscriptTier: 't2',
    });
  });
});

describe('applyTierWrite', () => {
  it('returns the complete patch: baseline, freeze field, and edit clear', () => {
    expect(applyTierWrite(empty, { tier: 't2', text: 'hello' })).toEqual({
      transcript: 'hello',
      activeTranscriptTier: 't2',
      editedTranscript: undefined,
      t2Transcript: 'hello',
    });
  });

  it('blocks like promoteTier when a higher tier already ran (the T2-never-clears bug)', () => {
    // Regression: T2 previously wrote its patch without editedTranscript, so a
    // stale scrubbed/edited transcript could shadow a fresh T2 result. A blocked
    // write must return null outright — no partial patch to apply.
    expect(
      applyTierWrite({ ...empty, t3Transcript: 'cloud' }, { tier: 't2', text: 'local' }),
    ).toBeNull();
  });

  it('uses a separate freeze value when the tier field differs from the baseline text', () => {
    expect(
      applyTierWrite(empty, { tier: 't1', text: 'compiled baseline', freeze: 'live-only join' }),
    ).toEqual({
      transcript: 'compiled baseline',
      activeTranscriptTier: 't1',
      editedTranscript: undefined,
      t1Transcript: 'live-only join',
    });
  });

  it('omits the tier field from the patch when freeze is falsy', () => {
    expect(applyTierWrite(empty, { tier: 't1', text: 'compiled baseline', freeze: '' })).toEqual({
      transcript: 'compiled baseline',
      activeTranscriptTier: 't1',
      editedTranscript: undefined,
    });
  });
});

describe('demoteTier', () => {
  it('prefers t2 over t1 when both are frozen', () => {
    expect(demoteTier({ t1Transcript: 'live', t2Transcript: 'whisper' })).toEqual({
      tier: 't2',
      text: 'whisper',
    });
  });

  it('falls back to t1 when t2 is absent', () => {
    expect(demoteTier({ t1Transcript: 'live', t2Transcript: undefined })).toEqual({
      tier: 't1',
      text: 'live',
    });
  });

  it('returns null when no local tier has frozen output', () => {
    expect(demoteTier({ t1Transcript: undefined, t2Transcript: '   ' })).toBeNull();
  });
});
