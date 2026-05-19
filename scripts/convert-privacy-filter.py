#!/usr/bin/env python3
"""
Convert openai/privacy-filter to ONNX INT8 and upload to Cloudflare R2.

Prerequisites:
  pip install "optimum[exporters]"

Usage:
  python scripts/convert-privacy-filter.py

Requires wrangler to be authenticated (wrangler whoami should show your account).
"""

import sys
import subprocess
from pathlib import Path

MODEL_ID = 'openai/privacy-filter'
BUCKET = 'ptnotes-models'

CONTENT_TYPES: dict[str, str] = {
    'json': 'application/json',
    'txt': 'text/plain',
    'onnx': 'application/octet-stream',
    'bin': 'application/octet-stream',
    'model': 'application/octet-stream',
    'msgpack': 'application/octet-stream',
}


def wrangler_bin() -> str:
    name = 'wrangler.cmd' if sys.platform == 'win32' else 'wrangler'
    return str(Path('node_modules/.bin') / name)


def main() -> None:
    out_dir = Path('models') / 'privacy-filter'
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f'Converting {MODEL_ID} → ONNX INT8 …')
    print(f'Output: {out_dir.resolve()}')
    subprocess.run(
        [
            sys.executable, '-m', 'optimum.exporters.onnx',
            '--model', MODEL_ID,
            '--task', 'token-classification',
            '--dtype', 'int8',
            str(out_dir),
        ],
        check=True,
    )

    files = sorted(p for p in out_dir.rglob('*') if p.is_file())
    print(f'\nUploading {len(files)} files to R2 bucket "{BUCKET}" …')

    for path in files:
        rel = path.relative_to(out_dir).as_posix()
        r2_key = f'models/privacy-filter/{rel}'
        ct = CONTENT_TYPES.get(path.suffix.lstrip('.'), 'application/octet-stream')

        print(f'  {rel} …', end=' ', flush=True)
        data = path.read_bytes()

        subprocess.run(
            [wrangler_bin(), 'r2', 'object', 'put', f'{BUCKET}/{r2_key}',
             '--pipe', '--content-type', ct],
            input=data,
            stdout=subprocess.PIPE,
            check=True,
            shell=(sys.platform == 'win32'),
        )
        print(f'✓  ({len(data) // 1024} KB)')

    print(f'\nDone. Verify with:')
    print(f'  wrangler r2 object list {BUCKET} --prefix "models/privacy-filter"')


if __name__ == '__main__':
    main()
