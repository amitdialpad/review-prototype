# Design Studio PR-preview review

Use this reference for Studio prototypes in `dialpad/design` under `apps/studio/prototypes/<slug>/`. Check the repository's current workflow and `apps/studio/README.md` before acting; those files own the deploy and Comments behavior.

## Preview and access

The current PR-preview pattern is:

`https://studio.dialpad.design/pr-preview-<PR>/prototypes/<slug>/`

The `Studio — PR Preview` build and `Studio — PR Preview Deploy` workflows produce the preview. Derive the PR and slug from the actual branch and prototype manifest; wait for the deploy run to succeed, then open the exact route. Studio is protected by company sign-in. A successful GitHub push, build, deploy status, or HTTP response alone does not prove that an authenticated reviewer can see the screen.

Use the prototype's own route and query parameters for canonical states. Do not assume hash routing or prepend the old GitHub Pages path. Reuse the same PR and slug through review rounds so the native comment context remains stable.

## Native Comments

Studio injects its own Comments loader into hosted prototypes. Prototype authors do not install or initialize `review-prototype`, bundle its assets, add `review-prototype.json`, generate bearer links, or call `review_session.py`. They do not need to add a Comments integration to the prototype's source. The exact query value `callouts=false` disables native Comments; do not put it in reviewer links. `callouts=true` is accepted but unnecessary.

Studio uses the company session that opened the preview and its company-hosted Callout API. The Add comment and Comments controls should appear after sign-in. A PR-preview conversation is keyed by canonical repository, PR number, Studio surface, and prototype slug. It persists across preview revisions, routes, query parameters, hashes, and redeployments. Different slugs and production Studio have separate contexts.

## Verify and hand off

1. Confirm the prototype's focused type check/build and the PR's Studio scope, package, preview-build, and deploy checks. Distinguish unrelated pending checks from relevant failures.
2. Open the exact authenticated preview route. Confirm expected screen content, assets, query state, settings, and navigation.
3. Confirm Add comment and Comments panel open without a second sign-in. If unavailable, inspect company sign-in, the injected loader, trusted preview metadata, and the Callout API. Do not substitute the portable Netlify service.
4. When safe and appropriate, prove a disposable comment persists across refresh and a separate reviewer context. Avoid junk comments in the live PR context; say clearly when only the controls were verified.
5. Share the exact prototype link and draft PR. State company sign-in is required. The URL itself is the review link; no token or extra review parameter is needed.

Studio's native Comments experience is distinct from the portable Review Prototype widget. Its voice-first and bearer-token checks do not apply. When applying feedback, use the native Comments panel or supported Callout API access and retain the same PR and slug.
