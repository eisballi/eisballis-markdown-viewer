// Kopiert die beiden Frontend-Abhängigkeiten in den Renderer-Ordner,
// damit die App ohne Bundler und ohne node_modules im Paket läuft.
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'src', 'renderer', 'vendor');

const files = [
  { from: 'node_modules/marked/lib/marked.umd.js', to: 'marked.umd.js' },
  { from: 'node_modules/dompurify/dist/purify.min.js', to: 'purify.min.js' },
];

mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const source = path.join(root, file.from);
  try {
    if (!existsSync(source)) throw new Error('fehlt');
    copyFileSync(source, path.join(outDir, file.to));
    const kb = Math.round(statSync(source).size / 1024);
    console.log(`vendor: ${file.to} (${kb} KB)`);
  } catch {
    console.error(`vendor: ${file.from} nicht gefunden – bitte zuerst "npm install" ausführen.`);
    process.exit(1);
  }
}
