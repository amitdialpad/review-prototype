import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'src/review-prototype.js'), resolve(dist, 'review-prototype.js'));
await cp(resolve(root, 'src/review-prototype.css'), resolve(dist, 'review-prototype.css'));
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const assets = {};
for (const filename of ['review-prototype.js', 'review-prototype.css']) {
  const contents = await readFile(resolve(dist, filename));
  assets[filename] = `sha256-${createHash('sha256').update(contents).digest('hex')}`;
}
await writeFile(
  resolve(dist, 'review-prototype.manifest.json'),
  `${JSON.stringify({ schemaVersion: 1, packageVersion: packageJson.version, assets }, null, 2)}\n`
);
const example = await readFile(resolve(root, 'example/index.html'), 'utf8');
const apiUrl = process.env.REVIEW_PROTOTYPE_API_URL || '';
await writeFile(resolve(dist, 'index.html'), example.replaceAll('__REVIEW_API_URL__', apiUrl));
console.log('Built versioned Review Prototype assets and dist/index.html');
