#!/usr/bin/env python3
"""
Download openai/privacy-filter ONNX files from HuggingFace and upload to R2.

The repo already ships ONNX variants - no conversion needed. This script
downloads the INT8-quantized model + tokenizer files and seeds them into R2
under models/privacy-filter/ so the browser worker can load them.

Prerequisites: none beyond Python 3 stdlib
Usage:
  python scripts/convert-privacy-filter.py

Requires wrangler to be authenticated (wrangler whoami should show your account).
"""

import os
import sys
import subprocess
from pathlib import Path

MODEL_ID = 'openai/privacy-filter'
BUCKET = 'ptnotes-models'

# Subset of the 25 repo files we actually need.
# Skips model.safetensors (not needed for ONNX inference) and non-quantized
# ONNX variants (FP32, FP16, Q4) - model_quantized.onnx is INT8.
FILES = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'viterbi_calibration.json',
    'onnx/model_quantized.onnx',
    'onnx/model_quantized.onnx_data',
]

CONTENT_TYPES: dict[str, str] = {
    'json': 'application/json',
    'onnx': 'application/octet-stream',
    'data': 'application/octet-stream',
}


def wrangler_bin() -> str:
    name = 'wrangler.cmd' if sys.platform == 'win32' else 'wrangler'
    return str(Path('node_modules/.bin') / name)


def main() -> None:
    out_dir = Path('models') / 'privacy-filter'

    # Suppress the Windows symlink warning - huggingface_hub falls back to
    # file copies automatically, so this is cosmetic only.
    os.environ.setdefault('HF_HUB_DISABLE_SYMLINKS_WARNING', '1')

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        sys.exit('Run: pip install huggingface_hub')

    print(f'Downloading {MODEL_ID} ONNX files from HuggingFace...')
    print('(large files may take a few minutes - hf_hub_download retries automatically)\n')

    for rel in FILES:
        print(f'  {rel} ...', end=' ', flush=True)
        hf_hub_download(
            repo_id=MODEL_ID,
            filename=rel,
            local_dir=str(out_dir),
            local_dir_use_symlinks=False,
        )
        local = out_dir / Path(rel)
        print(f'ok  ({local.stat().st_size // 1024} KB)')

    files = sorted(p for p in out_dir.rglob('*') if p.is_file())
    print(f'\nUploading {len(files)} files to R2 bucket "{BUCKET}" ...')

    for path in files:
        rel_posix = path.relative_to(out_dir).as_posix()
        r2_key = f'openai/privacy-filter/resolve/main/{rel_posix}'
        ct = CONTENT_TYPES.get(path.suffix.lstrip('.'), 'application/octet-stream')

        size_kb = path.stat().st_size // 1024
        print(f'  {rel_posix} ({size_kb} KB) ...', end=' ', flush=True)

        subprocess.run(
            [wrangler_bin(), 'r2', 'object', 'put', f'{BUCKET}/{r2_key}',
             '--file', str(path), '--content-type', ct],
            stdout=subprocess.PIPE,
            check=True,
            shell=(sys.platform == 'win32'),
        )
        print('ok')

    print(f'\nDone. Verify with:')
    print(f'  wrangler r2 object list {BUCKET} --prefix "openai/privacy-filter"')


if __name__ == '__main__':
    main()
