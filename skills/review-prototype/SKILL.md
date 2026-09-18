---
name: review-prototype
description: Make a finished browser prototype commentable, publish it through its existing preview host, and return one shared review session with route-specific links. Use for stakeholder or customer prototype review; not for production release or arbitrary third-party websites.
---

# Review Prototype

## Outcome

The prototype owner gives one instruction. Integrate the framework-neutral widget, ensure shared storage is reachable,
publish through the repository's existing preview workflow, and return the links reviewers need. Reviewers need only
the URL and their display name—never a GitHub account.

One invocation creates one unguessable session token. Every main section receives its own URL with that same token, so
all feedback appears in one inbox.

## Workflow

1. Inspect the repository, branch, dirty files, router, preview workflow, and any existing review integration.
2. Preserve unrelated work and treat the change as review-only unless the user explicitly requests a production merge.
3. If the widget is absent, install this repository from GitHub and run its initializer into the app's public assets:
   `npm install --save-dev github:amitdialpad/review-prototype` then
   `npx review-prototype init --public-dir <app-public-directory>/review-prototype`.
4. Load the CSS and initialize `ReviewPrototype` once in the application shell. Set a stable, non-secret `projectId`,
   the actual hosted Worker origin, and the app's `history` or `hash` router style.
5. Preserve `review` through internal navigation. The widget handles ordinary links and History API calls; use its
   `navigate`, `getScope`, or `getContext` hooks when the app has custom routing or modal state.
6. Create or maintain `review-prototype.json` with the main review sections, not every scenario. Never put a token,
   hostname, secret, or reviewer identity in the manifest.
7. Generate links only after the exact preview base URL is known:
   `npx review-prototype links --manifest <file> --base-url <preview-origin>`.
8. Build and publish through the repository's established preview workflow. Do not introduce a second frontend host.
9. Verify every returned route, token persistence, click and drag comments, modal placement, cross-screen inbox,
   author initials/colors, Done state, and GET/POST from separate browser contexts.

## Hosted storage

GitHub Pages can host the widget but cannot receive comments. Shared review requires the included Worker + D1 service
or a compatible HTTPS API. Before returning customer-ready links, verify exact-origin CORS, bounded requests, write
rate limiting, the 1,000-active-comment session cap, 90-day expiry, and daily deletion. Never silently substitute
browser-local storage for a shared link.

If the deployment needs a new account, login, secret, paid service, or public release authorization, complete safe local
work and stop at that external boundary.

## Safety

The session URL is a capability: anyone holding it can read and add comments. Use prototype or synthetic data. Never
collect screenshots, page HTML, credentials, cookies, console output, analytics, or network traffic. A display name is
self-asserted because reviewer accounts are intentionally out of scope.

## Handoff

Return the review name, short session identifier, full raw URL for every section, access level, what was verified, and
the material review-only/privacy caveat. Do not ask the user to assemble URLs or run deployment commands.
