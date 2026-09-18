import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
const proxy = { '/api': { target: `http://127.0.0.1:${config.companionPort}` } };
// Soundfonts must use the web bundle's registry, Pattern class and AudioContext.
const strudelBundle = fileURLToPath(new URL('./node_modules/@strudel/web/dist/index.mjs', import.meta.url));
export default defineConfig({
  resolve: { alias: [{ find: /^@strudel\/(core|webaudio)$/, replacement: strudelBundle }] },
  optimizeDeps: { include: ['@strudel/web', '@strudel/soundfonts/fontloader.mjs'] },
  server: {
    host: 'localhost', port: config.uiPort, strictPort: true, proxy,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.local/**', '**/.codex/**', '**/.agents/**', '**/.vscode/**', '**/.idea/**'] },
  },
  preview: { host: 'localhost', port: config.previewPort, strictPort: true, proxy },
});
