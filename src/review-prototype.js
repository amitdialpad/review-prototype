const SESSION_PATTERN = /^[a-zA-Z0-9_-]{20,128}$/;
const CONTEXT_SEPARATOR = '::review-context=';
const DRAG_THRESHOLD = 5;
const AUTHOR_COLORS = ['#5f3dc4', '#1864ab', '#2b8a3e', '#a61e4d', '#c2410c', '#087f5b', '#364fc7', '#862e9c'];

const ICONS = {
  comment:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"/></svg>',
  inbox:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5zM8 8h8M8 12h8M8 16h5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5 14.5 9M7 16.5H5.5a4 4 0 0 1 0-8H9m6 0h3.5a4 4 0 0 1 0 8H15"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
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
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
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

function isGoogleChrome() {
  const brands = navigator.userAgentData?.brands || [];
  if (brands.some(brand => brand.brand === 'Google Chrome')) return true;
  return /(?:Chrome|CriOS)\//.test(navigator.userAgent) && !/(?:Edg|OPR|SamsungBrowser)\//.test(navigator.userAgent);
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

export function routeScopeFromUrl(
  input,
  { router = 'history', reviewParam = 'review', ignoreQuery = [] } = {}
) {
  const url = new URL(input, globalThis.location?.origin || 'https://example.invalid');
  const route = router === 'hash' ? hashRoute(url) : url;
  const excluded = new Set([reviewParam, ...ignoreQuery]);
  return `${route.pathname || '/'}${sortedSearch(route.searchParams, excluded)}`;
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
  const explicit = [element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('placeholder')]
    .find(value => value?.trim())
    ?.trim();
  if (explicit) return explicit.slice(0, 120);
  const text = element.textContent?.replace(/\s+/g, ' ').trim();
  return text && text.length <= 120 ? text : element.tagName.toLocaleLowerCase();
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
    this.resolved = new Set(storageJson(this.resolvedKey(), []));
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
        mutation =>
          mutation.target instanceof Element && Boolean(mutation.target.closest('[data-review-prototype-ui]'))
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
    const contextId = context?.id || element?.dataset.reviewContext || element?.getAttribute('aria-label') || element?.id || null;
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
    this.draft = {
      x: dragged ? rect.x + rect.width : point.x,
      y: dragged ? rect.y : point.y,
      selection: dragged ? rect : null,
      elementLabel: elementLabel(this.pointerStart.element),
    };
    this.pointerStart = null;
    this.commentMode = false;
    this.drawHover(null);
    this.drawDraftSelection(null);
    this.render();
    queueMicrotask(() => this.composer?.querySelector('textarea')?.focus());
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
    if (this.config.voiceInput !== 'chrome' || !isGoogleChrome()) return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  cancelDictation({ restore = true } = {}) {
    const session = this.dictation;
    if (!session) return;
    this.dictation = null;
    session.cancelled = true;
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

  startDictation({ textarea, send, field, mic, wave, cancel, stop, status, syncActions }) {
    const Recognition = this.voiceRecognitionConstructor();
    if (!Recognition || this.dictation) return;
    const recognition = new Recognition();
    const originalValue = textarea.value;
    const selectionStart = textarea.selectionStart ?? originalValue.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const session = {
      recognition,
      textarea,
      originalValue,
      selectionStart,
      selectionEnd,
      cancelled: false,
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
      if (this.composer && this.draft) this.placeFloating(this.composer, this.draft.x, this.draft.y);
    };
    session.finish = () => {
      setState(session.error ? 'error' : 'idle', session.error);
      textarea.readOnly = false;
      send.disabled = false;
      textarea.focus();
      const insertedLength = Math.max(0, textarea.value.length - (originalValue.length - (selectionEnd - selectionStart)));
      const caret = Math.min(textarea.value.length, selectionStart + insertedLength);
      textarea.setSelectionRange(caret, caret);
    };
    this.dictation = session;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.config.voiceLanguage || document.documentElement.lang || navigator.language || 'en-US';
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
      session.transcript = segments.join(' ').replace(/\s+/g, ' ').trim();
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
      if (this.dictation !== session || session.cancelled || event.error === 'aborted') return;
      session.error =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone access was blocked. You can keep typing.'
          : event.error === 'audio-capture'
            ? 'Chrome could not find a microphone. You can keep typing.'
            : event.error === 'no-speech'
              ? 'No speech was detected. Try again or keep typing.'
              : 'Voice input stopped. You can keep typing.';
      setState('error', session.error);
    };
    recognition.onend = () => {
      if (this.dictation !== session) return;
      this.dictation = null;
      if (!session.error && !session.transcript) session.error = 'No speech was detected. Try again or keep typing.';
      session.finish();
    };
    cancel.onclick = () => this.cancelDictation();
    stop.onclick = () => {
      if (this.dictation !== session) return;
      setState('stopping', 'Finishing your voice comment…');
      try {
        recognition.stop();
      } catch {
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
      }
      this.serviceError = '';
      const pendingId = sessionStorage.getItem(this.pendingKey());
      const pending = this.comments.find(comment => comment.id === pendingId);
      if (pending && pending.scope === this.currentScope()) {
        this.selectedComment = pending;
        sessionStorage.removeItem(this.pendingKey());
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

  async createComment({ authorName, message }) {
    const name = authorName.trim();
    const text = message.trim();
    if (!name || !text) return;
    this.authorName = name;
    localStorage.setItem(this.authorKey(), name);
    const selection = this.draft.selection
      ? {
          x: this.draft.selection.x / this.surface.width,
          y: this.draft.selection.y / this.surface.height,
          width: this.draft.selection.width / this.surface.width,
          height: this.draft.selection.height / this.surface.height,
        }
      : null;
    const draft = {
      scope: this.currentScope(),
      authorName: name,
      message: text,
      x: this.draft.x / this.surface.width,
      y: this.draft.y / this.surface.height,
      selection,
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
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
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

  markDone(comment) {
    this.resolved.add(comment.id);
    localStorage.setItem(this.resolvedKey(), JSON.stringify([...this.resolved]));
    this.selectedComment = null;
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
    if (comment.scope === this.currentScope()) {
      this.panelOpen = false;
      this.selectedComment = comment;
      this.render();
      return;
    }
    sessionStorage.setItem(this.pendingKey(), comment.id);
    const { route, contextId } = splitScope(comment.scope);
    const target = this.urlForRoute(route);
    if (typeof this.config.navigate === 'function') {
      await this.config.navigate({ scope: comment.scope, route, contextId, reviewUrl: target, comment });
      this.panelOpen = false;
      this.scheduleSurfaceSync();
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
    for (const comment of this.comments) {
      if (comment.scope !== scope || this.resolved.has(comment.id)) continue;
      if (comment.selection) {
        const selection = this.drawRect(
          {
            x: comment.selection.x * this.surface.width,
            y: comment.selection.y * this.surface.height,
            width: comment.selection.width * this.surface.width,
            height: comment.selection.height * this.surface.height,
          },
          'rp-selection'
        );
        this.annotations.append(selection);
      }
      const identity = authorPresentation(comment.authorName);
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'rp-marker';
      marker.textContent = identity.initial;
      marker.style.left = `${comment.x * this.surface.width}px`;
      marker.style.top = `${comment.y * this.surface.height}px`;
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
    for (const comment of this.comments) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'rp-comment-row';
      const done = this.resolved.has(comment.id);
      row.classList.toggle('rp-comment-row-done', done);
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
      const status = document.createElement('span');
      status.textContent = done ? '✓ Done' : comment.elementLabel || 'Page';
      status.className = done ? 'rp-done-label' : '';
      meta.append(name, status);
      const message = document.createElement('span');
      message.className = 'rp-comment-message';
      message.textContent = comment.message;
      content.append(meta, message);
      row.append(avatar, content);
      row.addEventListener('click', () => void this.openInboxComment(comment));
      list.append(row);
    }
    this.panel.append(list);
  }

  renderComposer() {
    if (this.composer && this.draft && this.composerDraft === this.draft) {
      this.placeFloating(this.composer, this.draft.x, this.draft.y);
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
    const textarea = document.createElement('textarea');
    textarea.maxLength = 4000;
    textarea.rows = 3;
    const VoiceRecognition = this.voiceRecognitionConstructor();
    textarea.placeholder = VoiceRecognition ? 'Or type your feedback' : 'Leave a comment';
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
    const mic = button('rp-voice-button rp-voice-start', 'Talk to leave feedback (Chrome)', ICONS.mic);
    const micLabel = document.createElement('span');
    micLabel.textContent = 'Talk';
    mic.append(micLabel);
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
      actions.hidden = !hasText || listening;
      micLabel.hidden = hasText;
      mic.classList.toggle('rp-voice-start-compact', hasText);
    };
    if (VoiceRecognition) {
      mic.addEventListener('click', () =>
        this.startDictation({
          textarea,
          send,
          field: commentField,
          mic,
          wave,
          cancel: cancelVoice,
          stop: stopVoice,
          status: voiceStatus,
          syncActions: syncComposerActions,
        })
      );
      voiceControls.append(mic, wave, voiceStatus, cancelVoice, stopVoice);
      commentField.classList.add('rp-has-voice');
    }
    commentField.append(textarea, voiceControls);
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
    textarea.addEventListener('input', syncComposerActions);
    actions.append(send);
    form.append(header, name, commentField, actions);
    this.root.append(form);
    this.composer = form;
    this.composerDraft = this.draft;
    syncComposerActions();
    this.placeFloating(form, this.draft.x, this.draft.y);
    if (typeof ResizeObserver === 'function') {
      this.composerResizeObserver = new ResizeObserver(() => {
        if (this.composer === form && this.draft) this.placeFloating(form, this.draft.x, this.draft.y);
      });
      this.composerResizeObserver.observe(form);
    }
  }

  renderCard() {
    this.card?.remove();
    this.card = null;
    const comment = this.selectedComment;
    if (!comment || comment.scope !== this.currentScope()) return;
    const card = document.createElement('article');
    card.className = 'rp-card';
    const header = document.createElement('header');
    const author = document.createElement('strong');
    author.textContent = comment.authorName;
    const controls = document.createElement('span');
    controls.className = 'rp-card-controls';
    const done = button('rp-plain-icon', this.resolved.has(comment.id) ? 'Comment is done' : 'Mark comment as done', ICONS.check);
    done.classList.toggle('rp-done-control', this.resolved.has(comment.id));
    done.addEventListener('click', () => this.markDone(comment));
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
    this.placeFloating(card, comment.x * this.surface.width, comment.y * this.surface.height);
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
