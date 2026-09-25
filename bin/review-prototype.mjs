#!/usr/bin/env node
import { cp, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReviewLinks, generateReviewLinks, readManifest } from '../scripts/review-links.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command] = process.argv.slice(2);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function fileHash(path) {
  try {
    const contents = await readFile(path);
    return `sha256-${createHash('sha256').update(contents).digest('hex')}`;
  } catch {
    return null;
  }
}

async function syncAssets({ printSnippet = false } = {}) {
  const publicDirectory = resolve(option('--public-dir', 'public/review-prototype'));
  await mkdir(publicDirectory, { recursive: true });
  const sourceManifestPath = resolve(root, 'dist/review-prototype.manifest.json');
  const targetManifestPath = resolve(publicDirectory, 'review-prototype.manifest.json');
  const sourceManifest = await readJson(sourceManifestPath);
  if (!sourceManifest) throw new Error('Review Prototype must be built before its assets can be synced.');
  const targetManifest = await readJson(targetManifestPath);
  const assetNames = ['review-prototype.js', 'review-prototype.css'];
  const targetAssetHashes = await Promise.all(
    assetNames.map(filename => fileHash(resolve(publicDirectory, filename)))
  );
  const changed =
    assetNames.some((filename, index) => targetAssetHashes[index] !== sourceManifest.assets[filename]) ||
    JSON.stringify(sourceManifest) !== JSON.stringify(targetManifest);
  if (changed) {
    await cp(resolve(root, 'dist/review-prototype.js'), resolve(publicDirectory, 'review-prototype.js'));
    await cp(resolve(root, 'dist/review-prototype.css'), resolve(publicDirectory, 'review-prototype.css'));
    await cp(sourceManifestPath, targetManifestPath);
  }
  const result = { changed, publicDirectory, ...sourceManifest };
  if (option('--format') === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  console.log(
    changed
      ? `Synced Review Prototype ${sourceManifest.packageVersion} to ${publicDirectory}`
      : `Review Prototype ${sourceManifest.packageVersion} is already current in ${publicDirectory}`
  );
  if (!printSnippet) return;
  const apiUrl = option('--api-url', 'https://YOUR-SITE.netlify.app');
  console.log(`\n<link rel="stylesheet" href="/review-prototype/review-prototype.css" />
<script type="module">
  import { ReviewPrototype } from '/review-prototype/review-prototype.js';
  ReviewPrototype.init({
    projectId: 'my-prototype',
    apiUrl: '${apiUrl}',
    router: 'history',
  });
</script>`);
}

async function init() {
  await syncAssets({ printSnippet: true });
}

async function links() {
  const manifestPath = option('--manifest');
  const baseUrl = option('--base-url');
  if (!manifestPath || !baseUrl) throw new Error('links requires --manifest and --base-url');
  const manifest = await readManifest(resolve(manifestPath));
  const result = generateReviewLinks(manifest, baseUrl, option('--session'));
  process.stdout.write(formatReviewLinks(result, option('--format', 'text')));
}

try {
  if (command === 'init') await init();
  else if (command === 'sync') await syncAssets();
  else if (command === 'links') await links();
  else {
    console.log(`Review Prototype

Commands:
  review-prototype init --public-dir <directory> [--api-url <url>]
  review-prototype sync --public-dir <directory> [--format json]
  review-prototype links --manifest <file> --base-url <url> [--session <token>] [--format json]`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
