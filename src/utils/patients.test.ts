import { describe, expect, it } from 'vitest';
import { shortName } from './patients';

describe('shortName', () => {
  it('renders first name plus last initial', () => {
    expect(shortName({ firstName: 'Marcus', lastName: 'Lowell' })).toBe('Marcus L.');
  });

  it('falls back cleanly when half the name is missing', () => {
    expect(shortName({ firstName: 'Marcus', lastName: '' })).toBe('Marcus');
    expect(shortName({ firstName: '', lastName: 'Lowell' })).toBe('L.');
    expect(shortName({ firstName: '', lastName: '' })).toBe('Unnamed patient');
    expect(shortName(undefined)).toBe('Unknown patient');
  });

  it('never leaks the full last name — the whole point of the helper', () => {
    expect(shortName({ firstName: 'Dana', lastName: 'Whitfield' })).not.toContain('Whitfield');
  });
});
