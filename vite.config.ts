import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
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
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
          dest: '.',
          rename: 'ort-wasm-simd-threaded.jsep.wasm',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
          dest: '.',
          rename: 'ort-wasm-simd-threaded.jsep.mjs',
        },
      ],
    }),
  ],
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
    sourcemap: true,
  },
});
