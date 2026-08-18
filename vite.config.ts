import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_ORIGIN = process.env['INTAKE_ORIGIN'] ?? 'http://localhost:4317';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 4316,
    // WHY: the SSE response must reach the browser unbuffered, or the reveal
    // arrives as one lump and the grilling stops feeling like a conversation.
    proxy: { '/api': { target: API_ORIGIN, changeOrigin: true } },
  },
});
