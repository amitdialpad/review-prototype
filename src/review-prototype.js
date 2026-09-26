const SESSION_PATTERN = /^[a-zA-Z0-9_-]{20,128}$/;
const CONTEXT_SEPARATOR = '::review-context=';
const DRAG_THRESHOLD = 5;
const VOICE_FINISH_GRACE_MS = 800;
const AUTHOR_COLORS = ['#0e7490', '#0369a1', '#15803d', '#be123c', '#c2410c', '#0f766e', '#1d4ed8', '#b45309'];

const ICONS = {
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5zM8 8h8M8 12h8M8 16h5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5 14.5 9M7 16.5H5.5a4 4 0 0 1 0-8H9m6 0h3.5a4 4 0 0 1 0 8H15"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>',
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashName(value) {
  let hash = 0;
  for (const character of value.trim().toLocaleLowerCase()) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash;
}

export function authorPresentation(authorName) {
  const normalized = String(authorName || '').trim() || 'Guest';
  const firstName = normalized.split(/\s+/)[0];
  return {
    initial: (Array.from(firstName)[0] || '?').toLocaleUpperCase(),
    color: AUTHOR_COLORS[hashName(normalized) % AUTHOR_COLORS.length],
  };
}

export function parseReviewSession(value) {
  if (value === 'local' || value === 'true') return { mode: 'local', id: 'local' };
  if (typeof value === 'string' && SESSION_PATTERN.test(value)) return { mode: 'shared', id: value };
  return null;
}

export function createReviewSessionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function mergeDictationTranscript(value, transcript, selectionStart, selectionEnd, maxLength = 4000) {
  const source = String(value || '');
  const spoken = String(transcript || '').trim();
  if (!spoken) return source;
  const start = clamp(Number.isInteger(selectionStart) ? selectionStart : source.length, 0, source.length);
  const end = clamp(Number.isInteger(selectionEnd) ? selectionEnd : start, start, source.length);
  const before = source.slice(0, start);
  const after = source.slice(end);
  const leadingSpace = before && !/\s$/.test(before) && !/^[,.;:!?)}\]]/.test(spoken) ? ' ' : '';
  const trailingSpace = after && !/^\s/.test(after) && !/^[,.;:!?)}\]]/.test(after) ? ' ' : '';
  return `${before}${leadingSpace}${spoken}${trailingSpace}${after}`.slice(0, maxLength);
}

export function preferredSpeechLanguage({
  configured = '',
  browserLanguages = [],
  resolvedLocale = '',
  documentLanguage = '',
} = {}) {
  if (configured.trim()) return configured.trim();
  const languages = browserLanguages.filter(Boolean);
  const primary = languages[0] || '';
  if (primary.includes('-')) return primary;
  const matchingRegionalLanguage = languages.find(language => language.startsWith(`${primary}-`));
  if (matchingRegionalLanguage) return matchingRegionalLanguage;
  if (resolvedLocale && (!primary || resolvedLocale.split('-')[0] === primary)) return resolvedLocale;
  return primary || documentLanguage || 'en-US';
}

export function speechContextPhrases(values, maximum = 20) {
  const phrases = [];
  for (const value of values) {
    const phrase = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!phrase || phrases.some(existing => existing.toLocaleLowerCase() === phrase.toLocaleLowerCase())) continue;
    phrases.push(phrase);
    if (phrases.length >= maximum) break;
  }
  return phrases;
}

export function isGoogleChrome(browserNavigator = {}) {
  const brands = browserNavigator.userAgentData?.brands || [];
  if (brands.some(brand => brand.brand === 'Google Chrome')) return true;
  const userAgent = browserNavigator.userAgent || '';
  return /(?:Chrome|CriOS)\//.test(userAgent) && !/(?:Edg|OPR|SamsungBrowser)\//.test(userAgent);
}

export function commentComposerState({ hasText = false, listening = false, voiceSupported = false } = {}) {
  return {
    showAdd: hasText && !listening,
    showVoiceControls: voiceSupported,
    placeholder: voiceSupported ? 'Speak or type your feedback' : 'Type your feedback',
  };
}

export function isTextEditIntent(event = {}) {
  if (event.defaultPrevented) return false;
  if (['beforeinput', 'paste', 'cut', 'drop', 'compositionstart'].includes(event.type)) return true;
  if (event.type !== 'keydown') return false;
  if (event.key === 'Backspace' || event.key === 'Delete') return true;
  if (event.key === 'Enter') return Boolean(event.shiftKey);
  if (event.key === 'Process' || event.keyCode === 229) return true;
  return typeof event.key === 'string' && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function commentIsDone(comment) {
  if (comment?.status === 'done') return true;
  if (comment?.status === 'open') return false;
  return Boolean(comment?.resolvedAt);
}

export function newestCommentsFirst(comments = []) {
  return [...comments].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt || '') || 0;
    const rightTime = Date.parse(right?.createdAt || '') || 0;
    return rightTime - leftTime;
  });
}

export function formatCommentTimestamp(value, { locale, timeZone } = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function isolateReviewUiEvent(event, { preventDefault = false } = {}) {
  if (preventDefault && event?.cancelable) event.preventDefault?.();
  event?.stopPropagation?.();
}

export function sharedCommentStatusEndpoint(apiUrl, projectId, sessionId, commentId) {
  const base = String(apiUrl || '').replace(/\/$/, '');
  const query = new URLSearchParams({ projectId, sessionId, commentId });
  return `${base}/.netlify/functions/review-comments?${query}`;
}

export function voiceErrorMessage(error, { cancelled = false, manualStop = false } = {}) {
  if (cancelled || manualStop || error === 'aborted' || error === 'no-speech') return '';
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Microphone access was blocked. You can keep typing.';
  }
  if (error === 'audio-capture') return 'Chrome could not find a microphone. You can keep typing.';
  return 'Voice input stopped. You can keep typing.';
}

export function completedVoiceStatus({ error = '', cancelled = false, manualStop = false } = {}) {
  return cancelled || manualStop ? '' : error;
}

function hashRoute(url) {
  const raw = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const route = raw.startsWith('/') ? raw : `/${raw}`;
  return new URL(route || '/', url.origin);
}

