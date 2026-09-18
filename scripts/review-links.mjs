import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const ID_PATTERN = /^[a-zA-Z0-9_-]{20,128}$/;
const PROJECT_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

export async function readManifest(path) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.version !== 1) throw new Error('Manifest version must be 1.');
  if (!PROJECT_PATTERN.test(manifest.projectId || '')) throw new Error('Manifest projectId is invalid.');
  if (!['history', 'hash'].includes(manifest.router)) throw new Error('Manifest router must be history or hash.');
  if (!Array.isArray(manifest.routes) || !manifest.routes.length) throw new Error('Manifest needs at least one route.');
  for (const route of manifest.routes) {
    if (!route?.label || typeof route.path !== 'string' || !route.path.startsWith('/')) {
      throw new Error('Every route needs a label and an absolute path.');
    }
  }
  return manifest;
}

function applyQuery(url, query = {}) {
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
}

export function generateReviewLinks(manifest, baseUrl, session = randomUUID()) {
  if (!ID_PATTERN.test(session)) throw new Error('Session token must contain 20-128 URL-safe characters.');
  const reviewParam = manifest.reviewParam || 'review';
  const base = new URL(baseUrl);
  const links = manifest.routes.map(route => {
    let url;
    if (manifest.router === 'hash') {
      url = new URL(base);
      const routeUrl = new URL(route.path, base.origin);
      applyQuery(routeUrl, route.query);
      routeUrl.searchParams.set(reviewParam, session);
      url.hash = `#${routeUrl.pathname}${routeUrl.search}`;
    } else {
      url = new URL(route.path, base);
      applyQuery(url, route.query);
      url.searchParams.set(reviewParam, session);
    }
    return { label: route.label, url: url.toString() };
  });
  return { name: manifest.name, projectId: manifest.projectId, session, links };
}

export function formatReviewLinks(result, format = 'text') {
  if (format === 'json') return `${JSON.stringify(result, null, 2)}\n`;
  return [
    `Review: ${result.name}`,
    `Session: ${result.session}`,
    'Links:',
    ...result.links.map(link => `- ${link.label}: ${link.url}`),
    '',
  ].join('\n');
}
