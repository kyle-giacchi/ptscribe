import { describe, it, expect } from 'vitest';
import { promoteTier } from './promoteTier';

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
    expect(promoteTier({ ...empty, t3Transcript: 'cloud' }, { tier: 't2', text: 'local' })).toBeNull();
  });

  it('blocks T1 when a T2 result already exists', () => {
    expect(promoteTier({ ...empty, t2Transcript: 'whisper' }, { tier: 't1', text: 'live' })).toBeNull();
  });

  it('lets T3 win over an existing T2', () => {
    expect(promoteTier({ ...empty, t2Transcript: 'whisper' }, { tier: 't3', text: 'cloud' })).toEqual({
      transcript: 'cloud',
      activeTranscriptTier: 't3',
    });
  });

  it('lets T3 win even when both lower tiers are present (top tier never blocked)', () => {
    expect(
      promoteTier({ t1Transcript: 'a', t2Transcript: 'b', t3Transcript: undefined }, { tier: 't3', text: 'c' }),
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