function sortedSearch(parameters, excluded) {
  const entries = [...parameters.entries()]
    .filter(([key]) => !excluded.has(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    );
  const search = new URLSearchParams(entries).toString();
  return search ? `?${search}` : '';
}

export function reviewValueFromUrl(input, { router = 'history', reviewParam = 'review' } = {}) {
  const url = new URL(input, globalThis.location?.origin || 'https://example.invalid');
  const route = router === 'hash' ? hashRoute(url) : url;
  return route.searchParams.get(reviewParam);
}

export function withReviewParam(input, value, { router = 'history', reviewParam = 'review' } = {}) {
  const url = new URL(input, globalThis.location?.origin || 'https://example.invalid');
  if (router === 'hash') {
    const route = hashRoute(url);
    route.searchParams.set(reviewParam, value);
    url.hash = `#${route.pathname}${route.search}`;
  } else {
    url.searchParams.set(reviewParam, value);
  }
  return url.toString();
}

export function routeScopeFromUrl(input, { router = 'history', reviewParam = 'review', ignoreQuery = [] } = {}) {
  const url = new URL(input, globalThis.location?.origin || 'https://example.invalid');
  const route = router === 'hash' ? hashRoute(url) : url;
  const excluded = new Set([reviewParam, ...ignoreQuery]);
  return `${route.pathname || '/'}${sortedSearch(route.searchParams, excluded)}`;
}

export function normalizeReviewScope(scope, config = {}) {
  const { route, contextId } = splitScope(String(scope || '/'));
  const normalizedRoute = routeScopeFromUrl(route, { ...config, router: 'history' });
  return contextId ? `${normalizedRoute}${CONTEXT_SEPARATOR}${encodeURIComponent(contextId)}` : normalizedRoute;
}

function splitScope(scope) {
  const index = scope.indexOf(CONTEXT_SEPARATOR);
  if (index < 0) return { route: scope, contextId: null };
  return {
    route: scope.slice(0, index),
    contextId: decodeURIComponent(scope.slice(index + CONTEXT_SEPARATOR.length)),
  };
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function elementLabel(element) {
  if (!element) return 'Page';
  const explicit = [
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('placeholder'),
  ]
    .find(value => value?.trim())
    ?.trim();
  if (explicit) return explicit.slice(0, 120);
  const text = (element.innerText || element.textContent)?.replace(/\s+/g, ' ').trim();
  return text && text.length <= 120 ? text : element.tagName.toLocaleLowerCase();
}

function elementPath(root, target) {
  if (!root || !target || !root.contains(target)) return null;
  if (root === target) return '$';
  const segments = [];
  let element = target;
  while (element && element !== root && segments.length < 32) {
    const parent = element.parentElement;
    if (!parent) return null;
    const siblings = [...parent.children].filter(sibling => sibling.tagName === element.tagName);
    const index = siblings.indexOf(element);
    if (index < 0) return null;
    segments.unshift(`${element.tagName.toLocaleLowerCase()}:nth-of-type(${index + 1})`);
    element = parent;
  }
  return element === root ? segments.join('>') : null;
}

function sharedAnchorElement(root, start, end) {
  if (!start || !root.contains(start)) return root;
  if (!end || !root.contains(end)) return start;
  const endAncestors = new Set();
  for (let element = end; element; element = element.parentElement) {
    endAncestors.add(element);
    if (element === root) break;
  }
  for (let element = start; element; element = element.parentElement) {
    if (endAncestors.has(element)) return element;
    if (element === root) break;
  }
  return root;
}

function relativeRect(rect, targetBounds) {
  return {
    x: clamp((rect.left - targetBounds.left) / targetBounds.width, 0, 1),
    y: clamp((rect.top - targetBounds.top) / targetBounds.height, 0, 1),
    width: clamp(rect.width / targetBounds.width, 0, 1),
    height: clamp(rect.height / targetBounds.height, 0, 1),
  };
}

export function anchoredGeometry(anchor, targetBounds, surfaceBounds) {
  if (!anchor || !targetBounds?.width || !targetBounds?.height) return null;
  const x = targetBounds.left - surfaceBounds.left + anchor.offsetX * targetBounds.width;
  const y = targetBounds.top - surfaceBounds.top + anchor.offsetY * targetBounds.height;
  const selection = anchor.selection
    ? {
        x: targetBounds.left - surfaceBounds.left + anchor.selection.x * targetBounds.width,
        y: targetBounds.top - surfaceBounds.top + anchor.selection.y * targetBounds.height,
        width: anchor.selection.width * targetBounds.width,
        height: anchor.selection.height * targetBounds.height,
      }
    : null;
  return { x, y, selection };
}

function button(className, label, icon) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.setAttribute('aria-label', label);
  element.title = label;
  element.innerHTML = icon;
  return element;
}

function storageJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

class ReviewPrototypeWidget {
  constructor(configuration) {
    this.config = {
      projectId: '',
      apiUrl: '',
      router: 'history',
      reviewParam: 'review',
      pollInterval: 5000,
      ignoreQuery: [],
      voiceInput: false,
      voicePhrases: [],
      contextSelector: '[data-review-context], dialog[open], [role="dialog"][aria-modal="true"]',
      ...configuration,
    };
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(this.config.projectId)) {
      throw new Error('ReviewPrototype requires a projectId using letters, numbers, dots, underscores, or hyphens.');
    }
    if (!['history', 'hash'].includes(this.config.router)) throw new Error('router must be history or hash');

    this.session = parseReviewSession(
      reviewValueFromUrl(window.location.href, {
        router: this.config.router,
        reviewParam: this.config.reviewParam,
      })
    );
    this.comments = [];
    this.resolved = new Set();
    this.legacyResolved = new Set();
    this.authorName = '';
    this.commentMode = false;
    this.panelOpen = false;
    this.selectedComment = null;
    this.draft = null;
    this.pointerStart = null;
    this.surface = { element: null, contextId: null, left: 0, top: 0, width: 1, height: 1 };
    this.lastScope = '';
    this.pollTimer = null;
    this.frame = null;
    this.originalHistory = null;
    this.dictation = null;
    this.composerDraft = null;
    this.composerResizeObserver = null;
  }

  start() {
    if (!this.session) return this;
    this.authorName = localStorage.getItem(this.authorKey()) || '';
    const storedResolved = new Set(storageJson(this.resolvedKey(), []));
    if (this.session.mode === 'local') this.resolved = storedResolved;
    else this.legacyResolved = storedResolved;
    this.ensureStyles();
    this.buildUi();
    this.installNavigationPersistence();
    this.installObservers();
    this.syncSurface();
    void this.loadComments();
    if (this.session.mode === 'shared') {
      this.pollTimer = window.setInterval(() => void this.loadComments({ quiet: true }), this.config.pollInterval);
    }
    return this;
  }

  destroy() {
    this.cancelDictation({ restore: false });
    this.composerResizeObserver?.disconnect();
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    window.removeEventListener('resize', this.onSurfaceChange);
    document.removeEventListener('scroll', this.onSurfaceChange, true);
    window.removeEventListener('popstate', this.onRouteChange);
    window.removeEventListener('hashchange', this.onRouteChange);
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('click', this.onDocumentClick, true);
    if (this.originalHistory) {
      history.pushState = this.originalHistory.pushState;
      history.replaceState = this.originalHistory.replaceState;
    }
    this.root?.remove();
  }

  authorKey() {
    return `review-prototype:author:v1:${this.config.projectId}`;
  }

  commentsKey() {
    return `review-prototype:comments:v1:${this.config.projectId}:${this.session.id}`;
  }

  resolvedKey() {
    return `review-prototype:resolved:v1:${this.config.projectId}:${this.session.id}`;
  }

  pendingKey() {
    return `review-prototype:pending:v1:${this.config.projectId}:${this.session.id}`;
  }

  ensureStyles() {
    if (this.config.cssUrl === false || document.querySelector('link[data-review-prototype-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.reviewPrototypeStyles = 'true';
    link.href = this.config.cssUrl || new URL('./review-prototype.css', import.meta.url).href;
    document.head.append(link);
  }

  buildUi() {
    this.root = document.createElement('div');
    this.root.className = 'rp-root rp-ui';
    this.root.dataset.reviewPrototypeUi = 'true';
    const containedEvents = [
      'click',
      'dblclick',
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'touchstart',
      'touchend',
    ];
    for (const eventName of containedEvents) {
      this.root.addEventListener(eventName, event => isolateReviewUiEvent(event));
    }

    this.capture = document.createElement('div');
    this.capture.className = 'rp-capture';
    this.capture.addEventListener('pointerdown', event => this.pointerDown(event));
    this.capture.addEventListener('pointermove', event => this.pointerMove(event));
    this.capture.addEventListener('pointerup', event => this.pointerUp(event));
    this.capture.addEventListener('pointercancel', () => this.cancelPointer());

    this.annotations = document.createElement('div');
    this.annotations.className = 'rp-annotations';

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'rp-toolbar';
    this.commentButton = button('rp-icon-button', 'Add comment (C)', ICONS.comment);
    this.inboxButton = button('rp-icon-button rp-inbox-button', 'See all comments', ICONS.inbox);
    this.count = document.createElement('span');
    this.count.className = 'rp-count';
    this.inboxButton.append(this.count);
    this.shareButton = button('rp-icon-button', 'Copy review link', ICONS.link);
    this.commentButton.addEventListener('click', () => this.toggleCommentMode());
    this.inboxButton.addEventListener('click', () => this.togglePanel());
    this.shareButton.addEventListener('click', () => void this.share());
    this.toolbar.append(this.commentButton, this.inboxButton, this.shareButton);

    this.panel = document.createElement('section');
    this.panel.className = 'rp-panel';
    this.panel.setAttribute('aria-label', 'Review comments');

    this.root.append(this.capture, this.annotations, this.toolbar, this.panel);
    document.body.append(this.root);
    this.render();
  }

  installObservers() {
    this.onSurfaceChange = () => this.scheduleSurfaceSync();
    this.onRouteChange = () => {
      this.restoreReviewParameter();
      this.scheduleSurfaceSync();
      void this.loadComments({ quiet: true });
    };
    this.onKeydown = event => this.keydown(event);
    this.observer = new MutationObserver(mutations => {
      const onlyWidgetChanges = mutations.every(
        mutation => mutation.target instanceof Element && Boolean(mutation.target.closest('[data-review-prototype-ui]'))
      );
      if (!onlyWidgetChanges) this.scheduleSurfaceSync();
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'aria-modal', 'data-review-context'],
    });
    window.addEventListener('resize', this.onSurfaceChange);
    document.addEventListener('scroll', this.onSurfaceChange, true);
    window.addEventListener('popstate', this.onRouteChange);
    window.addEventListener('hashchange', this.onRouteChange);
    document.addEventListener('keydown', this.onKeydown);
  }

  installNavigationPersistence() {
    this.originalHistory = { pushState: history.pushState, replaceState: history.replaceState };
    for (const method of ['pushState', 'replaceState']) {
      const original = this.originalHistory[method];
      history[method] = (state, unused, url) => {
        const next = url == null ? url : this.reviewUrl(new URL(String(url), window.location.href).href);
        const result = original.call(history, state, unused, next);
        queueMicrotask(() => this.onRouteChange());
        return result;
      };
    }
    this.onDocumentClick = event => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      anchor.href = this.reviewUrl(target.href);
    };
    document.addEventListener('click', this.onDocumentClick, true);
  }

  restoreReviewParameter() {
    const current = reviewValueFromUrl(window.location.href, this.config);
    if (current === this.session.id || (this.session.mode === 'local' && current === 'true')) return;
    this.originalHistory.replaceState.call(history, history.state, '', this.reviewUrl(window.location.href));
  }

  reviewUrl(input) {
    return withReviewParam(input, this.session.id, this.config);
  }

  scheduleSurfaceSync() {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      this.syncSurface();
    });
  }

  activeContext() {
    if (typeof this.config.getContext === 'function') return this.config.getContext();
    const candidates = [...document.querySelectorAll(this.config.contextSelector)].filter(
      element => element instanceof HTMLElement && !element.closest('[data-review-prototype-ui]') && isVisible(element)
    );
    return candidates.at(-1) || null;
  }

  syncSurface() {
    const context = this.activeContext();
    const element = context?.element instanceof HTMLElement ? context.element : context;
    const contextId =
      context?.id || element?.dataset.reviewContext || element?.getAttribute('aria-label') || element?.id || null;
    const bounds = element?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
    this.surface = {
      element: element || null,
      contextId: contextId ? String(contextId).slice(0, 160) : null,
      left: bounds.left,
      top: bounds.top,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    };
    const portal = element?.closest('dialog[open]') || document.body;
    if (this.root.parentElement !== portal) portal.append(this.root);
    Object.assign(this.root.style, {
      left: `${this.surface.left}px`,
      top: `${this.surface.top}px`,
      width: `${this.surface.width}px`,
      height: `${this.surface.height}px`,
    });
    const scope = this.currentScope();
    if (scope !== this.lastScope) {
      this.lastScope = scope;
      this.draft = null;
      this.selectedComment = null;
      this.commentMode = false;
    }
    this.render();
  }

  currentScope() {
    if (typeof this.config.getScope === 'function') return String(this.config.getScope());
    const route = routeScopeFromUrl(window.location.href, this.config);
    return this.surface.contextId ? `${route}${CONTEXT_SEPARATOR}${encodeURIComponent(this.surface.contextId)}` : route;
  }

  scopeMatches(scope, currentScope = this.currentScope()) {
    if (typeof this.config.getScope === 'function') return scope === currentScope;
    return normalizeReviewScope(scope, this.config) === normalizeReviewScope(currentScope, this.config);
  }

  localPoint(event) {
    return {
      x: clamp(event.clientX - this.surface.left, 0, this.surface.width),
      y: clamp(event.clientY - this.surface.top, 0, this.surface.height),
    };
  }

  underlyingElement(event) {
    return (
      document
        .elementsFromPoint(event.clientX, event.clientY)
        .find(element => element instanceof HTMLElement && !element.closest('[data-review-prototype-ui]')) || null
    );
  }

  anchorRoot() {
    return this.surface.element || document.body;
  }

  buildAnchor(startElement, endElement, point, selection) {
    const root = this.anchorRoot();
    const target = selection ? sharedAnchorElement(root, startElement, endElement) : startElement;
    const path = elementPath(root, target);
    if (!target || !path) return null;
    const targetBounds = target.getBoundingClientRect();
    if (!targetBounds.width || !targetBounds.height) return null;
    const clientX = this.surface.left + point.x;
    const clientY = this.surface.top + point.y;
    const selectionBounds = selection
      ? {
          left: this.surface.left + selection.x,
          top: this.surface.top + selection.y,
          width: selection.width,
          height: selection.height,
        }
      : null;
    return {
      path,
      offsetX: clamp((clientX - targetBounds.left) / targetBounds.width, 0, 1),
      offsetY: clamp((clientY - targetBounds.top) / targetBounds.height, 0, 1),
      selection: selectionBounds ? relativeRect(selectionBounds, targetBounds) : null,
    };
  }

  anchoredElement(anchor) {
    if (!anchor?.path) return null;
    const root = this.anchorRoot();
    if (anchor.path === '$') return root;
    try {
      return root.querySelector(`:scope>${anchor.path}`);
    } catch {
      return null;
    }
  }

  commentGeometry(comment) {
    const target = this.anchoredElement(comment.anchor);
    const geometry = target?.isConnected
      ? anchoredGeometry(comment.anchor, target.getBoundingClientRect(), this.surface)
      : null;
    return (
      geometry || {
        x: comment.x * this.surface.width,
        y: comment.y * this.surface.height,
        selection: comment.selection
          ? {
              x: comment.selection.x * this.surface.width,
              y: comment.selection.y * this.surface.height,
              width: comment.selection.width * this.surface.width,
              height: comment.selection.height * this.surface.height,
            }
          : null,
      }
    );
  }

  draftGeometry() {
    if (!this.draft) return null;
    const target = this.anchoredElement(this.draft.anchor);
    return (
      (target?.isConnected
        ? anchoredGeometry(this.draft.anchor, target.getBoundingClientRect(), this.surface)
        : null) || { x: this.draft.x, y: this.draft.y, selection: this.draft.selection }
    );
  }

  scrollCommentIntoView(comment) {
    const target = this.anchoredElement(comment.anchor);
    if (!target?.isConnected || typeof target.scrollIntoView !== 'function') return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    this.scheduleSurfaceSync();
    return true;
  }

  pointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = this.localPoint(event);
    this.pointerStart = { ...point, pointerId: event.pointerId, element: this.underlyingElement(event) };
    this.capture.setPointerCapture(event.pointerId);
  }

  pointerMove(event) {
    const point = this.localPoint(event);
    if (this.pointerStart) {
      const rect = this.normalizedRect(this.pointerStart, point);
      this.drawDraftSelection(rect.width >= DRAG_THRESHOLD || rect.height >= DRAG_THRESHOLD ? rect : null);
      return;
    }
    const element = this.underlyingElement(event);
    if (!element) return this.drawHover(null);
    const bounds = element.getBoundingClientRect();
    this.drawHover({
      x: bounds.left - this.surface.left,
      y: bounds.top - this.surface.top,
      width: bounds.width,
      height: bounds.height,
    });
  }

  normalizedRect(start, end) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }

  pointerUp(event) {
    if (!this.pointerStart || this.pointerStart.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = this.localPoint(event);
    const rect = this.normalizedRect(this.pointerStart, point);
    const dragged = rect.width >= DRAG_THRESHOLD || rect.height >= DRAG_THRESHOLD;
    const selection = dragged ? rect : null;
    this.draft = {
      x: dragged ? rect.x + rect.width : point.x,
      y: dragged ? rect.y : point.y,
      selection,
      anchor: this.buildAnchor(
        this.pointerStart.element,
        this.underlyingElement(event),
        { x: dragged ? rect.x + rect.width : point.x, y: dragged ? rect.y : point.y },
        selection
      ),
      elementLabel: elementLabel(this.pointerStart.element),
    };
    this.pointerStart = null;
    this.commentMode = false;
    this.drawHover(null);
    this.drawDraftSelection(null);
    this.render();
  }

  cancelPointer() {
    this.pointerStart = null;
    this.drawDraftSelection(null);
  }

  drawRect(rect, className) {
    if (!rect) return null;
    const element = document.createElement('div');
    element.className = className;
    Object.assign(element.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    return element;
  }

  drawHover(rect) {
    this.hover?.remove();
    this.hover = rect ? this.drawRect(rect, 'rp-hover') : null;
    if (this.hover) this.capture.append(this.hover);
  }

  drawDraftSelection(rect) {
    this.draftSelection?.remove();
    this.draftSelection = rect ? this.drawRect(rect, 'rp-selection rp-selection-draft') : null;
    if (this.draftSelection) this.capture.append(this.draftSelection);
  }

  toggleCommentMode() {
    this.commentMode = !this.commentMode;
    this.panelOpen = false;
    this.selectedComment = null;
    this.draft = null;
    this.cancelPointer();
    this.render();
  }

  togglePanel() {
    this.panelOpen = !this.panelOpen;
    this.commentMode = false;
    this.selectedComment = null;
    this.draft = null;
    this.render();
    if (this.panelOpen) void this.loadComments({ quiet: true });
  }

  keydown(event) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key.toLocaleLowerCase() === 'c') {
      event.preventDefault();
      this.toggleCommentMode();
    } else if (event.key === 'Escape') {
      this.commentMode = false;
      this.panelOpen = false;
      this.selectedComment = null;
      this.draft = null;
      this.render();
    }
  }

  voiceRecognitionConstructor() {
    if (this.config.voiceInput !== 'chrome' || !isGoogleChrome(navigator)) return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  cancelDictation({ restore = true } = {}) {
    const session = this.dictation;
    if (!session) return;
    this.dictation = null;
    session.cancelled = true;
    if (session.restartTimer) window.clearTimeout(session.restartTimer);
    if (session.finishTimer) window.clearTimeout(session.finishTimer);
    session.recognition.onstart = null;
    session.recognition.onresult = null;
    session.recognition.onerror = null;
    session.recognition.onend = null;
    try {
      session.recognition.abort();
    } catch {
      // Chrome may already have ended the recognition session.
    }
    if (restore && session.textarea.isConnected) {
      session.textarea.value = session.originalValue;
      session.textarea.setSelectionRange(session.selectionStart, session.selectionEnd);
    }
    session.finish();
  }

  yieldDictationToTyping(event) {
    const session = this.dictation;
    if (!session || !isTextEditIntent(event)) return;
    const selectionStart = session.textarea.selectionStart;
    const selectionEnd = session.textarea.selectionEnd;
    this.cancelDictation({ restore: false });
    if (session.textarea.isConnected) {
      session.textarea.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  startDictation({ textarea, name, focusNameOnFinish, send, field, mic, wave, cancel, stop, status, syncActions }) {
    const Recognition = this.voiceRecognitionConstructor();
    if (!Recognition || this.dictation) return;
    const recognition = new Recognition();
    const originalValue = textarea.value;
    const selectionStart = originalValue.length;
    const selectionEnd = originalValue.length;
    const session = {
      recognition,
      textarea,
      originalValue,
      selectionStart,
      selectionEnd,
      cancelled: false,
      manualStop: false,
      restartTimer: null,
      finishTimer: null,
      committedTranscript: '',
      transcript: '',
      error: '',
      finish: () => {},
    };
    const setState = (state, message = '') => {
      const active = state === 'requesting' || state === 'listening' || state === 'stopping';
      field.classList.toggle('rp-listening', active);
      mic.hidden = active;
      wave.hidden = !active;
      cancel.hidden = !active;
      stop.hidden = !active;
      stop.disabled = state === 'stopping';
      textarea.readOnly = active;
      send.disabled = active;
      status.classList.toggle('rp-voice-error', state === 'error');
      status.textContent = message;
      syncActions();
      if (this.composer && this.draft) {
        const geometry = this.draftGeometry();
        this.placeFloating(this.composer, geometry.x, geometry.y);
      }
    };
    session.finish = () => {
      if (session.restartTimer) window.clearTimeout(session.restartTimer);
      if (session.finishTimer) window.clearTimeout(session.finishTimer);
      const completionMessage = completedVoiceStatus(session);
      setState(session.error ? 'error' : 'idle', completionMessage);
      textarea.readOnly = false;
      send.disabled = false;
      const insertedLength = Math.max(
        0,
        textarea.value.length - (originalValue.length - (selectionEnd - selectionStart))
      );
      const caret = Math.min(textarea.value.length, selectionStart + insertedLength);
      textarea.setSelectionRange(caret, caret);
      if (!session.error && session.transcript && focusNameOnFinish && name?.isConnected) name.focus();
      else textarea.focus();
    };
    this.dictation = session;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = preferredSpeechLanguage({
      configured: this.config.voiceLanguage,
      browserLanguages: navigator.languages?.length ? [...navigator.languages] : [navigator.language],
      resolvedLocale: Intl.DateTimeFormat().resolvedOptions().locale,
      documentLanguage: document.documentElement.lang,
    });
    const Phrase = window.SpeechRecognitionPhrase;
    if (Phrase && 'phrases' in recognition) {
      const routePhrase = window.location.pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ');
      const phrases = speechContextPhrases([
        ...(Array.isArray(this.config.voicePhrases) ? this.config.voicePhrases : []),
        this.draft?.elementLabel,
        routePhrase,
        document.title,
      ]);
      try {
        recognition.phrases = phrases.map(phrase => new Phrase(phrase, 4));
      } catch {
        // Contextual biasing is optional and must never block ordinary dictation.
      }
    }
    recognition.onstart = () => {
      if (this.dictation === session) {
        setState('listening', 'Listening…');
      }
    };
    recognition.onresult = event => {
      if (this.dictation !== session) return;
      const segments = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const text = event.results[index]?.[0]?.transcript?.trim();
        if (text) segments.push(text);
      }
      const cycleTranscript = segments.join(' ').replace(/\s+/g, ' ').trim();
      session.transcript = [session.committedTranscript, cycleTranscript].filter(Boolean).join(' ');
      textarea.value = mergeDictationTranscript(
        originalValue,
        session.transcript,
        selectionStart,
        selectionEnd,
        textarea.maxLength
      );
      const insertedLength = Math.max(
        0,
        textarea.value.length - (originalValue.length - (selectionEnd - selectionStart))
      );
      const caret = Math.min(textarea.value.length, selectionStart + insertedLength);
      textarea.setSelectionRange(caret, caret);
      textarea.scrollTop = textarea.scrollHeight;
      syncActions();
    };
    recognition.onerror = event => {
      if (this.dictation !== session) return;
      const message = voiceErrorMessage(event.error, session);
      if (!message) return;
      session.error = message;
      setState('error', session.error);
    };
    recognition.onend = () => {
      if (this.dictation !== session) return;
      if (!session.manualStop && !session.error) {
        session.committedTranscript = session.transcript;
        setState('requesting', 'Listening…');
        session.restartTimer = window.setTimeout(() => {
          session.restartTimer = null;
          if (this.dictation !== session || session.cancelled || session.manualStop) return;
          try {
            recognition.start();
          } catch {
            this.dictation = null;
            session.error = 'Voice input stopped. You can keep typing.';
            session.finish();
          }
        }, 150);
        return;
      }
      this.dictation = null;
      session.finish();
    };
    cancel.onclick = () => this.cancelDictation();
    stop.onclick = () => {
      if (this.dictation !== session) return;
      session.manualStop = true;
      if (session.restartTimer) {
        window.clearTimeout(session.restartTimer);
        session.restartTimer = null;
      }
      setState('stopping', 'Finishing your voice comment…');
      session.finishTimer = window.setTimeout(() => {
        session.finishTimer = null;
        if (this.dictation !== session) return;
        this.dictation = null;
        session.finish();
      }, VOICE_FINISH_GRACE_MS);
      try {
        recognition.stop();
      } catch {
        if (session.finishTimer) window.clearTimeout(session.finishTimer);
        session.finishTimer = null;
        this.dictation = null;
        session.finish();
      }
    };
    setState('requesting', 'Starting microphone…');
    try {
      recognition.start();
    } catch {
      this.dictation = null;
      session.error = 'Voice input could not start. You can keep typing.';
      session.finish();
    }
  }

  async loadComments({ quiet = false } = {}) {
    try {
      if (this.session.mode === 'local') {
        const stored = storageJson(this.commentsKey(), []);
        this.comments = Array.isArray(stored) ? stored : [];
      } else {
        if (!this.config.apiUrl) throw new Error('Shared review storage is not configured.');
        const response = await fetch(this.commentsEndpoint(), { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Review service returned ${response.status}`);
        const payload = await response.json();
        this.comments = Array.isArray(payload.comments) ? payload.comments : [];
        this.resolved = new Set(this.comments.filter(commentIsDone).map(comment => comment.id));
        await this.syncLegacyDoneComments();
      }
      this.serviceError = '';
      const pendingId = sessionStorage.getItem(this.pendingKey());
      const pending = this.comments.find(comment => comment.id === pendingId);
      if (pending && this.scopeMatches(pending.scope)) {
        this.selectedComment = pending;
        sessionStorage.removeItem(this.pendingKey());
        queueMicrotask(() => this.scrollCommentIntoView(pending));
      }
      this.render();
    } catch (error) {
      if (!quiet) this.serviceError = error instanceof Error ? error.message : 'Could not load comments.';
      this.render();
    }
  }

  commentsEndpoint() {
    const base = this.config.apiUrl.replace(/\/$/, '');
    return `${base}/v1/projects/${encodeURIComponent(this.config.projectId)}/sessions/${encodeURIComponent(this.session.id)}/comments`;
  }

  commentEndpoint(commentId) {
    return sharedCommentStatusEndpoint(this.config.apiUrl, this.config.projectId, this.session.id, commentId);
  }

  async updateSharedCommentStatus(commentId, status) {
    const response = await fetch(this.commentEndpoint(commentId), {
      method: 'PATCH',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Review service returned ${response.status}`);
    }
    return response.json();
  }

  async deleteComment(comment) {
    try {
      if (this.session.mode === 'local') {
        this.comments = this.comments.filter(item => item.id !== comment.id);
        this.resolved.delete(comment.id);
        localStorage.setItem(this.commentsKey(), JSON.stringify(this.comments));
        localStorage.setItem(this.resolvedKey(), JSON.stringify([...this.resolved]));
      } else {
        const response = await fetch(this.commentEndpoint(comment.id), { method: 'DELETE' });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || `Review service returned ${response.status}`);
        }
        this.comments = this.comments.filter(item => item.id !== comment.id);
        this.resolved.delete(comment.id);
        this.legacyResolved.delete(comment.id);
      }
      if (this.selectedComment?.id === comment.id) this.selectedComment = null;
      this.serviceError = '';
    } catch (error) {
      this.serviceError = error instanceof Error ? error.message : 'Could not delete this comment.';
    }
    this.render();
  }

  async syncLegacyDoneComments() {
    const pending = this.comments.filter(comment => this.legacyResolved.has(comment.id) && !commentIsDone(comment));
    if (!pending.length) {
      if (this.legacyResolved.size) localStorage.removeItem(this.resolvedKey());
      this.legacyResolved.clear();
      return;
    }
    const results = await Promise.allSettled(
      pending.map(comment => this.updateSharedCommentStatus(comment.id, 'done'))
    );
    let failed = false;
    results.forEach((result, index) => {
      const commentId = pending[index].id;
      if (result.status === 'fulfilled') {
        this.comments = this.comments.map(comment => (comment.id === commentId ? result.value : comment));
        this.resolved.add(commentId);
        this.legacyResolved.delete(commentId);
      } else {
        failed = true;
      }
    });
    if (this.legacyResolved.size) {
      localStorage.setItem(this.resolvedKey(), JSON.stringify([...this.legacyResolved]));
    } else {
      localStorage.removeItem(this.resolvedKey());
    }
    if (failed) throw new Error('Could not sync an older Done comment. Please mark it Done again.');
  }

  async createComment({ authorName, message }) {
    const name = authorName.trim();
    const text = message.trim();
    if (!name || !text) return;
    this.authorName = name;
    localStorage.setItem(this.authorKey(), name);
    const geometry = this.draftGeometry();
    const selection = geometry.selection
      ? {
          x: geometry.selection.x / this.surface.width,
          y: geometry.selection.y / this.surface.height,
          width: geometry.selection.width / this.surface.width,
          height: geometry.selection.height / this.surface.height,
        }
      : null;
    const draft = {
      scope: this.currentScope(),
      authorName: name,
      message: text,
      x: geometry.x / this.surface.width,
      y: geometry.y / this.surface.height,
      selection,
      anchor: this.draft.anchor || null,
      elementLabel: this.draft.elementLabel,
    };
    try {
      if (this.session.mode === 'local') {
        const comment = {
          ...draft,
          id: createReviewSessionId(),
          sessionId: this.session.id,
          projectId: this.config.projectId,
          createdAt: new Date().toISOString(),
        };
        this.comments = [...this.comments, comment];
        localStorage.setItem(this.commentsKey(), JSON.stringify(this.comments));
      } else {
        const response = await fetch(this.commentsEndpoint(), {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || `Review service returned ${response.status}`);
        }
        this.comments = [...this.comments, await response.json()];
      }
      this.draft = null;
      this.serviceError = '';
    } catch (error) {
      this.serviceError = error instanceof Error ? error.message : 'Could not add this comment.';
    }
    this.render();
  }

  async toggleDone(comment) {
    const wasDone = this.resolved.has(comment.id);
    const nextStatus = wasDone ? 'open' : 'done';
    try {
      if (this.session.mode === 'local') {
        if (wasDone) this.resolved.delete(comment.id);
        else this.resolved.add(comment.id);
        localStorage.setItem(this.resolvedKey(), JSON.stringify([...this.resolved]));
      } else {
        const updated = await this.updateSharedCommentStatus(comment.id, nextStatus);
        this.comments = this.comments.map(item => (item.id === comment.id ? updated : item));
        if (commentIsDone(updated)) this.resolved.add(comment.id);
        else this.resolved.delete(comment.id);
      }
      this.serviceError = '';
      this.selectedComment = null;
    } catch (error) {
      this.serviceError = error instanceof Error ? error.message : 'Could not mark this comment Done.';
    }
    this.render();
  }

  async share() {
    if (this.session.mode === 'local') {
      this.session = { mode: 'shared', id: createReviewSessionId() };
      this.resolved = new Set();
      this.comments = [];
      const url = this.reviewUrl(window.location.href);
      this.originalHistory.replaceState.call(history, history.state, '', url);
      if (this.pollTimer) window.clearInterval(this.pollTimer);
      this.pollTimer = window.setInterval(() => void this.loadComments({ quiet: true }), this.config.pollInterval);
      this.render();
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      this.shareButton.classList.add('rp-copied');
      this.shareButton.title = 'Link copied';
      window.setTimeout(() => {
        this.shareButton.classList.remove('rp-copied');
        this.shareButton.title = 'Copy review link';
      }, 1600);
    } catch {
      this.serviceError = 'Copy failed. Copy the current browser URL instead.';
      this.render();
    }
  }

  async openInboxComment(comment) {
    if (this.scopeMatches(comment.scope)) {
      this.panelOpen = false;
      this.selectedComment = comment;
      this.render();
      this.scrollCommentIntoView(comment);
      return;
    }
    sessionStorage.setItem(this.pendingKey(), comment.id);
    const normalizedScope =
      typeof this.config.getScope === 'function' ? comment.scope : normalizeReviewScope(comment.scope, this.config);
    const { route, contextId } = splitScope(normalizedScope);
    const target = this.urlForRoute(route);
    if (typeof this.config.navigate === 'function') {
      await this.config.navigate({ scope: normalizedScope, route, contextId, reviewUrl: target, comment });
      this.panelOpen = false;
      this.syncSurface();
      if (this.scopeMatches(comment.scope)) {
        this.selectedComment = comment;
        sessionStorage.removeItem(this.pendingKey());
        this.render();
        window.requestAnimationFrame(() => this.scrollCommentIntoView(comment));
      }
      return;
    }
    window.location.assign(target);
  }

  urlForRoute(route) {
    let target;
    if (this.config.router === 'hash') {
      const url = new URL(window.location.href);
      url.hash = `#${route.startsWith('/') ? route : `/${route}`}`;
      target = url.toString();
    } else {
      target = new URL(route, window.location.origin).toString();
    }
    return this.reviewUrl(target);
  }

  render() {
    if (!this.root) return;
    this.capture.classList.toggle('rp-capture-active', this.commentMode && !this.draft);
    this.commentButton.classList.toggle('rp-active', this.commentMode);
    this.inboxButton.classList.toggle('rp-active', this.panelOpen);
    this.count.textContent = this.comments.length ? String(this.comments.length) : '';
    this.count.hidden = !this.comments.length;
    this.renderAnnotations();
    this.renderPanel();
    this.renderComposer();
    this.renderCard();
  }

  renderAnnotations() {
    this.annotations.replaceChildren();
    const scope = this.currentScope();
    for (const comment of newestCommentsFirst(this.comments)) {
      if (!this.scopeMatches(comment.scope, scope) || this.resolved.has(comment.id)) continue;
      const geometry = this.commentGeometry(comment);
      if (geometry.selection) {
        const selection = this.drawRect(geometry.selection, 'rp-selection');
        this.annotations.append(selection);
      }
      const identity = authorPresentation(comment.authorName);
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'rp-marker';
      marker.textContent = identity.initial;
      marker.style.left = `${geometry.x}px`;
      marker.style.top = `${geometry.y}px`;
      marker.style.background = identity.color;
      marker.setAttribute('aria-label', `Open comment from ${comment.authorName}`);
      marker.addEventListener('click', () => {
        this.commentMode = false;
        this.panelOpen = false;
        this.selectedComment = comment;
        this.render();
      });
      this.annotations.append(marker);
    }
  }

  renderPanel() {
    this.panel.hidden = !this.panelOpen;
    if (!this.panelOpen) return;
    this.panel.replaceChildren();
    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = `Comments${this.comments.length ? ` · ${this.comments.length}` : ''}`;
    const close = button('rp-plain-icon', 'Close comments', ICONS.close);
    close.addEventListener('click', () => this.togglePanel());
    header.append(title, close);
    this.panel.append(header);
    if (this.serviceError) {
      const error = document.createElement('p');
      error.className = 'rp-error';
      error.textContent = this.serviceError;
      this.panel.append(error);
    }
    if (!this.comments.length) {
      const empty = document.createElement('p');
      empty.className = 'rp-empty';
      empty.textContent = 'No comments yet.';
      this.panel.append(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'rp-comment-list';
    for (const comment of newestCommentsFirst(this.comments)) {
      const row = document.createElement('div');
      row.className = 'rp-comment-row';
      const done = this.resolved.has(comment.id);
      row.classList.toggle('rp-comment-row-done', done);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'rp-comment-open';
      const identity = authorPresentation(comment.authorName);
      const avatar = document.createElement('span');
      avatar.className = 'rp-avatar';
      avatar.style.background = identity.color;
      avatar.textContent = identity.initial;
      const content = document.createElement('span');
      content.className = 'rp-comment-content';
      const meta = document.createElement('span');
      meta.className = 'rp-comment-meta';
      const name = document.createElement('strong');
      name.textContent = comment.authorName;
      const timestampText = formatCommentTimestamp(comment.createdAt);
      const timestamp = document.createElement('time');
      timestamp.className = 'rp-comment-timestamp';
      timestamp.dateTime = comment.createdAt || '';
      timestamp.textContent = timestampText;
      if (timestampText) timestamp.title = new Date(comment.createdAt).toLocaleString();
      meta.append(name);
      if (timestampText) meta.append(timestamp);
      const actions = document.createElement('span');
      actions.className = 'rp-comment-actions';
      const remove = button('rp-delete-comment', 'Delete comment', ICONS.trash);
      remove.addEventListener('click', event => {
        isolateReviewUiEvent(event, { preventDefault: true });
        if (!window.confirm('Delete this comment permanently?')) return;
        void this.deleteComment(comment);
      });
      actions.append(remove);
      if (done) {
        const status = document.createElement('span');
        status.className = 'rp-comment-status';
        status.innerHTML = ICONS.check;
        status.setAttribute('role', 'img');
        status.setAttribute('aria-label', 'Done');
        status.title = 'Done';
        actions.append(status);
      }
      const message = document.createElement('span');
      message.className = 'rp-comment-message';
      message.textContent = comment.message;
      content.append(meta, message);
      open.append(avatar, content);
      open.addEventListener('click', () => void this.openInboxComment(comment));
      row.append(open, actions);
      list.append(row);
    }
    this.panel.append(list);
  }

  renderComposer() {
    const draftGeometry = this.draftGeometry();
    if (this.composer && this.draft && this.composerDraft === this.draft) {
      this.placeFloating(this.composer, draftGeometry.x, draftGeometry.y);
      return;
    }
    this.cancelDictation({ restore: false });
    this.composerResizeObserver?.disconnect();
    this.composerResizeObserver = null;
    this.composer?.remove();
    this.composer = null;
    this.composerDraft = null;
    if (!this.draft) return;
    const form = document.createElement('form');
    form.className = 'rp-composer';
    const label = document.createElement('span');
    label.className = 'rp-context-label';
    label.textContent = this.draft.elementLabel;
    const header = document.createElement('header');
    header.className = 'rp-composer-header';
    const dismiss = button('rp-plain-icon', 'Cancel comment', ICONS.close);
    header.append(label, dismiss);
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 80;
    name.placeholder = 'Your name';
    name.autocomplete = 'name';
    name.value = this.session.mode === 'local' ? this.authorName || 'You' : this.authorName;
    name.setAttribute('aria-label', 'Your name');
    const needsName = this.session.mode === 'shared' && !this.authorName;
    const textarea = document.createElement('textarea');
    textarea.maxLength = 4000;
    textarea.rows = 3;
    const VoiceRecognition = this.voiceRecognitionConstructor();
    const voiceSupported = Boolean(VoiceRecognition);
    textarea.placeholder = commentComposerState({ voiceSupported }).placeholder;
    textarea.setAttribute('aria-label', 'Comment');
    const actions = document.createElement('div');
    actions.className = 'rp-actions';
    actions.hidden = true;
    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'rp-primary';
    send.textContent = 'Add';
    send.setAttribute('aria-label', 'Add comment');
    const commentField = document.createElement('div');
    commentField.className = 'rp-comment-field';
    const voiceControls = document.createElement('div');
    voiceControls.className = 'rp-voice-controls';
    const mic = button('rp-voice-button rp-voice-start', 'Add feedback by voice', ICONS.mic);
    const wave = document.createElement('span');
    wave.className = 'rp-voice-wave';
    wave.hidden = true;
    wave.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 4; index += 1) wave.append(document.createElement('span'));
    const cancelVoice = button('rp-voice-button', 'Cancel voice input', ICONS.close);
    cancelVoice.hidden = true;
    const stopVoice = button('rp-voice-button rp-voice-finish', 'Finish voice input', ICONS.check);
    stopVoice.hidden = true;
    const voiceStatus = document.createElement('span');
    voiceStatus.className = 'rp-voice-status';
    voiceStatus.setAttribute('role', 'status');
    voiceStatus.setAttribute('aria-live', 'polite');
    const syncComposerActions = () => {
      const hasText = Boolean(textarea.value.trim());
      const listening = commentField.classList.contains('rp-listening');
      const state = commentComposerState({ hasText, listening, voiceSupported });
      commentField.classList.toggle('rp-has-comment', hasText);
      actions.hidden = !state.showAdd;
      const micAction = hasText ? 'Add more feedback by voice' : 'Add feedback by voice';
      mic.setAttribute('aria-label', micAction);
      mic.title = micAction;
    };
    const startVoice = () =>
      this.startDictation({
        textarea,
        name,
        focusNameOnFinish: needsName,
        send,
        field: commentField,
        mic,
        wave,
        cancel: cancelVoice,
        stop: stopVoice,
        status: voiceStatus,
        syncActions: syncComposerActions,
      });
    if (voiceSupported) {
      mic.addEventListener('click', startVoice);
      voiceControls.append(mic, wave, voiceStatus, cancelVoice, stopVoice);
      commentField.classList.add('rp-has-voice');
    }
    commentField.append(textarea);
    dismiss.addEventListener('click', () => {
      this.cancelDictation({ restore: false });
      this.draft = null;
      this.render();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      void this.createComment({ authorName: name.value, message: textarea.value });
    });
    textarea.addEventListener('keydown', event => {
      this.yieldDictationToTyping(event);
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss.click();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    for (const eventName of ['beforeinput', 'paste', 'cut', 'drop', 'compositionstart']) {
      textarea.addEventListener(eventName, event => this.yieldDictationToTyping(event));
    }
    textarea.addEventListener('input', syncComposerActions);
    actions.append(send);
    form.append(header, commentField, voiceControls);
    if (needsName) form.append(name);
    form.append(actions);
    this.root.append(form);
    this.composer = form;
    this.composerDraft = this.draft;
    syncComposerActions();
    this.placeFloating(form, draftGeometry.x, draftGeometry.y);
    if (typeof ResizeObserver === 'function') {
      this.composerResizeObserver = new ResizeObserver(() => {
        if (this.composer === form && this.draft) {
          const geometry = this.draftGeometry();
          this.placeFloating(form, geometry.x, geometry.y);
        }
      });
      this.composerResizeObserver.observe(form);
    }
    if (voiceSupported && !textarea.value.trim()) startVoice();
    else textarea.focus();
  }

  renderCard() {
    const comment = this.selectedComment;
    if (!comment || !this.scopeMatches(comment.scope)) {
      this.card?.remove();
      this.card = null;
      this.cardAnchor?.remove();
      this.cardAnchor = null;
      return;
    }
    const point = this.commentGeometry(comment);
    const renderKey = `${comment.id}:${this.resolved.has(comment.id) ? 'done' : 'open'}`;
    if (this.card?.dataset.renderKey === renderKey && this.cardAnchor) {
      this.placeCommentCard(this.card, point.x, point.y);
      this.cardAnchor.style.left = `${point.x}px`;
      this.cardAnchor.style.top = `${point.y}px`;
      return;
    }
    this.card?.remove();
    this.cardAnchor?.remove();
    const card = document.createElement('article');
    card.className = 'rp-card';
    card.dataset.renderKey = renderKey;
    const header = document.createElement('header');
    const author = document.createElement('strong');
    author.textContent = comment.authorName;
    const controls = document.createElement('span');
    controls.className = 'rp-card-controls';
    const done = button(
      'rp-plain-icon',
      this.resolved.has(comment.id) ? 'Reopen comment' : 'Mark comment as done',
      ICONS.check
    );
    done.classList.toggle('rp-done-control', this.resolved.has(comment.id));
    done.addEventListener('click', event => {
      isolateReviewUiEvent(event, { preventDefault: true });
      void this.toggleDone(comment);
    });
    const close = button('rp-plain-icon', 'Close comment', ICONS.close);
    close.addEventListener('click', () => {
      this.selectedComment = null;
      this.render();
    });
    controls.append(done, close);
    header.append(author, controls);
    const context = document.createElement('span');
    context.className = 'rp-context-label';
    context.textContent = comment.elementLabel || 'Page';
    const message = document.createElement('p');
    message.textContent = comment.message;
    card.append(header, context, message);
    this.root.append(card);
    this.card = card;
    this.placeCommentCard(card, point.x, point.y);
    const anchor = document.createElement('span');
    anchor.className = 'rp-card-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.left = `${point.x}px`;
    anchor.style.top = `${point.y}px`;
    this.root.append(anchor);
    this.cardAnchor = anchor;
  }

  placeCommentCard(element, x, y) {
    const isLongComment = (element.querySelector('p')?.textContent.length || 0) > 240;
    const preferredWidth = isLongComment ? 380 : 320;
    const minimumWidth = isLongComment ? 280 : 240;
    const width = Math.min(preferredWidth, Math.max(minimumWidth, this.surface.width - 24));
    element.style.width = `${width}px`;
    const height = element.getBoundingClientRect().height || 180;
    const gap = 24;
    const maximumLeft = Math.max(12, this.surface.width - width - 12);
    const maximumTop = Math.max(12, this.surface.height - height - 12);
    const below = y + gap;
    const above = y - height - gap;
    let top;
    if (below <= maximumTop) top = below;
    else if (above >= 12) top = above;
    else top = y < this.surface.height / 2 ? maximumTop : 12;
    element.style.left = `${clamp(x - width / 2, 12, maximumLeft)}px`;
    element.style.top = `${clamp(top, 12, maximumTop)}px`;
  }

  placeFloating(element, x, y) {
    const width = Math.min(320, Math.max(240, this.surface.width - 24));
    element.style.width = `${width}px`;
    const height = element.getBoundingClientRect().height || 240;
    element.style.left = `${clamp(x + 12, 12, Math.max(12, this.surface.width - width - 12))}px`;
    element.style.top = `${clamp(y + 12, 12, Math.max(12, this.surface.height - height - 12))}px`;
  }
}

export const ReviewPrototype = {
  init(configuration) {
    return new ReviewPrototypeWidget(configuration).start();
  },
};

if (typeof window !== 'undefined') window.ReviewPrototype = ReviewPrototype;
