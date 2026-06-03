// build.mjs — inline the ESM source into a single self-contained HTML file.
//
// No bundler, no dependencies (same spirit as tabstash's icon generator). It
// concatenates the core modules + UI in dependency order, strips the
// `import`/`export` keywords (everything ends up in one IIFE scope), and inlines
// the CSS. The result, dist/index.html, has zero external requests — so it
// renders from any static host (GitHub Pages, raw.githack, even a file://),
// which is exactly what makes it painless to open on a phone.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Dependency order: leaves first, UI last.
const MODULES = [
  'src/core/rng.js',
  'src/core/cards.js',
  'src/core/enemies.js',
  'src/core/combat.js',
  'src/core/run.js',
  'src/ui/app.js',
];

/** Remove ES module syntax so the files can live in one shared scope. */
function stripModuleSyntax(src) {
  return src
    // drop `import { ... } from '...';` (handles multi-line import lists)
    .replace(/import\s+[\w*\s{},]+\s+from\s+['"][^'"]+['"];?/g, '')
    // turn `export function/const/...` into plain declarations, keep indent
    .replace(/^(\s*)export\s+/gm, '$1');
}

const js = MODULES
  .map((f) => `// ===== ${f} =====\n${stripModuleSyntax(readFileSync(join(root, f), 'utf8'))}`)
  .join('\n\n');

// Sanity check: nothing should slip through that would break a plain <script>.
for (const leak of [/^\s*import\s+[\w*{]/m, /^\s*export\s+/m]) {
  if (leak.test(js)) throw new Error(`Build leaked module syntax: ${leak}`);
}

const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
  <meta name="theme-color" content="#15131f" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="mobile-web-app-capable" content="yes" />
  <title>Spireling</title>
  <style>${css}</style>
</head>
<body>
  <div id="app"></div>
  <script>
(function () {
${js}
})();
  </script>
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`Wrote dist/index.html (${kb} KB, self-contained).`);
