import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anchoredGeometry,
  authorPresentation,
  commentComposerState,
  commentIsDone,
  formatCommentTimestamp,
  isGoogleChrome,
  isolateReviewUiEvent,
  isTextEditIntent,
  mergeDictationTranscript,
  newestCommentsFirst,
  normalizeReviewScope,
  parseReviewSession,
  preferredSpeechLanguage,
  reviewValueFromUrl,
  routeScopeFromUrl,
  sharedCommentStatusEndpoint,
  speechContextPhrases,
  completedVoiceStatus,
  voiceErrorMessage,
  withReviewParam,
} from '../src/review-prototype.js';

test('lets text editing take control from automatic dictation without treating navigation as typing', () => {
  assert.equal(isTextEditIntent({ type: 'keydown', key: 'a' }), true);
  assert.equal(isTextEditIntent({ type: 'keydown', key: 'Backspace' }), true);
  assert.equal(isTextEditIntent({ type: 'keydown', key: 'Enter', shiftKey: true }), true);
  assert.equal(isTextEditIntent({ type: 'paste' }), true);
  assert.equal(isTextEditIntent({ type: 'cut' }), true);
  assert.equal(isTextEditIntent({ type: 'drop' }), true);
  assert.equal(isTextEditIntent({ type: 'compositionstart' }), true);
  assert.equal(isTextEditIntent({ type: 'keydown', key: 'Process', keyCode: 229 }), true);
  assert.equal(isTextEditIntent({ type: 'keydown', key: 'ArrowLeft' }), false);
  assert.equal(isTextEditIntent({ type: 'keydown', key: 'Tab' }), false);
  assert.equal(isTextEditIntent({ type: 'keydown', key: 'a', metaKey: true }), false);
  assert.equal(isTextEditIntent({ type: 'keydown', key: 'a', defaultPrevented: true }), false);
});

test('contains review controls so they cannot trigger host-page interactions', () => {
  let prevented = 0;
  let stopped = 0;
  isolateReviewUiEvent(
    {
      cancelable: true,
      preventDefault: () => { prevented += 1; },
      stopPropagation: () => { stopped += 1; },
    },
    { preventDefault: true }
  );

  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
});

test('uses the canonical Netlify Function endpoint for shared Done updates', () => {
  assert.equal(
    sharedCommentStatusEndpoint(
      'https://comments.example/',
      'billing prototype',
      'review-session-token-123456',
      'comment-id-123456789012345'
    ),
    'https://comments.example/.netlify/functions/review-comments?projectId=billing+prototype&sessionId=review-session-token-123456&commentId=comment-id-123456789012345'
  );
});

test('treats hosted Done state as inbox history rather than active feedback', () => {
  assert.equal(commentIsDone({ status: 'done' }), true);
  assert.equal(commentIsDone({ resolvedAt: '2026-09-26T00:00:00Z' }), true);
  assert.equal(commentIsDone({ status: 'open' }), false);
  assert.equal(commentIsDone({ status: 'open', resolvedAt: '2026-09-26T00:00:00Z' }), false);
  assert.equal(commentIsDone({}), false);
});

test('shows newest comments first without mutating storage order', () => {
  const comments = [
    { id: 'older', createdAt: '2026-09-25T10:00:00Z' },
    { id: 'newest', createdAt: '2026-09-26T10:00:00Z' },
    { id: 'middle', createdAt: '2026-09-26T09:00:00Z' },
  ];

  assert.deepEqual(newestCommentsFirst(comments).map(comment => comment.id), ['newest', 'middle', 'older']);
  assert.deepEqual(comments.map(comment => comment.id), ['older', 'newest', 'middle']);
});

test('formats a compact comment timestamp', () => {
  assert.equal(
    formatCommentTimestamp('2026-09-26T09:47:00Z', { locale: 'en-US', timeZone: 'UTC' }),
    'Sep 26, 9:47 AM'
  );
  assert.equal(formatCommentTimestamp('not-a-date'), '');
});

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
    placeholder: 'Type your feedback',
  });
  assert.equal(commentComposerState({ voiceSupported: false, hasText: true }).showAdd, true);
  assert.deepEqual(commentComposerState({ voiceSupported: true, hasText: false }), {
    showAdd: false,
    showVoiceControls: true,
    placeholder: 'Speak or type your feedback',
  });
  assert.equal(commentComposerState({ voiceSupported: true, hasText: true, listening: true }).showAdd, false);
});

test('keeps deliberate finish and cancel actions silent while preserving real voice errors', () => {
  assert.equal(voiceErrorMessage('audio-capture', { manualStop: true }), '');
  assert.equal(voiceErrorMessage('network', { cancelled: true }), '');
  assert.equal(completedVoiceStatus({ manualStop: true, error: 'Voice input stopped. You can keep typing.' }), '');
  assert.equal(completedVoiceStatus({ cancelled: true }), '');
  assert.equal(
    voiceErrorMessage('not-allowed'),
    'Microphone access was blocked. You can keep typing.'
  );
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

test('normalizes legacy comment scopes using ignored non-product query parameters', () => {
  const config = { ignoreQuery: ['build'] };
  assert.equal(
    normalizeReviewScope('/billing?build=old-build&scene=warning', config),
    '/billing?scene=warning'
  );
  assert.equal(
    normalizeReviewScope('/billing?scene=warning&build=new-build::review-context=modal%20dialog', config),
    '/billing?scene=warning::review-context=modal%20dialog'
  );
  assert.equal(
    normalizeReviewScope('/billing?build=old-build&scene=warning', { ...config, router: 'hash' }),
    '/billing?scene=warning'
  );
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
