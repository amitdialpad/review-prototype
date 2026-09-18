#!/usr/bin/env node
import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReviewLinks, generateReviewLinks, readManifest } from '../scripts/review-links.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command] = process.argv.slice(2);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function init() {
  const publicDirectory = resolve(option('--public-dir', 'public/review-prototype'));
  await mkdir(publicDirectory, { recursive: true });
  await cp(resolve(root, 'dist/review-prototype.js'), resolve(publicDirectory, 'review-prototype.js'));
  await cp(resolve(root, 'dist/review-prototype.css'), resolve(publicDirectory, 'review-prototype.css'));
  const apiUrl = option('--api-url', 'https://YOUR-WORKER.workers.dev');
  console.log(`Copied Review Prototype to ${publicDirectory}\n`);
  console.log(`<link rel="stylesheet" href="/review-prototype/review-prototype.css" />
<script type="module">
  import { ReviewPrototype } from '/review-prototype/review-prototype.js';
  ReviewPrototype.init({
    projectId: 'my-prototype',
    apiUrl: '${apiUrl}',
    router: 'history',
  });
</script>`);
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
  else if (command === 'links') await links();
  else {
    console.log(`Review Prototype

Commands:
  review-prototype init --public-dir <directory> [--api-url <url>]
  review-prototype links --manifest <file> --base-url <url> [--session <token>] [--format json]`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
