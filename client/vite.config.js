import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 8020,
    host: '0.0.0.0',
  },
  preview: {
    port: 8020,
    host: '0.0.0.0',
  },
  publicDir: 'data',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
