# Review Prototype

Put Figma-like comments directly on a browser prototype. Reviewers open one special URL, enter their name, click or
drag anywhere, and leave feedback. They do not need GitHub accounts.

The person who owns the prototype sees every screen's feedback in one inbox. Marking a comment Done removes its pin
from the page but keeps the comment in the inbox. Pins use each reviewer's first-name initial and a stable color.

## What it is

- A framework-neutral browser widget: plain JavaScript and CSS.
- A small Cloudflare Worker + D1 service for shared comments.
- A manifest and CLI that generate one review session with a link for each important screen.
- An optional Codex skill that handles integration and link generation for the prototype owner.

GitHub hosts the source and static widget. GitHub Pages alone cannot receive comments, so shared reviews use the
included Worker. Each installer deploys the Worker to their own Cloudflare account and owns their data.

## Try it locally

```bash
npm install
npm test
npm run build
python3 -m http.server 4173 --directory dist
```

Open `http://127.0.0.1:4173/?review=local`. Local comments stay in that browser. Click the link icon to create a
shared-session URL; shared comments require the Worker configuration below.

## Add it to a website

Install directly from GitHub:

```bash
npm install --save-dev github:amitdialpad/review-prototype
npx review-prototype init --public-dir public/review-prototype
```

Include the copied assets in the website shell:

```html
<link rel="stylesheet" href="/review-prototype/review-prototype.css" />
<script type="module">
  import { ReviewPrototype } from '/review-prototype/review-prototype.js';

  ReviewPrototype.init({
    projectId: 'my-prototype',
    apiUrl: 'https://YOUR-WORKER.workers.dev',
    router: 'history',
  });
</script>
```

Use `router: 'hash'` for URLs such as `https://example.com/#/billing`. The widget is invisible on ordinary URLs; it
only starts when the configured URL parameter contains `local` or a valid shared token.

This works on any website you own or can edit. It cannot be attached invisibly to an unrelated website: customer-safe
one-click review requires the site to load the widget.

## Create review links

Add a `review-prototype.json` file:

```json
{
  "version": 1,
  "name": "Billing prototype",
  "projectId": "billing-prototype",
  "router": "history",
  "reviewParam": "review",
  "routes": [
    { "label": "Credits & Usage", "path": "/settings/billing/credits-usage" },
    { "label": "Billing Summary", "path": "/settings/billing/summary" }
  ]
}
```

Then generate one session and all of its route-specific links:

```bash
npx review-prototype links \
  --manifest review-prototype.json \
  --base-url https://prototype.example.com
```

Every generated link carries the same unguessable session token, so all comments appear in one inbox.

## Deploy shared comment storage

The default retention is **90 days**. Expired comments stop appearing immediately and a daily scheduled job permanently
deletes them. The service stores only the project/session identifiers, route scope, author display name, comment text,
normalized position, optional selection rectangle, element label, and timestamps.

1. Authenticate Wrangler: `npx wrangler login`.
2. Create D1: `npm run db:create`.
3. Put the returned database ID in `worker/wrangler.jsonc`.
4. Replace `ALLOWED_ORIGINS` with the exact comma-separated website origins allowed to use the service.
5. Apply the schema: `npm run db:migrate`.
6. Deploy: `npm run deploy:worker`.
7. Put the resulting HTTPS Worker origin in `ReviewPrototype.init({ apiUrl })`.

Do not set `ALLOWED_ORIGINS` to `*` for a public deployment. A review link is a capability: anyone holding it can read
and add feedback to that session. Do not use review sessions for secrets or confidential production data.

## Optional Codex skill

Copy `skills/review-prototype` into `~/.codex/skills/review-prototype`. Then ask Codex:

> Make this prototype reviewable.

The skill inspects the app, adds the widget, maintains the manifest, publishes through the existing preview workflow,
and returns the route-specific links. It will stop instead of claiming success if the hosted API or preview is not
actually reachable.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), [PRIVACY.md](PRIVACY.md), and
[SECURITY.md](SECURITY.md) first. The project is MIT licensed.
