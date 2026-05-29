import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useEffect, useRef, memo } from 'react';
import { RecordingTimer } from './RecordingTimer';

/**
 * A tiny external store that mimics `useRecorder`'s duration store: callers
 * subscribe, and `set` updates the snapshot + notifies subscribers (as the tick
 * interval does every ~250 ms).
 */
function makeDurationStore() {
  let value = 0;
  const subs = new Set<() => void>();
  return {
    subscribeDuration: (cb: () => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    getDurationSec: () => value,
    set: (next: number) => {
      value = next;
      for (const cb of subs) cb();
    },
  };
}

describe('RecordingTimer', () => {
  it('formats seconds as mm:ss', () => {
    const store = makeDurationStore();
    store.set(75); // 1:15
    render(
      <RecordingTimer
        subscribeDuration={store.subscribeDuration}
        getDurationSec={store.getDurationSec}
      />,
    );
    expect(screen.getByText('01:15')).toBeInTheDocument();
  });

  it('updates its text when the store notifies (subscribe path)', () => {
    const store = makeDurationStore();
    render(
      <RecordingTimer
        subscribeDuration={store.subscribeDuration}
        getDurationSec={store.getDurationSec}
      />,
    );
    expect(screen.getByText('00:00')).toBeInTheDocument();

    act(() => store.set(5));
    expect(screen.getByText('00:05')).toBeInTheDocument();

    act(() => store.set(125));
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });
});

describe('recording tick isolation', () => {
  it('updates RecordingTimer text per tick without re-rendering a sibling panel', () => {
    const store = makeDurationStore();
    const panelRenders = vi.fn();

    // A memoized sibling that stands in for NotePanel/TranscriptPanel/NoteToolbar:
    // it receives stable props and counts its own renders via an effect.
    const Panel = memo(function Panel() {
      const count = useRef(0);
      useEffect(() => {
        count.current += 1;
        panelRenders(count.current);
      });
      return <div data-testid="panel">panel</div>;
    });

    // Parent holds the timer + the sibling. Crucially, the parent does NOT read
    // the duration in its own render scope — only the RecordingTimer leaf
    // subscribes — so a tick must not re-render the parent or the sibling.
    function Host() {
      return (
        <div>
          <RecordingTimer
            subscribeDuration={store.subscribeDuration}
            getDurationSec={store.getDurationSec}
          />
          <Panel />
        </div>
      );
    }

    render(<Host />);
    expect(panelRenders).toHaveBeenCalledTimes(1); // initial mount only

    // Drive three ticks.
    act(() => store.set(1));
    act(() => store.set(2));
    act(() => store.set(3));

    // Timer text updated each tick…
    expect(screen.getByText('00:03')).toBeInTheDocument();
    // …but the sibling panel never re-rendered.
    expect(panelRenders).toHaveBeenCalledTimes(1);
  });
});

describe('inputsUnchanged short-circuit (F2)', () => {
  // Mirrors the Session.tsx expression: cheap equality checks gate the expensive
  // JSON.stringify so it only runs when transcript + template already match.
  const empty: Record<string, string[]> = {
    clinicalDetail: [],
    codingBilling: [],
    beyondNote: [],
    customInstructions: [],
  };
  type Note = {
    generatedFromTranscript?: string;
    templateId?: string;
    modifiers?: typeof empty;
  };

  function computeInputsUnchanged(args: {
    note: Note | undefined;
    effectiveTranscript: string;
    currentModifiers: typeof empty;
    sessionTemplateId?: string;
    onStringify: () => void;
  }): boolean {
    const { note, effectiveTranscript, currentModifiers, sessionTemplateId, onStringify } = args;
    const stringify = (v: unknown) => {
      onStringify();
      return JSON.stringify(v);
    };
    return (
      !!note &&
      effectiveTranscript === (note.generatedFromTranscript ?? '') &&
      (sessionTemplateId ?? '') === (note.templateId ?? '') &&
      stringify(currentModifiers) === stringify(note.modifiers ?? empty)
    );
  }

  it('is true when all inputs match', () => {
    const result = computeInputsUnchanged({
      note: { generatedFromTranscript: 'hello', templateId: 't1', modifiers: empty },
      effectiveTranscript: 'hello',
      currentModifiers: empty,
      sessionTemplateId: 't1',
      onStringify: () => {},
    });
    expect(result).toBe(true);
  });

  it('is false when the transcript changed and skips JSON.stringify entirely', () => {
    const stringifySpy = vi.fn();
    const result = computeInputsUnchanged({
      note: { generatedFromTranscript: 'old', templateId: 't1', modifiers: empty },
      effectiveTranscript: 'NEW text',
      currentModifiers: empty,
      sessionTemplateId: 't1',
      onStringify: stringifySpy,
    });
    expect(result).toBe(false);
    expect(stringifySpy).not.toHaveBeenCalled(); // short-circuited before the expensive compare
  });

  it('is false when the template changed and skips JSON.stringify', () => {
    const stringifySpy = vi.fn();
    const result = computeInputsUnchanged({
      note: { generatedFromTranscript: 'hello', templateId: 't1', modifiers: empty },
      effectiveTranscript: 'hello',
      currentModifiers: empty,
      sessionTemplateId: 't2',
      onStringify: stringifySpy,
    });
    expect(result).toBe(false);
    expect(stringifySpy).not.toHaveBeenCalled();
  });

  it('flips to false when modifiers differ (runs the JSON compare)', () => {
    const stringifySpy = vi.fn();
    const result = computeInputsUnchanged({
      note: { generatedFromTranscript: 'hello', templateId: 't1', modifiers: empty },
      effectiveTranscript: 'hello',
      currentModifiers: { ...empty, codingBilling: ['97110'] },
      sessionTemplateId: 't1',
      onStringify: stringifySpy,
    });
    expect(result).toBe(false);
    expect(stringifySpy).toHaveBeenCalled(); // reached the modifier compare
  });

  it('is false when no note exists', () => {
    const result = computeInputsUnchanged({
      note: undefined,
      effectiveTranscript: '',
      currentModifiers: empty,
      sessionTemplateId: undefined,
      onStringify: () => {},
    });
    expect(result).toBe(false);
  });
});
