import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Relative asset URLs ("./assets/...") instead of the default
    // domain-root-absolute ones ("/assets/...") — needed so the built
    // dist/index.html works when opened straight off disk via file://
    // (the Windows Electron build's mainWindow.loadFile, see
    // electron/main.cjs) as well as when served over plain HTTP from a
    // root path, which this stays compatible with either way.
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
