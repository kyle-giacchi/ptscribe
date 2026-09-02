import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveTranscriber } from './liveTranscriber';
import { getLiveWhisperStats, resetLiveWhisperStats } from '@/lib/debug/liveWhisperStats';

/** A `transcribe` fake whose every call is resolved by the test, in order. */
function deferredTranscribe() {
  const resolvers: Array<(text: string) => void> = [];
  const calls: Blob[] = [];
  const transcribe = vi.fn((blob: Blob) => {
    calls.push(blob);
    return new Promise<{ text: string }>((resolve) => {
      resolvers.push((text) => resolve({ text }));
    });
  });
  return {
    transcribe,
    calls,
    /** Resolve the Nth outstanding call (FIFO). */
    settle: (text: string) => resolvers.shift()!(text),
    pending: () => resolvers.length,
  };
}

const blob = (tag: string) => new Blob([tag], { type: 'audio/webm' });

afterEach(() => resetLiveWhisperStats());

describe('createLiveTranscriber', () => {
  it('transcribes a pushed chunk and reports it through onText + text()', async () => {
    const t = deferredTranscribe();
    const onText = vi.fn();
    const live = createLiveTranscriber({ transcribe: t.transcribe, onText });

    live.push(blob('a'));
    expect(t.calls).toHaveLength(1);

    t.settle('hello');
    await live.flush();

    expect(onText).toHaveBeenLastCalledWith(['hello']);
    expect(live.text()).toBe('hello');
  });

  it('leaky bucket: a chunk replaced while one is in flight is dropped and counted', async () => {
    const t = deferredTranscribe();
    const live = createLiveTranscriber({ transcribe: t.transcribe, onText: vi.fn() });

    live.push(blob('a')); // starts immediately
    live.push(blob('b')); // pending
    live.push(blob('c')); // replaces b — b is the silent drop

    expect(getLiveWhisperStats().dropped).toBe(1);

    t.settle('A'); // first call done → recursion picks up pending (c)
    await Promise.resolve();
    t.settle('C');
    await live.flush();

    expect(t.calls).toHaveLength(2); // a and c only; b never transcribed
    expect(live.text()).toBe('A C');
  });

  it('flush() drains the last pending chunk (paused-clip final utterance)', async () => {
    const t = deferredTranscribe();
    const live = createLiveTranscriber({ transcribe: t.transcribe, onText: vi.fn() });

    live.push(blob('a')); // in flight
    live.push(blob('b')); // pending, not yet started

    const flushed = live.flush();
    t.settle('first'); // a resolves → flush must then run b
    // b is now in flight; give flush its resolution
    await Promise.resolve();
    t.settle('second');

    expect(await flushed).toBe('first second');
    expect(live.text()).toBe('first second');
  });

  it('flush() with nothing pending or running returns current text', async () => {
    const t = deferredTranscribe();
    const live = createLiveTranscriber({ transcribe: t.transcribe, onText: vi.fn() });
    expect(await live.flush()).toBe('');
    expect(t.calls).toHaveLength(0);
  });

  it('reset() clears segments and pending', async () => {
    const t = deferredTranscribe();
    const live = createLiveTranscriber({ transcribe: t.transcribe, onText: vi.fn() });

    live.push(blob('a'));
    t.settle('gone');
    await live.flush();
    expect(live.text()).toBe('gone');

    live.reset();
    expect(live.text()).toBe('');
  });

  it('swallows a transcribe rejection and keeps accepting chunks', async () => {
    let fail = true;
    const transcribe = vi.fn((_blob: Blob) =>
      fail ? Promise.reject(new Error('boom')) : Promise.resolve({ text: 'recovered' }),
    );
    const live = createLiveTranscriber({ transcribe, onText: vi.fn() });

    live.push(blob('a'));
    await live.flush();
    expect(live.text()).toBe(''); // rejection swallowed, no segment

    fail = false;
    live.push(blob('b'));
    await live.flush();
    expect(live.text()).toBe('recovered'); // bucket recovered
  });
});
