#!/usr/bin/env node
/**
 * Downloads Xenova/whisper-tiny.en from HuggingFace and uploads all model
 * files to the ptnotes-models R2 bucket, preserving the HuggingFace path
 * structure so the Worker can serve them at /api/model/*.
 *
 * One-time setup:
 *   wrangler r2 bucket create ptnotes-models
 *
 * Usage:
 *   npm run upload-model
 *
 * The R2 key for each file mirrors the HuggingFace URL path so that
 * transformers.js can find them without any path remapping:
 *   Xenova/whisper-tiny.en/resolve/main/config.json
 *   Xenova/whisper-tiny.en/resolve/main/onnx/encoder_model_quantized.onnx
 *   …
 */

import { writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const MODEL_ID = 'Xenova/whisper-tiny.en';
const BUCKET = 'ptnotes-models';
const HF_API = 'https://huggingface.co/api/models';
const HF_CDN = 'https://huggingface.co';

// Not needed by transformers.js at runtime.
const SKIP_FILES = new Set(['.gitattributes', 'README.md', 'LICENSE', 'LICENSE.txt']);

function contentTypeFor(filename) {
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

console.log(`\nFetching file list for ${MODEL_ID}…`);
const apiRes = await fetch(`${HF_API}/${MODEL_ID}`);
if (!apiRes.ok) throw new Error(`HuggingFace API error: ${apiRes.status} ${apiRes.statusText}`);

const model = await apiRes.json();
const files = model.siblings
  .map((s) => s.rfilename)
  .filter((f) => !SKIP_FILES.has(f) && !f.startsWith('.git'));

console.log(`Found ${files.length} files.\n`);

let uploaded = 0;
let skipped = 0;

for (const file of files) {
  const r2Key = `${MODEL_ID}/resolve/main/${file}`;
  const hfUrl = `${HF_CDN}/${MODEL_ID}/resolve/main/${file}`;
  const contentType = contentTypeFor(file);

  process.stdout.write(`  ${file} … `);

  let buffer;
  try {
    const res = await fetch(hfUrl);
    if (!res.ok) {
      console.log(`SKIP (HTTP ${res.status})`);
      skipped++;
      continue;
    }
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.log(`SKIP (fetch failed: ${e.message})`);
    skipped++;
    continue;
  }

  const tmp = join(tmpdir(), `ptscribe-model-${Date.now()}`);
  writeFileSync(tmp, buffer);

  try {
    execSync(
      `wrangler r2 object put "${BUCKET}/${r2Key}" --file "${tmp}" --content-type "${contentType}"`,
      { stdio: 'pipe' },
    );
    console.log(`✓  ${fmtBytes(buffer.length)}`);
    uploaded++;
  } catch (e) {
    console.log(`FAILED: ${e.stderr?.toString().trim() || e.message}`);
    skipped++;
  } finally {
    unlinkSync(tmp);
  }
}

console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped.\n`);
if (skipped > 0) process.exit(1);
