import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cpSync, createReadStream, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

/**
 * PDF.js reads some pictures and fonts inside a PDF with helper files it fetches when it
 * needs them. They ship with the app under `pdfjs/`, taken from the installed package:
 * served from there while developing, and copied beside the built files.
 */
function pdfSupport(): Plugin {
  const from = join(process.cwd(), 'node_modules', 'pdfjs-dist');
  const parts = ['wasm', 'standard_fonts'];
  return {
    name: 'pdf-support',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0])).replace(/^[/\\]+/, '');
        const file = join(from, rel);
        if (!parts.some((p) => rel.startsWith(p + '/') || rel.startsWith(p + '\\')) || !file.startsWith(from) || !existsSync(file)) return next();
        if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const p of parts) cpSync(join(from, p), join(process.cwd(), 'dist', 'pdfjs', p), { recursive: true });
    },
  };
}

// Tauri expects a fixed dev port and serves the built files from dist/.
export default defineConfig({
  plugins: [svelte(), pdfSupport()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022', outDir: 'dist' },
});
