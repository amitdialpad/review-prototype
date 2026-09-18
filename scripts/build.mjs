import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'src/review-prototype.js'), resolve(dist, 'review-prototype.js'));
await cp(resolve(root, 'src/review-prototype.css'), resolve(dist, 'review-prototype.css'));
const example = await readFile(resolve(root, 'example/index.html'), 'utf8');
const apiUrl = process.env.REVIEW_PROTOTYPE_API_URL || '';
await writeFile(resolve(dist, 'index.html'), example.replaceAll('__REVIEW_API_URL__', apiUrl));
console.log('Built dist/review-prototype.js, dist/review-prototype.css, and dist/index.html');
