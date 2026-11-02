// Assemble the deployable site in dist/: one JS bundle, one stylesheet, the page, the favicon, and the
// design system. Starts from an empty dist/ so nothing stale (for example a local data.json) is deployed.
// One bundle and one stylesheet keep the request chain flat. The Lighthouse "network dependency tree"
// audit is switched off in lighthouserc.json because it scores 0 for any page with an external asset.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2023',
});

// Order matters: tokens first, the page's own styles last. A new design-system component must be added
// here, or its CSS is not part of the page.
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
