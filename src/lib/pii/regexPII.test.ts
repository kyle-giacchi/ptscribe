import { describe, it, expect } from 'vitest';
import { detectRegexPII } from './regexPII';
import { applySpans } from './scrubSpans';

/** Convenience: detect + redact in one step for assertions. */
function scrub(text: string): string {
  return applySpans(text, detectRegexPII(text)).scrubbed;
}

describe('detectRegexPII', () => {
  describe('EMAIL', () => {
    it('matches a standard address', () => {
      expect(scrub('Reach me at jane.doe@clinic.org tomorrow')).toBe(
        'Reach me at [EMAIL] tomorrow',
      );
    });
    it('matches plus-addressing and subdomains', () => {
      expect(scrub('a+b@mail.sub.example.co.uk')).toBe('[EMAIL]');
    });
  });

  describe('PHONE', () => {
    it('matches dashed US number', () => {
      expect(scrub('call 415-555-0132 please')).toBe('call [PHONE] please');
    });
    it('matches parenthesised area code', () => {
      expect(scrub('(415) 555-0132')).toBe('[PHONE]');
    });
    it('matches +1 prefix', () => {
      expect(scrub('+1 415 555 0132')).toBe('[PHONE]');
    });
    it('does NOT match rep/set notation', () => {
      expect(scrub('3 sets of 10 reps, 120 degrees')).toBe('3 sets of 10 reps, 120 degrees');
    });
    it('does NOT match goniometry like 120/0', () => {
      expect(scrub('ROM 120/0 with pain')).toBe('ROM 120/0 with pain');
    });
  });

  describe('SSN', () => {
    it('matches dashed SSN', () => {
      expect(scrub('SSN 123-45-6789')).toBe('SSN [SSN]');
    });
    it('does NOT match a 9-digit run without dashes', () => {
      expect(scrub('123456789')).toBe('123456789');
    });
  });

  describe('MRN', () => {
    it('redacts only the value, keeping the label', () => {
      expect(scrub('MRN: A12345')).toBe('MRN: [MRN]');
    });
    it('matches "medical record number"', () => {
      expect(scrub('medical record number 99887')).toBe('medical record number [MRN]');
    });
  });

  describe('clean text', () => {
    it('leaves clinical prose untouched', () => {
      const note = 'Patient reports improved gait. 3x10 squats. Pain 2/10.';
      expect(scrub(note)).toBe(note);
    });
    it('returns no spans for empty input', () => {
      expect(detectRegexPII('')).toEqual([]);
    });
  });

  describe('multiple + overlapping', () => {
    it('flags several identifiers in one pass', () => {
      const text = 'Email jane@x.com or call 415-555-0132';
      expect(scrub(text)).toBe('Email [EMAIL] or call [PHONE]');
    });
  });
});
