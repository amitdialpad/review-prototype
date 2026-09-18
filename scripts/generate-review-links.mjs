#!/usr/bin/env node
import { resolve } from 'node:path';
import { formatReviewLinks, generateReviewLinks, readManifest } from './review-links.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const manifestPath = option('--manifest');
const baseUrl = option('--base-url');
if (!manifestPath || !baseUrl) {
  console.error('Usage: generate-review-links --manifest <file> --base-url <url> [--session <token>] [--format json]');
  process.exit(1);
}

try {
  const manifest = await readManifest(resolve(manifestPath));
  const result = generateReviewLinks(manifest, baseUrl, option('--session'));
  process.stdout.write(formatReviewLinks(result, option('--format') || 'text'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
