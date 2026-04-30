import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!DOCTYPE html>
<html>
<head><style>*{margin:0;padding:0;box-sizing:border-box}</style></head>
<body style="width:${size}px;height:${size}px;overflow:hidden;background:#0f172a">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
    <rect width="32" height="32" fill="#0f172a"/>
    <text x="16" y="22" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="18" font-weight="700">PT</text>
  </svg>
</body></html>`);
  const screenshot = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: size, height: size },
  });
  fs.writeFileSync(path.join(publicDir, `pwa-${size}x${size}.png`), screenshot);
  console.log(`Generated public/pwa-${size}x${size}.png`);
}

await browser.close();
