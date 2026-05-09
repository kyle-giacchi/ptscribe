/**
 * Tamper-evident audit log (A2 / L14).
 *
 * Each entry carries prevHash = SHA-256(JSON.stringify(previousEntry)).
 * The first entry uses a fixed genesis hash. Any deletion or modification
 * of an entry breaks the hash chain and is detectable via verify().
 *
 * When the log exceeds MAX_ENTRIES the oldest entries are dropped. The
 * verify() result includes a `truncated` flag so the UI can distinguish
 * a genuine chain break from a known rolling-window trim.
 */

const STORAGE_KEY = 'ptnotes.auditLog';
const MAX_ENTRIES = 500;
export const GENESIS_HASH = '0'.repeat(64);

export type AuditAction =
  | 'vault:unlocked'
  | 'vault:locked'
  | 'vault:passphrase_changed'
  | 'backup:exported'
  | 'backup:imported'
  | 'data:reset';

export interface AuditEntry {
  seq: number;
  ts: number;
  action: AuditAction;
  prevHash: string;
}

interface AuditEnvelope {
  v: 1;
  entries: AuditEntry[];
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function readRaw(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEnvelope;
    if (parsed?.v !== 1 || !Array.isArray(parsed.entries)) return [];
    return parsed.entries;
  } catch {
    return [];
  }
}

function writeRaw(entries: AuditEntry[]): void {
  const trimmed = entries.slice(-MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, entries: trimmed }));
}

export const auditLog = {
  async append(action: AuditAction): Promise<void> {
    const entries = readRaw();
    const last = entries.at(-1);
    const prevHash = last ? await sha256Hex(JSON.stringify(last)) : GENESIS_HASH;
    const entry: AuditEntry = {
      seq: (last?.seq ?? 0) + 1,
      ts: Date.now(),
      action,
      prevHash,
    };
    writeRaw([...entries, entry]);
  },

  read(): AuditEntry[] {
    return readRaw();
  },

  /**
   * Walk the chain and confirm each entry's prevHash matches the hash of the
   * prior entry. Returns valid=false + tamperedAt (seq number) on first break.
   * truncated=true means the chain starts after a rolling-window trim — the
   * retained window is still verified as internally consistent.
   */
  async verify(): Promise<{ valid: boolean; truncated: boolean; tamperedAt?: number }> {
    const entries = readRaw();
    if (entries.length === 0) return { valid: true, truncated: false };

    const truncated = entries[0].prevHash !== GENESIS_HASH;

    // The first entry's prevHash is used as the baseline; subsequent entries
    // are checked against the hash of the entry before them.
    let expectedPrevHash = entries[0].prevHash;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].prevHash !== expectedPrevHash) {
        return { valid: false, truncated, tamperedAt: entries[i].seq };
      }
      expectedPrevHash = await sha256Hex(JSON.stringify(entries[i]));
    }

    return { valid: true, truncated };
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
