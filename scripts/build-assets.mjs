import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const css = readFileSync(join(root, 'src/styles/app.css'), 'utf8');
const js = readFileSync(join(root, 'src/js/app.js'), 'utf8');

mkdirSync(join(root, 'public/generated'), { recursive: true });
writeFileSync(join(root, 'public/generated/styles.bundle.css'), css);
writeFileSync(join(root, 'public/generated/app.bundle.js'), js);

console.log('Synced src/styles/app.css and src/js/app.js into public/generated.');
