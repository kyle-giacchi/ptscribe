import { describe, expect, it } from 'vitest';
import { advisoriesReducer, initialAdvisories } from './recordingAdvisories';

describe('advisoriesReducer', () => {
  it('tracks silence start/end, clearing the dismiss flag on end', () => {
    const active = advisoriesReducer(
      { ...initialAdvisories, silenceWarnDismissed: true },
      { type: 'silenceStart' },
    );
    expect(active.silenceActive).toBe(true);

    const ended = advisoriesReducer(active, { type: 'silenceEnd' });
    expect(ended.silenceActive).toBe(false);
    expect(ended.silenceWarnDismissed).toBe(false);
  });

  it('resets every advisory back to initial state', () => {
    const dirty = advisoriesReducer(advisoriesReducer(initialAdvisories, { type: 'softWarn' }), {
      type: 'autoStopped',
    });
    expect(advisoriesReducer(dirty, { type: 'reset' })).toEqual(initialAdvisories);
  });

  it('clearAutoStopped only touches wasAutoStopped', () => {
    const dirty = { ...initialAdvisories, softWarnActive: true, wasAutoStopped: true };
    const cleared = advisoriesReducer(dirty, { type: 'clearAutoStopped' });
    expect(cleared).toEqual({ ...dirty, wasAutoStopped: false });
  });
});
