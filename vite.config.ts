import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target:
      (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
        ?.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome105'
        : 'es2022',
    outDir: 'dist',
  },
});
