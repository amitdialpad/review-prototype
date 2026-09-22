const SESSION_PATTERN = /^[a-zA-Z0-9_-]{20,128}$/;
const PROJECT_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const MAX_BODY_BYTES = 16_384;
const MAX_COMMENTS_PER_SESSION = 1_000;
const RATE_LIMIT_PER_MINUTE = 60;

function boundedText(value, field, maximum, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new Error(`${field} must be text`);
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > maximum) throw new Error(`${field} is invalid`);
  return text;
}

function normalizedNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1`);
  }
  return value;
}

function normalizeSelection(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') throw new Error('selection is invalid');
  return {
    x: normalizedNumber(value.x, 'selection.x'),
    y: normalizedNumber(value.y, 'selection.y'),
    width: normalizedNumber(value.width, 'selection.width'),
    height: normalizedNumber(value.height, 'selection.height'),
  };
}

const ANCHOR_PATH_PATTERN = /^(?:\$|[a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]*\)(?:>[a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]*\)){0,31})$/;

function normalizeAnchor(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') throw new Error('anchor is invalid');
  const path = boundedText(value.path, 'anchor.path', 1_024);
  if (!ANCHOR_PATH_PATTERN.test(path)) throw new Error('anchor.path is invalid');
  return {
    path,
    offsetX: normalizedNumber(value.offsetX, 'anchor.offsetX'),
    offsetY: normalizedNumber(value.offsetY, 'anchor.offsetY'),
    selection: normalizeSelection(value.selection),
  };
}

export function normalizeDraft(value) {
  if (!value || typeof value !== 'object') throw new Error('Comment body is invalid');
  return {
    scope: boundedText(value.scope, 'scope', 500),
    authorName: boundedText(value.authorName, 'authorName', 80),
    message: boundedText(value.message, 'message', 4_000),
    x: normalizedNumber(value.x, 'x'),
    y: normalizedNumber(value.y, 'y'),
    selection: normalizeSelection(value.selection),
    anchor: normalizeAnchor(value.anchor),
    elementLabel: boundedText(value.elementLabel, 'elementLabel', 160, { allowEmpty: true }),
  };
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (env.URL) {
    try {
      allowed.push(new URL(env.URL).origin);
    } catch {
      // Ignore malformed optional platform values.
    }
  }
  return [...new Set(allowed)].includes(origin) ? origin : false;
}

function json(body, status, origin = null) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function limitedJsonBody(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('Comment body is too large');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new Error('Comment body is too large');
  return JSON.parse(text);
}

function commentPrefix(projectId, sessionId) {
  return `comments/${projectId}/${sessionId}/`;
}

function expirationFromCommentKey(key) {
  const fileName = key.split('/').at(-1) || '';
  const expiration = Number(fileName.split('-')[0]);
  return Number.isFinite(expiration) ? expiration : 0;
}

async function listComments(store, projectId, sessionId, now = Date.now()) {
  const result = await store.list({ prefix: commentPrefix(projectId, sessionId) });
  const active = result.blobs.filter(blob => expirationFromCommentKey(blob.key) > now);
  const comments = await Promise.all(
    active.map(blob => store.get(blob.key, { type: 'json', consistency: 'strong' }))
  );
  return comments.filter(Boolean).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function useWriteSlot(store, projectId, sessionId, now = Date.now()) {
  const minute = Math.floor(now / 60_000);
  const key = `limits/${projectId}/${sessionId}/${minute}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const nextCount = Number(current?.data?.count || 0) + 1;
    if (nextCount > RATE_LIMIT_PER_MINUTE) return false;
    const result = await store.setJSON(
      key,
      { count: nextCount },
      current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true }
    );
    if (result.modified) return true;
  }
  return false;
}

function readRoute(request) {
  const url = new URL(request.url);
  if (url.pathname === '/health') return { health: true };
  const pathMatch = url.pathname.match(
    /^\/v1\/projects\/([^/]+)\/sessions\/([^/]+)\/comments\/?$/
  );
  if (pathMatch) {
    const projectId = decodeURIComponent(pathMatch[1]);
    const sessionId = decodeURIComponent(pathMatch[2]);
    if (!PROJECT_PATTERN.test(projectId) || !SESSION_PATTERN.test(sessionId)) return null;
    return { projectId, sessionId };
  }
  const projectId = url.searchParams.get('projectId') || '';
  const sessionId = url.searchParams.get('sessionId') || '';
  if (!projectId && !sessionId && url.searchParams.get('health') === '1') return { health: true };
  if (!PROJECT_PATTERN.test(projectId) || !SESSION_PATTERN.test(sessionId)) return null;
  return { projectId, sessionId };
}

export async function cleanupExpired(store, now = Date.now()) {
  let deletedComments = 0;
  let deletedLimits = 0;
  for await (const page of store.list({ prefix: 'comments/', paginate: true })) {
    for (const blob of page.blobs) {
      if (expirationFromCommentKey(blob.key) <= now) {
        await store.delete(blob.key);
        deletedComments += 1;
      }
    }
  }
  const oldestMinute = Math.floor(now / 60_000) - 2;
  for await (const page of store.list({ prefix: 'limits/', paginate: true })) {
    for (const blob of page.blobs) {
      const minute = Number(blob.key.split('/').at(-1));
      if (!Number.isFinite(minute) || minute < oldestMinute) {
        await store.delete(blob.key);
        deletedLimits += 1;
      }
    }
  }
  return { deletedComments, deletedLimits };
}

export async function handleReviewRequest(request, env, store) {
  const origin = allowedOrigin(request, env);
  if (origin === false) return json({ error: 'Origin is not allowed' }, 403);

  if (request.method === 'OPTIONS') {
    const response = new Response(null, { status: 204 });
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.headers.set('Access-Control-Max-Age', '86400');
      response.headers.set('Vary', 'Origin');
    }
    return response;
  }

  const route = readRoute(request);
  if (!route) return json({ error: 'Invalid review session' }, 400, origin);
  if (route.health && request.method === 'GET') {
    return json({ ok: true, retentionDays: Number(env.RETENTION_DAYS || 90), storage: 'netlify-blobs' }, 200, origin);
  }

  const { projectId, sessionId } = route;
  if (request.method === 'GET') {
    return json({ comments: await listComments(store, projectId, sessionId) }, 200, origin);
  }

  if (request.method === 'POST') {
    if (!(await useWriteSlot(store, projectId, sessionId))) {
      return json({ error: 'Please wait before adding another comment' }, 429, origin);
    }
    const activeComments = await listComments(store, projectId, sessionId);
    if (activeComments.length >= MAX_COMMENTS_PER_SESSION) {
      return json({ error: 'This review session is full' }, 409, origin);
    }
    const draft = normalizeDraft(await limitedJsonBody(request));
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const retentionDays = Math.max(1, Math.min(365, Number(env.RETENTION_DAYS || 90)));
    const expiresAt = Date.now() + retentionDays * 86_400_000;
    const comment = { ...draft, id, sessionId, projectId, createdAt };
    await store.setJSON(`${commentPrefix(projectId, sessionId)}${expiresAt}-${id}`, comment, { onlyIfNew: true });
    return json(comment, 201, origin);
  }

  return json({ error: 'Method not allowed' }, 405, origin);
}
