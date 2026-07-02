import { describe, it, expect } from 'vitest';
import {
  getTranscribableClips,
  mergeClipTranscripts,
  mergeClipTranscriptsWithMarkers,
  stripClipMarkers,
  clipStatusTone,
} from './clips';
import type { SessionClip } from '@/types';

function clip(overrides: Partial<SessionClip> = {}): SessionClip {
  return {
    id: 'c1',
    index: 0,
    durationSec: 60,
    status: 'ready',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('getTranscribableClips', () => {
  it('includes ready clips', () => {
    const c = clip({ status: 'ready' });
    expect(getTranscribableClips([c])).toEqual([c]);
  });

  it('includes failed clips', () => {
    const c = clip({ status: 'failed' });
    expect(getTranscribableClips([c])).toEqual([c]);
  });

  it('includes transcribed clips where transcript matches t2Transcript', () => {
    const c = clip({ status: 'transcribed', transcript: 'hello', t2Transcript: 'hello' });
    expect(getTranscribableClips([c])).toEqual([c]);
  });

  it('excludes transcribed clips where transcript differs from t2Transcript', () => {
    const c = clip({ status: 'transcribed', transcript: 'edited', t2Transcript: 'original' });
    expect(getTranscribableClips([c])).toEqual([]);
  });

  it('excludes transcribed clips with no t2Transcript', () => {
    const c = clip({ status: 'transcribed', transcript: 'hello' });
    expect(getTranscribableClips([c])).toEqual([]);
  });

  it('excludes pending and transcribing clips', () => {
    expect(getTranscribableClips([clip({ status: 'pending' })])).toEqual([]);
    expect(getTranscribableClips([clip({ status: 'transcribing' })])).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(getTranscribableClips([])).toEqual([]);
  });
});

describe('mergeClipTranscripts', () => {
  it('returns empty string when no transcribed clips', () => {
    expect(mergeClipTranscripts([clip({ status: 'ready' })])).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(mergeClipTranscripts([])).toBe('');
  });

  it('excludes transcribed clips with empty transcript', () => {
    const c = clip({ status: 'transcribed', transcript: '   ' });
    expect(mergeClipTranscripts([c])).toBe('');
  });

  it('joins multiple transcribed clips with double newline in createdAt order', () => {
    const c1 = clip({ id: 'a', status: 'transcribed', transcript: 'first', createdAt: 2000 });
    const c2 = clip({ id: 'b', status: 'transcribed', transcript: 'second', createdAt: 1000 });
    expect(mergeClipTranscripts([c1, c2])).toBe('second\n\nfirst');
  });

  it('trims individual transcripts', () => {
    const c = clip({ status: 'transcribed', transcript: '  hello  ' });
    expect(mergeClipTranscripts([c])).toBe('hello');
  });
});

describe('mergeClipTranscriptsWithMarkers', () => {
  it('returns plain text for a single transcribed clip', () => {
    const c = clip({ status: 'transcribed', transcript: 'only one' });
    expect(mergeClipTranscriptsWithMarkers([c])).toBe('only one');
  });

  it('adds clip markers for multiple transcribed clips', () => {
    const clips = [
      clip({ id: 'a', index: 0, status: 'transcribed', transcript: 'alpha', createdAt: 1000 }),
      clip({ id: 'b', index: 1, status: 'transcribed', transcript: 'beta', createdAt: 2000 }),
    ];
    const result = mergeClipTranscriptsWithMarkers(clips);
    expect(result).toContain('--- [Clip 1] ---');
    expect(result).toContain('--- [Clip 2] ---');
    expect(result).toContain('alpha');
    expect(result).toContain('beta');
  });

  it('clip number is based on position in original clips array, not transcribed order', () => {
    // c2 is index 1 in the original array but transcribed first (lower createdAt)
    const c1 = clip({ id: 'a', index: 0, status: 'ready', createdAt: 1000 });
    const c2 = clip({ id: 'b', index: 1, status: 'transcribed', transcript: 'B', createdAt: 1000 });
    const c3 = clip({ id: 'c', index: 2, status: 'transcribed', transcript: 'C', createdAt: 2000 });
    const result = mergeClipTranscriptsWithMarkers([c1, c2, c3]);
    expect(result).toContain('--- [Clip 2] ---');
    expect(result).toContain('--- [Clip 3] ---');
    expect(result).not.toContain('--- [Clip 1] ---');
  });
});

describe('stripClipMarkers', () => {
  it('removes clip markers from text', () => {
    const input = '--- [Clip 1] ---\nhello\n\n--- [Clip 2] ---\nworld';
    expect(stripClipMarkers(input)).toBe('hello\n\nworld');
  });

  it('collapses triple+ newlines to double', () => {
    const input = '--- [Clip 1] ---\nhello\n\n\n\nworld';
    expect(stripClipMarkers(input)).toBe('hello\n\nworld');
  });

  it('is a no-op on text without markers', () => {
    expect(stripClipMarkers('plain text')).toBe('plain text');
  });

  it('trims leading/trailing whitespace', () => {
    expect(stripClipMarkers('\n\nhello\n\n')).toBe('hello');
  });
});

describe('clipStatusTone', () => {
  it('transcribed clip status wins regardless of T2 phase', () => {
    expect(clipStatusTone({ status: 'transcribed' }, 'error', '')).toEqual({
      statusTone: 'accent',
      statusLabel: 'Transcribed',
    });
  });

  it('failed clip status wins regardless of T2 phase', () => {
    expect(clipStatusTone({ status: 'failed' }, 'done', '')).toEqual({
      statusTone: 'negative',
      statusLabel: 'Failed',
    });
  });

  it('pending clip status wins regardless of T2 phase', () => {
    expect(clipStatusTone({ status: 'pending' }, 'done', '')).toEqual({
      statusTone: 'amber',
      statusLabel: 'Recording…',
    });
  });

  it('ready clip falls through to T2 transcribing phase, using the progress label', () => {
    expect(clipStatusTone({ status: 'ready' }, 'transcribing', 'Chunk 2/3')).toEqual({
      statusTone: 'amber',
      statusLabel: 'Chunk 2/3',
    });
  });

  it('ready clip falls back to a default label when T2 transcribing has no progress label', () => {
    expect(clipStatusTone({ status: 'ready' }, 'transcribing', '')).toEqual({
      statusTone: 'amber',
      statusLabel: 'Transcribing…',
    });
  });

  it('ready clip falls through to T2 retrying phase', () => {
    expect(clipStatusTone({ status: 'ready' }, 'retrying', '')).toEqual({
      statusTone: 'amber',
      statusLabel: 'Retrying…',
    });
  });

  it('ready clip falls through to T2 done phase', () => {
    expect(clipStatusTone({ status: 'ready' }, 'done', '')).toEqual({
      statusTone: 'accent',
      statusLabel: 'Transcribed',
    });
  });

  it('ready clip falls through to T2 error phase', () => {
    expect(clipStatusTone({ status: 'ready' }, 'error', '')).toEqual({
      statusTone: 'negative',
      statusLabel: 'Failed',
    });
  });

  it('ready clip defaults to Queued when T2 is idle', () => {
    expect(clipStatusTone({ status: 'ready' }, 'idle', '')).toEqual({
      statusTone: 'amber',
      statusLabel: 'Queued',
    });
  });
});
