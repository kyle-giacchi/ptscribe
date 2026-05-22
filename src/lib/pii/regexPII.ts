// Deterministic regex PII detection — the instant first pass that runs the
// moment the Scrub PII modal opens, with no model download.
//
// Scope is intentionally narrow: only structured identifiers that match
// unambiguously. Free-text names/places are left to the optional NER deep
// scan. We deliberately omit DATE and ZIP — in PT notes they collide with
// rep counts, set notation, and goniometry, producing too many false hits.

import type { PIISpan } from './scrubSpans';

type Rule = {
  group: string;
  pattern: RegExp; // must be global; capture group 1 (if present) is the span to redact
};

// Email: standard local@domain.tld, conservative on allowed chars.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// US phone: 10 digits with separators, optional +1 / leading 1, optional
// parenthesised area code. Requires separators or parens so bare numeric
// strings (rep counts, measurements) don't match.
const PHONE =
  /(?:\+?1[\s.-]?)?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;

// SSN: ###-##-#### (dashed form only — dashless collides with other IDs).
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

// MRN: label-gated. Matches "MRN" or "medical record number/#" + the value,
// redacting only the value (capture group 1).
const MRN = /(?:MRN|medical record (?:number|no\.?|#))[:\s#]*([A-Za-z0-9-]+)/gi;

const RULES: Rule[] = [
  { group: 'EMAIL', pattern: EMAIL },
  { group: 'PHONE', pattern: PHONE },
  { group: 'SSN', pattern: SSN },
  { group: 'MRN', pattern: MRN },
];

/** Detect structured PII spans via regex. Pure and synchronous. */
export function detectRegexPII(text: string): PIISpan[] {
  const spans: PIISpan[] = [];
  for (const { group, pattern } of RULES) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      // If the rule captured a sub-group, redact just that; else the whole match.
      const hasCapture = m[1] !== undefined;
      const value = hasCapture ? m[1] : m[0];
      const start = hasCapture ? m.index + m[0].indexOf(m[1]) : m.index;
      const end = start + value.length;
      if (value.length > 0) spans.push({ entity_group: group, start, end });
      // Guard against zero-width matches looping forever.
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
  return spans;
}
