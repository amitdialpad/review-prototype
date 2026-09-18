import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { deleteExpired, normalizeDraft } from '../worker/worker.mjs';

test('normalizes a bounded comment without collecting page contents', () => {
  assert.deepEqual(
    normalizeDraft({
      scope: '/billing',
      authorName: ' Sarah ',
      message: ' Move this ',
      x: 0.2,
      y: 0.4,
      selection: null,
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
      elementLabel: 'Plan card',
    }
  );
});

test('rejects invalid normalized coordinates', () => {
  assert.throws(
    () =>
      normalizeDraft({
        scope: '/',
        authorName: 'Sarah',
        message: 'Hello',
        x: 2,
        y: 0,
        selection: null,
        elementLabel: 'Page',
      }),
    /between 0 and 1/
  );
});

test('scheduled cleanup deletes expired comments and stale rate windows', async () => {
  const statements = [];
  const database = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() {
          return this;
        },
        async run() {},
      };
    },
  };
  await deleteExpired(database);
  assert.match(statements[0], /DELETE FROM review_comments/);
  assert.match(statements[1], /DELETE FROM review_write_limits/);
});

test('health endpoint reports the retention policy', async () => {
  const response = await worker.fetch(new Request('https://worker.example/health'), {
    ALLOWED_ORIGINS: 'https://prototype.example',
    RETENTION_DAYS: '90',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, retentionDays: 90 });
});
