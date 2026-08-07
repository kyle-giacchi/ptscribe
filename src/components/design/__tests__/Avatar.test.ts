import { describe, it, expect } from 'vitest';
import { AVATAR_COLORS, contrastText, randomAvatarColor } from '../Avatar';

describe('avatar colors', () => {
  it('generates a valid hex on the wheel', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomAvatarColor()).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('picks readable text for light and dark backgrounds', () => {
    expect(contrastText('#ffffff')).toBe('#1a1a1a');
    expect(contrastText('#000000')).toBe('#ffffff');
    for (const c of AVATAR_COLORS) expect(contrastText(c.hex)).toBe('#ffffff');
  });
});
