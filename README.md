# Review Prototype

Put Figma-like comments directly on a browser prototype. Reviewers open one special URL, enter their name, click or
drag anywhere, and leave feedback. They do not need GitHub accounts.

The person who owns the prototype sees every screen's feedback in one inbox. Marking a comment Done removes its pin
from the page but keeps the comment in the shared inbox. Done feedback is history, not new work, so `$review` will not
pick it up again. Reopening it restores its pin and returns it to the work queue. Pins use each reviewer's first-name
initial and a stable color.
New comments stay attached to the clicked element while the page or a nested container scrolls. Older comments created
before content anchoring continue to use their original screen position.

Inbox comments on the current screen open in place. Hosts can ignore deployment-only query parameters when matching
saved comments and provide SPA navigation for comments that belong to another product state, avoiding a full reload.

In supported Google Chrome, selecting a comment target immediately attempts dictation inside the compact dark composer. If the reviewer starts editing the feedback field, typing takes control immediately: voice capture stops, visible transcript is preserved, and the first edit still lands.
The transcript stays editable and is never submitted automatically. Safari, Edge, and unsupported browsers use the
same review link and automatically receive the ordinary typing experience with no voice UI.
<img width="503" height="397" alt="Screenshot 2026-09-18 at 06 32 26" src="https://github.com/user-attachments/assets/b26d28b8-569e-4890-bea7-f81cb30efe8d" />
<img width="518" height="288" alt="Screenshot 2026-09-18 at 06 32 37" src="https://github.com/user-attachments/assets/2a9ae99d-733b-4def-b4a9-6b2a82fb7ede" />
<img width="519" height="327" alt="Screenshot 2026-09-18 at 06 33 28" src="https://github.com/user-attachments/assets/4d07ca05-cd4c-4b55-baab-4b6ff0e583bb" />

## What it is

- A framework-neutral browser widget: plain JavaScript and CSS.
- Netlify Functions + Blobs for shared comments.
- A manifest and CLI that generate one review session with a link for each important screen.
- An optional `$review` Codex skill that handles publishing, link generation, feedback retrieval, revision, and
  redeployment for the prototype owner.

GitHub hosts the source, contribution workflow, and installable package. Netlify hosts the demo/widget and receives
shared comments. Each installer deploys a separate Netlify site and owns their data.

## Install it for your own prototypes

Give [`INSTALL_WITH_AI.md`](INSTALL_WITH_AI.md) to your coding agent. It contains the complete fork, Netlify storage,
website integration, Codex skill, review-link generation, safety, and verification workflow. The intended instruction
is simply:

> Install Review Prototype in this website and make the prototype reviewable.

The prototype owner needs GitHub, Netlify, and permission to edit the website. Reviewers need only the generated link
and their name.

## The workflow in plain English

- You keep designing. Review quietly keeps the commenting layer up to date.
- It privately remembers which repository, branch, preview, review session, and links belong together.
- When you say you are finished commenting, it collects only feedback that still needs attention, updates the same
  prototype, checks the live result, and gives you the same link back.
- Nothing is treated as implemented until the deployed fix has been verified. You still decide when a comment is Done.
- Done comments remain in the inbox as useful history. Reopening one returns it to the work queue.
- If several Codex agents are working at once, their progress is combined safely rather than overwritten.
- If a repository, branch, session, URL, comment, or deployed commit does not match, Review stops safely instead of
  changing the wrong prototype.

## Try it locally

```bash
npm install
npm test
npm run build
python3 -m http.server 4173 --directory dist
```

Open `http://127.0.0.1:4173/?review=local`. Local comments stay in that browser. Click the link icon to create a
shared-session URL; shared comments require the Netlify deployment below.

## Add it to a website

Install directly from GitHub:

```bash
npm install --save-dev github:amitdialpad/review-prototype
npx review-prototype init --public-dir public/review-prototype
```

After the first install, update an existing integration without changing its configuration:

```bash
npx review-prototype sync --public-dir public/review-prototype
```

The copied `review-prototype.manifest.json` records the stable package version and asset hashes. The `$review` skill
checks it on every publish or feedback cycle, so the prototype owner does not manually copy widget updates.

Include the copied assets in the website shell:

```html
<link rel="stylesheet" href="/review-prototype/review-prototype.css" />
<script type="module">
  import { ReviewPrototype } from '/review-prototype/review-prototype.js';

  ReviewPrototype.init({
    projectId: 'my-prototype',
    apiUrl: 'https://YOUR-SITE.netlify.app',
    router: 'history',
    voiceInput: 'chrome',
    voicePhrases: ['Your product name', 'Your feature name'],
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

## Deploy on Netlify

The default retention is **90 days**. Expired comments stop appearing immediately and a daily Scheduled Function
permanently deletes them from Netlify Blobs. The service stores only the project/session identifiers, route scope,
author display name, comment text, normalized fallback position, optional selection rectangle, a structural element
path with relative offsets, element label, shared open/Done status, and timestamps. The structural path contains tag names and sibling positions;
it does not store page text, HTML, IDs, classes, or data attributes.

1. Fork this repository or use it as a template.
2. In Netlify, choose **Add new project → Import an existing project** and select the fork.
3. Netlify reads `netlify.toml`, builds `dist`, deploys the Functions, and provisions the site-wide Blobs store on first
   use—there is no database migration.
4. In **Project configuration → Environment variables**, set `ALLOWED_ORIGINS` (all scopes) to the exact
   comma-separated prototype origins allowed to use the service, then redeploy. The deployed Netlify site's own origin
   is automatically allowed. `RETENTION_DAYS` is optional and defaults to `90`.
5. Put the resulting `https://YOUR-SITE.netlify.app` origin in `ReviewPrototype.init({ apiUrl })`.

Do not use `*` for `ALLOWED_ORIGINS`. A review link is a capability: anyone holding it can read and add feedback to
that session. Do not use review sessions for secrets or confidential production data.

Voice input uses the browser's speech-recognition service. Review Prototype does not receive or store microphone
audio; it only handles the editable transcript Chrome returns. Browser or platform providers may process speech under
their own terms and privacy policies.

## Optional Codex skill

Copy `skills/review` into `~/.codex/skills/review`. Then ask Codex:

> `$review` Make this prototype reviewable.

The skill inspects the app, adds or upgrades the widget, maintains the manifest, publishes through the existing preview
workflow, privately records the active session, and returns the route-specific links. After reviewing, say:

> `$review` I’m done commenting. Apply all clear comments from the current review session.

Codex retrieves open, unhandled comments, revises the same draft PR, verifies its redeployed preview, and returns the same
links. Comments remain visible until the prototype owner verifies them and marks them Done. The skill stops instead of
claiming success when the hosted API or preview is not reachable.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), [PRIVACY.md](PRIVACY.md), and
[SECURITY.md](SECURITY.md) first. The project is MIT licensed.
