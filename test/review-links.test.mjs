import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReviewLinks } from '../scripts/review-links.mjs';

const session = '550e8400-e29b-41d4-a716-446655440000';

test('creates one history-router session across every route', () => {
  const result = generateReviewLinks(
    {
      version: 1,
      name: 'Billing',
      projectId: 'billing',
      router: 'history',
      reviewParam: 'review',
      routes: [
        { label: 'Credits', path: '/credits', query: { scene: 'low' } },
        { label: 'Summary', path: '/summary' },
      ],
    },
    'https://prototype.example.com/base/',
    session
  );
  assert.equal(result.session, session);
  assert.deepEqual(
    result.links.map(link => link.url),
    [
      `https://prototype.example.com/credits?scene=low&review=${session}`,
      `https://prototype.example.com/summary?review=${session}`,
    ]
  );
});

test('places hash-router parameters inside the hash route', () => {
  const result = generateReviewLinks(
    {
      version: 1,
      name: 'Demo',
      projectId: 'demo',
      router: 'hash',
      routes: [{ label: 'One', path: '/one', query: { state: 'ready' } }],
    },
    'https://prototype.example.com/app/',
    session
  );
  assert.equal(result.links[0].url, `https://prototype.example.com/app/#/one?state=ready&review=${session}`);
});
