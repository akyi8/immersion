import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

/**
 * Files two libraries fetch while they run, taken from the installed packages: served
 * from there while developing, and copied beside the built files. PDF.js reads some
 * pictures and fonts inside a PDF with helper files under `pdfjs/`. Dice-Box loads its
 * physics engine and the dice themselves from `dicebox/`.
 */
function support(): Plugin {
  const modules = join(process.cwd(), 'node_modules');
  const mounts: { url: string; from: string; parts: string[] }[] = [
    { url: '/pdfjs', from: join(modules, 'pdfjs-dist'), parts: ['wasm', 'standard_fonts'] },
    { url: '/dicebox', from: join(modules, '@3d-dice', 'dice-box', 'dist', 'assets'), parts: ['ammo', 'themes'] },
  ];
  return {
    name: 'library-support',
    configureServer(server) {
      for (const { url, from, parts } of mounts) {
        server.middlewares.use(url, (req, res, next) => {
          const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0])).replace(/^[/\\]+/, '');
          const file = join(from, rel);
          if (!parts.some((p) => rel.startsWith(p + '/') || rel.startsWith(p + '\\')) || !file.startsWith(from) || !existsSync(file) || !statSync(file).isFile()) return next();
          if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
          if (file.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
          createReadStream(file).pipe(res);
        });
      }
    },
    closeBundle() {
      for (const { url, from, parts } of mounts) for (const p of parts) cpSync(join(from, p), join(process.cwd(), 'dist', url.slice(1), p), { recursive: true });
    },
  };
}

// Tauri expects a fixed dev port and serves the built files from dist/.
export default defineConfig({
  plugins: [svelte(), support()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022', outDir: 'dist' },
});
