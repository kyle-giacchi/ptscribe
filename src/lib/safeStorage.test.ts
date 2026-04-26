import { describe, expect, it, beforeEach } from 'vitest';
import { safeLocalStorage, MAX_OBJECT_BYTES } from './safeStorage';

describe('safeLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a string', () => {
    safeLocalStorage.setItem('k', 'hello');
    expect(safeLocalStorage.getItem('k')).toBe('hello');
  });

  it('round-trips a primitive boolean serialized as JSON', () => {
    safeLocalStorage.setItem('flag', JSON.stringify(true));
    expect(safeLocalStorage.getItem('flag')).toBe('true');
  });

  it('rejects oversized JSON object', () => {
    const huge = JSON.stringify({ blob: 'x'.repeat(MAX_OBJECT_BYTES + 100) });
    expect(() => safeLocalStorage.setItem('big', huge)).toThrow();
  });

  it('removes a key', () => {
    safeLocalStorage.setItem('k', 'v');
    safeLocalStorage.removeItem('k');
    expect(safeLocalStorage.getItem('k')).toBeNull();
  });
});
