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
  '/ort-wasm-simd-threaded.jsep.wasm': {
    file: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
    contentType: 'application/wasm',
  },
  '/ort-wasm-simd-threaded.jsep.mjs': {
    file: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
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
            // WASM JS module — cacheable, loaded on every whisper/pii session
            urlPattern: /ort-wasm-simd-threaded(?!.*\.jsep).*\.mjs$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-assets',
              expiration: { maxEntries: 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // JSEP (WebGPU) module — we use device:'wasm' in all workers so
            // this should never be requested, but if it is, let it fall through
            // to the network rather than risk a CacheFirst handler throwing and
            // blocking the ONNX runtime load entirely.
            urlPattern: /ort-wasm-simd-threaded.*\.jsep\.mjs$/,
            handler: 'NetworkOnly',
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
          rename: 'silero_vad_legacy.onnx',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
          dest: '.',
          rename: 'ort-wasm-simd-threaded.wasm',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
          dest: '.',
          rename: 'ort-wasm-simd-threaded.mjs',
        },
        // NOTE: the JSEP (WebGPU) variant — ort-wasm-simd-threaded.jsep.{wasm,mjs}
        // — is intentionally NOT copied into the build. Every onnxruntime consumer
        // (whisper.worker.ts, vadML.ts, privacyFilter worker) forces the plain WASM
        // backend (device:'wasm'), so the JSEP file is never requested at runtime.
        // It is 26 MiB, which exceeds Cloudflare Workers' 25 MiB per-asset limit and
        // fails the deploy. Keep it out unless a worker actually opts into WebGPU.
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
          // Data visualisation
          if (id.includes('@visx')) return 'vendor-charts';
        },
      },
    },
  },
});
