import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Every `var(--x)` in src must name a custom property declared somewhere in src:
// a CSS declaration (`--x: …`) or an inline style key (`'--x': …` / `['--x' as string]`). An undefined
// token silently falls back to the inherited color, so it ships invisibly broken.

const SRC = path.resolve(import.meta.dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(css|tsx?)$/.test(e.name) && !e.name.endsWith('.test.ts') ? [p] : [];
  });
}

test('every var(--token) used in src is declared', () => {
  const used = new Map<string, string>();
  const declared = new Set<string>();
  for (const f of files(SRC)) {
    const s = readFileSync(f, 'utf8');
    for (const [, name] of s.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!used.has(name)) used.set(name, path.relative(SRC, f));
    }
    for (const [, decl, computed] of s.matchAll(/['"]?(--[\w-]+)['"]?\s*:|\[['"](--[\w-]+)['"]/g)) {
      declared.add(decl ?? computed);
    }
  }
  const undefinedTokens = [...used]
    .filter(([n]) => !declared.has(n))
    .map(([n, f]) => `${n} (${f})`);
  expect(undefinedTokens).toEqual([]);
});
