import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupExpired,
  handleReviewRequest,
  normalizeDraft,
} from '../netlify/functions/_review-core.mjs';

class MemoryStore {
  constructor() {
    this.values = new Map();
    this.version = 0;
  }

  list({ prefix = '', paginate = false } = {}) {
    const page = {
      blobs: [...this.values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, etag: value.etag })),
      directories: [],
    };
    if (!paginate) return Promise.resolve(page);
    return (async function* iterate() {
      yield page;
    })();
  }

  async get(key) {
    return this.values.get(key)?.data ?? null;
  }

  async getWithMetadata(key) {
    const value = this.values.get(key);
    return value ? { data: value.data, etag: value.etag, metadata: {} } : null;
  }

  async setJSON(key, data, conditions = {}) {
    const current = this.values.get(key);
    if (conditions.onlyIfNew && current) return { modified: false };
    if (conditions.onlyIfMatch && current?.etag !== conditions.onlyIfMatch) return { modified: false };
    this.version += 1;
    this.values.set(key, { data, etag: String(this.version) });
    return { modified: true, etag: String(this.version) };
  }

  async delete(key) {
    this.values.delete(key);
  }
}

const env = {
  ALLOWED_ORIGINS: 'https://prototype.example',
  RETENTION_DAYS: '90',
  URL: 'https://review-prototype.netlify.app',
};
const session = '550e8400-e29b-41d4-a716-446655440000';
const endpoint = `https://review-prototype.netlify.app/v1/projects/demo/sessions/${session}/comments`;

test('normalizes bounded comment data and ignores page contents', () => {
  assert.deepEqual(
    normalizeDraft({
      scope: '/billing',
      authorName: ' Sarah ',
      message: ' Move this ',
      x: 0.2,
      y: 0.4,
      selection: null,
      anchor: null,
      elementLabel: 'Plan card',
      html: '<main>private</main>',
    }),
    {
      scope: '/billing',
      authorName: 'Sarah',
      message: 'Move this',
      x: 0.2,
      y: 0.4,
      selection: null,
      anchor: null,
      elementLabel: 'Plan card',
    }
  );
});

test('accepts a privacy-safe structural element anchor', () => {
  const anchor = {
    path: 'main:nth-of-type(1)>section:nth-of-type(2)>article:nth-of-type(1)',
    offsetX: 0.75,
    offsetY: 0.25,
    selection: { x: 0.1, y: 0.2, width: 0.6, height: 0.4 },
  };
  assert.deepEqual(
    normalizeDraft({
      scope: '/billing',
      authorName: 'Josh',
      message: 'Keep this attached while scrolling',
      x: 0.5,
      y: 0.5,
      selection: null,
      anchor,
      elementLabel: 'Usage card',
    }).anchor,
    anchor
  );
});

test('rejects selectors that could expose page content or attributes', () => {
  assert.throws(
    () =>
      normalizeDraft({
        scope: '/billing',
        authorName: 'Josh',
        message: 'Unsafe selector',
        x: 0.5,
        y: 0.5,
        selection: null,
        anchor: { path: '[data-customer="secret"]', offsetX: 0.5, offsetY: 0.5, selection: null },
        elementLabel: 'Card',
      }),
    /anchor\.path is invalid/
  );
});

test('creates and immediately reads a shared comment with strong-consistency storage', async () => {
  const store = new MemoryStore();
  const draft = {
    scope: '/billing',
    authorName: 'Sarah',
    message: 'Tighten this copy',
    x: 0.2,
    y: 0.4,
    selection: null,
    elementLabel: 'Plan card',
  };
  const created = await handleReviewRequest(
    new Request(endpoint, {
      method: 'POST',
      headers: { Origin: 'https://prototype.example', 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }),
    env,
    store
  );
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('Access-Control-Allow-Origin'), 'https://prototype.example');
  const createdComment = await created.json();
  assert.equal(createdComment.status, 'open');

  const listed = await handleReviewRequest(
    new Request(endpoint, { headers: { Origin: 'https://prototype.example' } }),
    env,
    store
  );
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json()).comments.map(comment => comment.message), ['Tighten this copy']);
});

test('marks a shared comment Done without deleting it from inbox history', async () => {
  const store = new MemoryStore();
  const created = await handleReviewRequest(
    new Request(endpoint, {
      method: 'POST',
      headers: { Origin: 'https://prototype.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: '/billing',
        authorName: 'Sarah',
        message: 'Tighten this copy',
        x: 0.2,
        y: 0.4,
        selection: null,
        elementLabel: 'Plan card',
      }),
    }),
    env,
    store
  );
  const comment = await created.json();
  const resolved = await handleReviewRequest(
    new Request(`${endpoint}/${comment.id}`, {
      method: 'PATCH',
      headers: { Origin: 'https://prototype.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    }),
    env,
    store
  );
  assert.equal(resolved.status, 200);
  const resolvedComment = await resolved.json();
  assert.equal(resolvedComment.status, 'done');
  assert.match(resolvedComment.resolvedAt, /^\d{4}-\d{2}-\d{2}T/);

  const listed = await handleReviewRequest(
    new Request(endpoint, { headers: { Origin: 'https://prototype.example' } }),
    env,
    store
  );
  const comments = (await listed.json()).comments;
  assert.equal(comments.length, 1);
  assert.equal(comments[0].status, 'done');
});

test('rejects unsupported comment status changes and unknown comments', async () => {
  const store = new MemoryStore();
  const invalid = await handleReviewRequest(
    new Request(`${endpoint}/550e8400-e29b-41d4-a716-446655440099`, {
      method: 'PATCH',
      headers: { Origin: 'https://prototype.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    }),
    env,
    store
  );
  assert.equal(invalid.status, 400);

  const missing = await handleReviewRequest(
    new Request(`${endpoint}/550e8400-e29b-41d4-a716-446655440099`, {
      method: 'PATCH',
      headers: { Origin: 'https://prototype.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    }),
    env,
    store
  );
  assert.equal(missing.status, 404);
});

test('advertises PATCH for shared Done state', async () => {
  const response = await handleReviewRequest(
    new Request(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://prototype.example' } }),
    env,
    new MemoryStore()
  );
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PATCH, OPTIONS');
});

test('rejects an unapproved website origin', async () => {
  const response = await handleReviewRequest(
    new Request(endpoint, { headers: { Origin: 'https://untrusted.example' } }),
    env,
    new MemoryStore()
  );
  assert.equal(response.status, 403);
});

test('health endpoint reports Netlify storage and retention', async () => {
  const response = await handleReviewRequest(
    new Request('https://review-prototype.netlify.app/health'),
    env,
    new MemoryStore()
  );
  assert.deepEqual(await response.json(), { ok: true, retentionDays: 90, storage: 'netlify-blobs' });
});

test('daily cleanup deletes expired comments and stale rate windows', async () => {
  const store = new MemoryStore();
  const now = 2_000_000;
  await store.setJSON('comments/demo/session/1999999-old', {});
  await store.setJSON('comments/demo/session/2000001-new', {});
  await store.setJSON('limits/demo/session/1', { count: 1 });
  const result = await cleanupExpired(store, now);
  assert.deepEqual(result, { deletedComments: 1, deletedLimits: 1 });
  assert.equal(store.values.has('comments/demo/session/1999999-old'), false);
  assert.equal(store.values.has('comments/demo/session/2000001-new'), true);
});
