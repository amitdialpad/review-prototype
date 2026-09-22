import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anchoredGeometry,
  authorPresentation,
  commentComposerState,
  isGoogleChrome,
  mergeDictationTranscript,
  parseReviewSession,
  preferredSpeechLanguage,
  reviewValueFromUrl,
  routeScopeFromUrl,
  speechContextPhrases,
  withReviewParam,
} from '../src/review-prototype.js';

test('keeps an anchored comment attached when its element scrolls', () => {
  const anchor = {
    path: 'section:nth-of-type(1)',
    offsetX: 0.75,
    offsetY: 0.25,
    selection: { x: 0.1, y: 0.2, width: 0.6, height: 0.4 },
  };
  const surface = { left: 0, top: 0 };
  const before = anchoredGeometry(anchor, { left: 100, top: 300, width: 200, height: 100 }, surface);
  const after = anchoredGeometry(anchor, { left: 100, top: 180, width: 200, height: 100 }, surface);

  assert.deepEqual(before, {
    x: 250,
    y: 325,
    selection: { x: 120, y: 320, width: 120, height: 40 },
  });
  assert.equal(after.x, before.x);
  assert.equal(after.y, before.y - 120);
  assert.equal(after.selection.y, before.selection.y - 120);
});

test('uses a regional browser language instead of a generic document language', () => {
  assert.equal(
    preferredSpeechLanguage({ browserLanguages: ['en'], resolvedLocale: 'en-IN', documentLanguage: 'en' }),
    'en-IN'
  );
  assert.equal(preferredSpeechLanguage({ configured: 'en-GB', browserLanguages: ['en-IN'] }), 'en-GB');
});

test('enables voice only for Google Chrome and keeps Safari on the typing fallback', () => {
  assert.equal(
    isGoogleChrome({ userAgent: 'Mozilla/5.0 Version/18.0 Safari/605.1.15', userAgentData: { brands: [] } }),
    false
  );
  assert.equal(
    isGoogleChrome({ userAgent: 'Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36', userAgentData: { brands: [] } }),
    true
  );
  assert.equal(
    isGoogleChrome({ userAgent: 'Mozilla/5.0 Edg/142.0.0.0 Chrome/142.0.0.0', userAgentData: { brands: [] } }),
    false
  );
  assert.deepEqual(commentComposerState({ voiceSupported: false, hasText: false }), {
    showAdd: false,
    showVoiceControls: false,
    showVoiceHint: false,
    voiceLabel: 'Start talking',
    placeholder: 'Leave a comment',
  });
  assert.equal(commentComposerState({ voiceSupported: false, hasText: true }).showAdd, true);
});

test('deduplicates and bounds contextual speech phrases', () => {
  assert.deepEqual(speechContextPhrases(['Dialpad', ' dialpad ', 'AI Receptionist'], 2), [
    'Dialpad',
    'AI Receptionist',
  ]);
});

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
