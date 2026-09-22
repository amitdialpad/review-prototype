import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorPresentation,
  mergeDictationTranscript,
  parseReviewSession,
  reviewValueFromUrl,
  routeScopeFromUrl,
  withReviewParam,
} from '../src/review-prototype.js';

test('places dictated text at the caret without overwriting typed text', () => {
  assert.equal(mergeDictationTranscript('Change this copy', 'please', 7, 7), 'Change please this copy');
  assert.equal(mergeDictationTranscript('Change this copy', 'please', 16, 16), 'Change this copy please');
  assert.equal(mergeDictationTranscript('Hello.', 'world', 5, 5), 'Hello world.');
});

test('replaces a selected range and respects the comment length limit', () => {
  assert.equal(mergeDictationTranscript('Change this copy', 'that', 7, 11), 'Change that copy');
  assert.equal(mergeDictationTranscript('', 'one two three', 0, 0, 7), 'one two');
});

test('parses only local mode or sufficiently strong shared tokens', () => {
  assert.deepEqual(parseReviewSession('local'), { mode: 'local', id: 'local' });
  assert.equal(parseReviewSession('short'), null);
  assert.equal(parseReviewSession('off'), null);
  assert.equal(parseReviewSession('550e8400-e29b-41d4-a716-446655440000').mode, 'shared');
});

test('uses a first-name initial and stable per-name color', () => {
  assert.equal(authorPresentation(' Sarah Jones ').initial, 'S');
  assert.deepEqual(authorPresentation('Sarah Jones'), authorPresentation(' Sarah Jones '));
  assert.notEqual(authorPresentation('Sarah').color, authorPresentation('Sessi').color);
});

test('keeps review token out of history-router scope', () => {
  const url = 'https://example.com/billing?scene=warning&review=550e8400-e29b-41d4-a716-446655440000';
  assert.equal(routeScopeFromUrl(url), '/billing?scene=warning');
  assert.equal(reviewValueFromUrl(url), '550e8400-e29b-41d4-a716-446655440000');
});

test('supports hash-router review parameters', () => {
  const input = 'https://example.com/app#/billing?scene=warning';
  const output = withReviewParam(input, '550e8400-e29b-41d4-a716-446655440000', { router: 'hash' });
  assert.equal(
    output,
    'https://example.com/app#/billing?scene=warning&review=550e8400-e29b-41d4-a716-446655440000'
  );
  assert.equal(
    routeScopeFromUrl(output, { router: 'hash' }),
    '/billing?scene=warning'
  );
});
