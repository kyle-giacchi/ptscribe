import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizablePanes } from './useResizablePanes';

function attachContainer(result: { current: ReturnType<typeof useResizablePanes> }) {
  const div = document.createElement('div');
  div.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
  Object.defineProperty(result.current.containerRef, 'current', { value: div, writable: true });
  return div;
}

describe('useResizablePanes', () => {
  it('starts at the given initial percentage', () => {
    const { result } = renderHook(() => useResizablePanes(40));
    expect(result.current.notePct).toBe(40);
  });

  it('updates notePct as the pointer moves within range', () => {
    const { result } = renderHook(() => useResizablePanes());
    attachContainer(result);

    act(() => {
      result.current.startResize({ preventDefault: () => {} } as React.PointerEvent);
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600 }));
    });

    expect(result.current.notePct).toBe(60);
  });

  it('clamps notePct to [30, 70] even when the pointer moves past the edges', () => {
    const { result } = renderHook(() => useResizablePanes());
    attachContainer(result);

    act(() => {
      result.current.startResize({ preventDefault: () => {} } as React.PointerEvent);
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: -500 }));
    });
    expect(result.current.notePct).toBe(30);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 5000 }));
    });
    expect(result.current.notePct).toBe(70);
  });

  it('stops responding to pointer moves after pointerup', () => {
    const { result } = renderHook(() => useResizablePanes());
    attachContainer(result);

    act(() => {
      result.current.startResize({ preventDefault: () => {} } as React.PointerEvent);
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600 }));
      window.dispatchEvent(new PointerEvent('pointerup'));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 }));
    });

    expect(result.current.notePct).toBe(60);
  });
});
