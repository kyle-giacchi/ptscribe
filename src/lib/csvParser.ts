export interface ParsedInviteRow {
  email: string;
}

export function parseCsvInvites(content: string): ParsedInviteRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0]
    .split(delimiter)
    .map(stripQuotes)
    .map((h) => h.toLowerCase());

  const EMAIL_HEADERS = ['email', 'e-mail', 'email address', 'emailaddress'];
  const col = headers.findIndex((h) => EMAIL_HEADERS.includes(h));
  if (col === -1) return [];

  const results: ParsedInviteRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map(stripQuotes);
    const email = cells[col]?.trim() ?? '';
    if (isValidEmail(email)) results.push({ email });
  }
  return results;
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
