// build.mjs — inline all sources into a single self-contained HTML file.
// The Google Fonts import in styles.css is the only external request; everything
// else is inlined so the game works from any static host (or file://).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

const MODULES = [
  'src/core/rng.js',
  'src/core/cards.js',
  'src/core/enemies.js',
  'src/core/combat.js',
  'src/core/run.js',
  'src/ui/sprites.js',
  'src/ui/arena.js',
  'src/ui/app.js',
];

function stripModuleSyntax(src) {
  return src
    .replace(/import\s+[\w*\s{},]+\s+from\s+['"][^'"]+['"];?\n?/g, '')
    .replace(/^(\s*)export\s+(?=(?:function|class|const|let|var|async))/gm, '$1');
}

const js = MODULES
  .map((f) => `// === ${f} ===\n${stripModuleSyntax(readFileSync(join(root, f), 'utf8'))}`)
  .join('\n\n');

// Validate: no leaked ES module syntax
for (const re of [/^\s*import\s+[\w{]/m, /^\s*export\s+(?:function|const|class)/m]) {
  if (re.test(js)) {
    const line = js.split('\n').findIndex((l) => re.test(l));
    throw new Error(`Build leaked module syntax at line ~${line}: ${re}`);
  }
}

const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
  <meta name="theme-color" content="#0d0d14" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="mobile-web-app-capable" content="yes" />
  <title>The Last Bard</title>
  <style>${css}</style>
</head>
<body>
  <div id="app"></div>
  <script>
(function () {
'use strict';
${js}
})();
  </script>
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`dist/index.html → ${kb} KB, self-contained.`);
