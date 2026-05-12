import { describe, it, expect } from 'vitest';
import { parseCsvInvites } from './csvParser';

describe('parseCsvInvites', () => {
  it('parses CSV with lowercase email header', () => {
    const csv = 'email\njohn@example.com\njane@example.com';
    expect(parseCsvInvites(csv)).toEqual([
      { email: 'john@example.com' },
      { email: 'jane@example.com' },
    ]);
  });

  it('parses CSV with "Email Address" header', () => {
    const csv = 'Email Address\nalice@test.com';
    expect(parseCsvInvites(csv)).toEqual([{ email: 'alice@test.com' }]);
  });

  it('parses TSV (tab-delimited) with name column', () => {
    const tsv = 'name\temail\nAlice\talice@test.com';
    expect(parseCsvInvites(tsv)).toEqual([{ email: 'alice@test.com' }]);
  });

  it('strips surrounding quotes from values', () => {
    const csv = 'email\n"bob@example.com"';
    expect(parseCsvInvites(csv)).toEqual([{ email: 'bob@example.com' }]);
  });

  it('returns empty array when no email column found', () => {
    const csv = 'name,phone\nAlice,555-1234';
    expect(parseCsvInvites(csv)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseCsvInvites('')).toEqual([]);
  });

  it('skips rows with invalid email format', () => {
    const csv = 'email\nnot-an-email\ngood@example.com';
    expect(parseCsvInvites(csv)).toEqual([{ email: 'good@example.com' }]);
  });

  it('handles CRLF line endings', () => {
    const csv = 'email\r\nfoo@bar.com\r\nbaz@qux.com';
    expect(parseCsvInvites(csv)).toEqual([
      { email: 'foo@bar.com' },
      { email: 'baz@qux.com' },
    ]);
  });
});
