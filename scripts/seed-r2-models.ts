/**
 * Pre-populate R2 with Whisper model files from HuggingFace.
 *
 * Run once before deploying so every user gets R2-cache hits from the start:
 *   npx tsx scripts/seed-r2-models.ts
 *   bun run scripts/seed-r2-models.ts
 *
 * Requires: wrangler authenticated (wrangler whoami should show your account).
 * Skip files already in R2 by passing --skip-existing (default: overwrite).
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const BUCKET = 'ptnotes-models';

// Models to seed into R2. R2 is the fallback when HuggingFace is unreachable.
const MODELS_TO_SEED = ['Xenova/whisper-tiny.en', 'openai/privacy-filter'];

const CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
  txt: 'text/plain',
  onnx: 'application/octet-stream',
  bin: 'application/octet-stream',
  model: 'application/octet-stream',
  msgpack: 'application/octet-stream',
};

function contentTypeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

interface HFModel {
  siblings: { rfilename: string }[];
}

async function listFiles(modelId: string): Promise<string[]> {
  const res = await fetch(`https://huggingface.co/api/models/${modelId}`);
  if (!res.ok) throw new Error(`HuggingFace API ${res.status} for ${modelId}`);
  const data = (await res.json()) as HFModel;
  return data.siblings.map((s) => s.rfilename);
}

async function seedModel(modelId: string): Promise<void> {
  console.log(`\n▶  ${modelId}`);
  const files = await listFiles(modelId);
  console.log(`   ${files.length} files listed`);

  let uploaded = 0;
  let skipped = 0;

  for (const filename of files) {
    const r2Key = `${modelId}/resolve/main/${filename}`;
    const hfUrl = `https://huggingface.co/${r2Key}`;
    const ct = contentTypeFor(filename);

    process.stdout.write(`   ${filename} … `);

    const res = await fetch(hfUrl, { redirect: 'follow' });
    if (!res.ok) {
      console.log(`SKIP (HuggingFace ${res.status})`);
      skipped++;
      continue;
    }

    const buf = Buffer.from(await res.arrayBuffer());

    // wrangler r2 object put reads from stdin when --pipe is set.
    // shell: true is required on Windows to execute .cmd wrapper scripts.
    const wrangler = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
    const wranglerBin = path.join('node_modules', '.bin', wrangler);

    execFileSync(
      wranglerBin,
      ['r2', 'object', 'put', `${BUCKET}/${r2Key}`, '--pipe', '--content-type', ct],
      { input: buf, stdio: ['pipe', 'pipe', 'inherit'], shell: true },
    );

    console.log(`✓  (${(buf.byteLength / 1024).toFixed(0)} KB)`);
    uploaded++;
  }

  console.log(`   done — ${uploaded} uploaded, ${skipped} skipped`);
}

async function main(): Promise<void> {
  for (const model of MODELS_TO_SEED) {
    await seedModel(model);
  }
  console.log('\nR2 bucket seeded. Run `wrangler r2 object list ptnotes-models` to verify.\n');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
