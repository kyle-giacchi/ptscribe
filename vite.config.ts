import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import fs from 'node:fs';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const ML_ASSETS: Record<string, { file: string; contentType: string }> = {
  '/silero_vad_legacy.onnx': {
    file: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
    contentType: 'application/octet-stream',
  },
  '/ort-wasm-simd-threaded.wasm': {
    file: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
    contentType: 'application/wasm',
  },
  '/ort-wasm-simd-threaded.mjs': {
    file: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
    contentType: 'text/javascript',
  },
  // transformers.js bundles its OWN onnxruntime-web (see @huggingface/transformers'
  // nested node_modules) at a different version from the top-level one the VAD uses,
  // and its browser build hard-codes the *asyncify* artifact names. Serve that exact
  // pair so whisper.worker/privacyFilter.worker can pin wasmPaths to our origin
  // instead of transformers' jsdelivr default, which CSP `connect-src 'self'` blocks.
  '/ort-wasm-simd-threaded.asyncify.wasm': {
    file: 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm',
    contentType: 'application/wasm',
  },
  '/ort-wasm-simd-threaded.asyncify.mjs': {
    file: 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs',
    contentType: 'text/javascript',
  },
  // Nested copy, matching the asyncify pair above (must match the onnxruntime-web
  // version transformers.js actually resolves at runtime — the top-level package's
  // JSEP wasm is a different version and 0.7 MiB larger, tripping Cloudflare's 25 MiB
  // per-static-asset limit; the nested one doesn't).
  '/ort-wasm-simd-threaded.jsep.wasm': {
    file: 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
    contentType: 'application/wasm',
  },
  '/ort-wasm-simd-threaded.jsep.mjs': {
    file: 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
    contentType: 'text/javascript',
  },
};

function serveMLAssetsDev(): Plugin {
  return {
    name: 'serve-ml-assets-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const asset = ML_ASSETS[req.url ?? ''];
        if (asset) {
          res.setHeader('Content-Type', asset.contentType);
          fs.createReadStream(path.resolve(__dirname, asset.file)).pipe(res);
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    serveMLAssetsDev(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'PTScribe',
        short_name: 'PTScribe',
        description: 'PT session notes, transcription, and AI-generated SOAP notes',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // ML assets are too large to precache (~20MB); handle via runtime caching
        // Limit raised to cover the current monolithic bundle (H10 code splitting will lower it)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globIgnores: ['**/*.onnx', '**/*.wasm', '**/ort-wasm-simd-threaded*.mjs'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Never cache AI/transcription API calls
            urlPattern: /\/api\/.*/,
            handler: 'NetworkOnly',
          },
          {
            // ML assets: cache after first load, reuse across sessions.
            // No maxAgeSeconds — the runtime must never time-expire (Workbox's
            // expiration plugin purges proactively, independent of storage
            // pressure). Files are content-hashed, so a stale entry is benign;
            // maxEntries LRU bounds the store. See ADR-0002.
            urlPattern: /\.(onnx|wasm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-assets',
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // WASM JS module (incl. JSEP/WebGPU variant) — cacheable, loaded on
            // every whisper/pii/webgpu session
            urlPattern: /ort-wasm-simd-threaded.*\.mjs$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-assets',
              expiration: { maxEntries: 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
          dest: '.',
          rename: { stripBase: true, name: 'silero_vad_legacy.onnx' },
        },
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
          dest: '.',
          rename: { stripBase: true, name: 'ort-wasm-simd-threaded.wasm' },
        },
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
          dest: '.',
          rename: { stripBase: true, name: 'ort-wasm-simd-threaded.mjs' },
        },
        {
          src: 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm',
          dest: '.',
          rename: { stripBase: true, name: 'ort-wasm-simd-threaded.asyncify.wasm' },
        },
        {
          src: 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs',
          dest: '.',
          rename: { stripBase: true, name: 'ort-wasm-simd-threaded.asyncify.mjs' },
        },
        {
          // Nested copy — see the ML_ASSETS comment above for why (must match the
          // onnxruntime-web version transformers.js resolves at runtime; the
          // top-level package's JSEP wasm is 0.7 MiB larger and trips Cloudflare's
          // 25 MiB per-asset limit).
          src: 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
          dest: '.',
          rename: { stripBase: true, name: 'ort-wasm-simd-threaded.jsep.wasm' },
        },
        {
          src: 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
          dest: '.',
          rename: { stripBase: true, name: 'ort-wasm-simd-threaded.jsep.mjs' },
        },
      ],
    }),
  ],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8080,
    strictPort: false,
    // Mirror the Worker's cross-origin isolation headers (worker/index.ts) so
    // `crossOriginIsolated` — and therefore multi-threaded onnxruntime — is true
    // in dev too. Without this, dev and prod take different code paths through
    // ort and any dev timing measurement says nothing about prod.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // ML/audio stack — only loaded when Session page is visited
          if (
            id.includes('@huggingface/transformers') ||
            id.includes('onnxruntime-web') ||
            id.includes('@ricky0123/vad-web') ||
            id.includes('soundtouchjs')
          )
            return 'vendor-ml';
          // PDF rendering — also session-page only
          if (id.includes('@react-pdf')) return 'vendor-pdf';
          // Rich-text editor
          if (id.includes('@tiptap') || id.includes('tiptap-markdown')) return 'vendor-editor';
        },
      },
    },
  },
});
