// Assemble the deployable site in dist/: one JS bundle, one stylesheet, the page, and the design system.
// Fewer, flatter requests keep the page fast (Lighthouse flags long request chains).
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { build } from 'esbuild';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2023',
});

const stylesheets = [
  'design-system/tokens.css',
  'design-system/components/stat-tile/component.css',
  'design-system/components/data-table/component.css',
  'site/styles.css',
];
writeFileSync('dist/styles.css', stylesheets.map((file) => readFileSync(file, 'utf8')).join('\n'));

cpSync('site/index.html', 'dist/index.html');
cpSync('site/favicon.svg', 'dist/favicon.svg');
cpSync('design-system', 'dist/design-system', { recursive: true });
console.log('build: wrote dist/');
