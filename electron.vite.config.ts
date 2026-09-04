import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@core': resolve('src/renderer/core'),
        '@scene': resolve('src/renderer/scene'),
        '@themes': resolve('src/renderer/themes'),
        '@ui': resolve('src/renderer/ui'),
        '@audio': resolve('src/renderer/audio'),
      },
    },
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } },
      chunkSizeWarningLimit: 2000,
    },
    plugins: [react()],
  },
});
