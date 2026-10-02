# Design Studio PR-preview publishing

Use this reference for work in `dialpad/design-studio`.

## Target

Publish through the repository's existing GitHub Pages workflow. The canonical base is:

`https://dialpad.github.io/design-studio/pr-preview/pr-<PR>/`

Derive `<PR>` from the current branch's actual draft/open pull request. Design Studio uses hash routing, so route and
review parameters belong after `#/`.

## Install the portable widget

Use the stable HTTPS release archive so CI does not require GitHub SSH credentials:

```bash
npm install --save-dev https://github.com/amitdialpad/review-prototype/archive/refs/tags/v0.3.6.tar.gz
npx review-prototype init \
  --public-dir public/review-prototype \
  --api-url https://review-prototype.netlify.app \
  --project-id design-studio-<prototype-name> \
  --router hash \
  --vite
```

The ordinary root-relative initializer snippet is not safe for Design Studio's nested PR-preview base. Initialize the
widget once from the persistent Vite entrypoint using the printed `--vite` snippet. It resolves both assets through
`import.meta.env.BASE_URL` and keeps the dynamic public-asset import out of Rollup resolution. Replace
`design-studio-<prototype-name>` with a stable, non-secret identifier.

Do not hardcode `/design-studio/pr-preview/pr-<PR>/` in source. The same branch must continue to work locally and under
future preview numbers.

## Required behavior

1. Preserve the current draft PR and its existing GitHub Pages build/deploy workflow. Never merge unless the owner
   explicitly changes the mode.
2. Confirm `vite.config` derives the PR base and that the deployed HTML, widget JS, and widget CSS all resolve beneath
   the exact preview base.
3. Build with the repository's pinned package manager and runtime. A root page or HTTP 200 alone is insufficient.
4. Use `https://review-prototype.netlify.app` for shared comments; `https://dialpad.github.io` is approved by the
   designer-pilot service.
5. Inspect the prototype metadata, named variant routes, and query-driven modes. Include each canonical state that is
   part of the review decision, not merely the route root.
6. Generate all links from one manifest and one shared session token. Verify the token remains inside the hash route
   through internal navigation.
7. Verify the ordinary preview remains free of Review UI and the complete review URLs render the intended states.
