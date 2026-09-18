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

export function normalizeDraft(value) {
  if (!value || typeof value !== 'object') throw new Error('Comment body is invalid');
  return {
    scope: boundedText(value.scope, 'scope', 500),
    authorName: boundedText(value.authorName, 'authorName', 80),
    message: boundedText(value.message, 'message', 4_000),
    x: normalizedNumber(value.x, 'x'),
    y: normalizedNumber(value.y, 'y'),
    selection: normalizeSelection(value.selection),
    elementLabel: boundedText(value.elementLabel, 'elementLabel', 160, { allowEmpty: true }),
  };
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!origin) return null;
  return allowed.includes(origin) ? origin : false;
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

function rowToComment(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    scope: row.scope,
    authorName: row.author_name,
    message: row.message,
    x: row.x,
    y: row.y,
    selection: row.selection_json ? JSON.parse(row.selection_json) : null,
    elementLabel: row.element_label,
    createdAt: row.created_at,
  };
}

async function limitedJsonBody(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('Comment body is too large');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new Error('Comment body is too large');
  return JSON.parse(text);
}

async function useSessionWriteSlot(database, projectId, sessionId) {
  const windowStart = Math.floor(Date.now() / 60_000);
  await database
    .prepare(
      `INSERT INTO review_write_limits (project_id, session_id, window_start, write_count)
       VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(project_id, session_id, window_start)
       DO UPDATE SET write_count = write_count + 1`
    )
    .bind(projectId, sessionId, windowStart)
    .run();
  const count = await database
    .prepare(
      `SELECT write_count
         FROM review_write_limits
        WHERE project_id = ?1 AND session_id = ?2 AND window_start = ?3`
    )
    .bind(projectId, sessionId, windowStart)
    .first('write_count');
  return Number(count) <= RATE_LIMIT_PER_MINUTE;
}

function parseRoute(pathname) {
  const match = pathname.match(/^\/v1\/projects\/([^/]+)\/sessions\/([^/]+)\/comments$/);
  if (!match) return null;
  const projectId = decodeURIComponent(match[1]);
  const sessionId = decodeURIComponent(match[2]);
  if (!PROJECT_PATTERN.test(projectId) || !SESSION_PATTERN.test(sessionId)) return false;
  return { projectId, sessionId };
}

export async function deleteExpired(database) {
  await database.prepare(`DELETE FROM review_comments WHERE expires_at <= datetime('now')`).run();
  const oldestWindow = Math.floor(Date.now() / 60_000) - 2;
  await database.prepare(`DELETE FROM review_write_limits WHERE window_start < ?1`).bind(oldestWindow).run();
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
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

  if (url.pathname === '/health' && request.method === 'GET') {
    return json({ ok: true, retentionDays: Number(env.RETENTION_DAYS || 90) }, 200, origin);
  }

  const route = parseRoute(url.pathname);
  if (route === null) return json({ error: 'Not found' }, 404, origin);
  if (route === false) return json({ error: 'Invalid review session' }, 400, origin);
  const { projectId, sessionId } = route;

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT id, session_id, project_id, scope, author_name, message, x, y,
              selection_json, element_label, created_at
         FROM review_comments
        WHERE project_id = ?1 AND session_id = ?2 AND expires_at > datetime('now')
        ORDER BY created_at ASC`
    )
      .bind(projectId, sessionId)
      .all();
    return json({ comments: result.results.map(rowToComment) }, 200, origin);
  }

  if (request.method === 'POST') {
    if (!(await useSessionWriteSlot(env.DB, projectId, sessionId))) {
      return json({ error: 'Please wait before adding another comment' }, 429, origin);
    }
    const draft = normalizeDraft(await limitedJsonBody(request));
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS comment_count
         FROM review_comments
        WHERE project_id = ?1 AND session_id = ?2 AND expires_at > datetime('now')`
    )
      .bind(projectId, sessionId)
      .first('comment_count');
    if (Number(count) >= MAX_COMMENTS_PER_SESSION) {
      return json({ error: 'This review session is full' }, 409, origin);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const retentionDays = Math.max(1, Math.min(365, Number(env.RETENTION_DAYS || 90)));
    const expiresAt = new Date(Date.now() + retentionDays * 86_400_000).toISOString();
    const comment = { ...draft, id, sessionId, projectId, createdAt };
    await env.DB.prepare(
      `INSERT INTO review_comments
         (id, session_id, project_id, scope, author_name, message, x, y,
          selection_json, element_label, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
    )
      .bind(
        id,
        sessionId,
        projectId,
        draft.scope,
        draft.authorName,
        draft.message,
        draft.x,
        draft.y,
        draft.selection ? JSON.stringify(draft.selection) : null,
        draft.elementLabel,
        createdAt,
        expiresAt
      )
      .run();
    return json(comment, 201, origin);
  }

  return json({ error: 'Method not allowed' }, 405, origin);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process comment';
      return json({ error: message }, 400, allowedOrigin(request, env) || null);
    }
  },

  async scheduled(_controller, env, context) {
    context.waitUntil(deleteExpired(env.DB));
  },
};
