// Bundles main, preload and the three renderer pages into dist/.
// `--production` minifies and drops source maps.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const production = process.argv.includes('--production');
const pages = ['overlay', 'toolbar', 'panel'];

rmSync('dist', { recursive: true, force: true });

const common = {
  bundle: true,
  minify: production,
  sourcemap: production ? false : 'linked',
  legalComments: 'none',
  logLevel: 'warning',
};

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/main/main.ts'],
    outfile: 'dist/main/main.cjs',
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: ['src/preload/preload.ts'],
    outfile: 'dist/preload/preload.cjs',
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: Object.fromEntries(pages.map((p) => [`${p}/index`, `src/renderer/${p}/${p}.ts`])),
    outdir: 'dist/renderer',
    platform: 'browser',
    format: 'esm',
    target: 'chrome130',
  }),
]);

for (const page of pages) {
  cpSync(`src/renderer/${page}/index.html`, `dist/renderer/${page}/index.html`);
}
mkdirSync('dist/assets', { recursive: true });
cpSync('resources/tray', 'dist/assets', { recursive: true });
