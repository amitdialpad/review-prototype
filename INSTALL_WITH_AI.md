# Install Review Prototype with a coding agent

Give this entire file to the coding agent working in the website repository, then say:

> Install Review Prototype in this website and make the prototype reviewable. Give me one verified review link for
> each main section when you are finished.

This document is written as an execution specification for an LLM or coding agent. Do not claim completion after only
copying files or producing example URLs. Complete and verify the workflow end to end.

## Required outcome

The website owner can send a special URL to a reviewer. The reviewer enters their name, clicks an element or drags
over an area, and leaves feedback directly on the live browser prototype. They do not need GitHub or Netlify accounts.

The website owner opens any URL from the same review session and uses the inbox button to see feedback across all
included routes. Ordinary website URLs must remain unchanged when review mode is absent.

## Before making changes

1. Inspect the target website repository, working tree, package manager, framework, public/static-assets directory,
   application shell, router style, build command, and existing preview/deployment workflow.
2. Preserve unrelated work. Do not replace the website's framework, router, host, authentication, or deployment
   system.
3. Confirm the owner can edit the website source. Review Prototype cannot be attached invisibly to an unrelated
   website.
4. Determine the exact deployed prototype origin, such as `https://prototype.example.com`. Do not guess it.
5. Determine whether routing is:
   - `history` for URLs such as `https://prototype.example.com/billing`; or
   - `hash` for URLs such as `https://prototype.example.com/#/billing`.

## Part 1: Create storage owned by the installer

Do not use another person's hosted Review Prototype service. Each installer must own the Netlify site and comment data.

1. Fork `https://github.com/amitdialpad/review-prototype` into the website owner's GitHub account.
2. In the owner's Netlify account, create a new project by importing that fork.
3. Keep the repository's existing `netlify.toml`. It builds the demo/widget, deploys the Functions, configures Netlify
   Blobs, and schedules daily expired-comment cleanup.
4. In **Netlify → Project configuration → Environment variables**, add:

   ```text
   ALLOWED_ORIGINS=https://prototype.example.com
   ```

   Use the target website's exact origin. Multiple trusted origins may be comma-separated. Never use `*`.
5. Optional: set `RETENTION_DAYS`. If omitted, comments are retained for 90 days.
6. Deploy or redeploy the Netlify project.
7. Record the resulting service origin, for example `https://example-review.netlify.app`.
8. Verify the service before integration:

   ```bash
   curl -i \
     -H 'Origin: https://prototype.example.com' \
     https://example-review.netlify.app/health
   ```

   Require HTTP 200 and `Access-Control-Allow-Origin` matching the exact prototype origin. Do not continue with a
   customer-ready handoff if this fails.

If account creation, login, permissions, or deployment authorization requires the owner, prepare everything possible
and ask them to complete only that boundary. Never invent a successful deployment.

## Part 2: Install the widget in the website

Run these commands in the target website repository, using its existing package manager when appropriate:

```bash
npm install --save-dev github:amitdialpad/review-prototype
npx review-prototype init \
  --public-dir public/review-prototype \
  --api-url https://example-review.netlify.app
```

Replace `public/review-prototype` with the actual static-assets directory discovered in the repository. The initializer
copies `review-prototype.js` and `review-prototype.css` and prints the integration snippet. Commit those copied assets
so preview deployments contain them.

Load the stylesheet and initialize the widget exactly once in the application's persistent shell:

```html
<link rel="stylesheet" href="/review-prototype/review-prototype.css" />
<script type="module">
  import { ReviewPrototype } from '/review-prototype/review-prototype.js';

  ReviewPrototype.init({
    projectId: 'stable-project-id',
    apiUrl: 'https://example-review.netlify.app',
    router: 'history',
  });
</script>
```

Integration requirements:

- Replace `stable-project-id` with a stable, non-secret identifier containing only letters, numbers, `.`, `_`, or `-`.
- Use the installer-owned Netlify service origin for `apiUrl`.
- Set `router` to the discovered `history` or `hash` mode.
- Do not initialize the widget separately on every page.
- Do not add review UI to normal URLs. The widget activates only when the configured `review` parameter contains
  `local`, `true`, or a valid shared-session token.
- The widget preserves the review token for ordinary same-origin links and History API navigation. If the application
  uses custom navigation that bypasses those mechanisms, adapt the integration and prove token persistence.
- For custom modal/dialog surfaces, add a stable `data-review-context="context-name"` to the active surface when
  necessary. Native open dialogs and accessible modal dialogs are detected automatically.
- Do not collect screenshots, page HTML, form values, credentials, cookies, console output, analytics, or network
  traffic.

## Part 3: Describe the important review routes

Create `review-prototype.json` in the target website repository. Include the main sections the owner wants to share,
not every possible state:

```json
{
  "version": 1,
  "name": "My prototype",
  "projectId": "stable-project-id",
  "router": "history",
  "reviewParam": "review",
  "routes": [
    {
      "label": "Overview",
      "path": "/overview"
    },
    {
      "label": "Billing",
      "path": "/settings/billing",
      "query": {
        "scenario": "existing-customer"
      }
    }
  ]
}
```

The manifest must use the same `projectId` and router style as the widget initialization. Never store a generated
session token, reviewer identity, secret, or environment-specific credential in the manifest.

## Part 4: Build and publish the website

1. Run the repository's existing tests, type checks, lint checks, and production build in proportion to the change.
2. Publish through the website's existing preview workflow. Do not introduce a second frontend host merely for review
   mode.
3. Confirm the ordinary preview URL still behaves normally and shows no review toolbar.
4. Open the same URL with `?review=local` for a history router, or add `review=local` inside the hash route for a hash
   router. Confirm the toolbar appears.

## Part 5: Create one shared review session

Only generate links after the exact deployed preview base URL is reachable:

```bash
npx review-prototype links \
  --manifest review-prototype.json \
  --base-url https://prototype.example.com
```

The command creates one unguessable session token and places it into every route-specific URL. All generated links
must contain the same token so their comments appear in one inbox.

Generate a new session for a new review round. Do not reuse a link that has been exposed publicly.

## Part 6: Required end-to-end verification

Do not call the installation complete until all checks pass on the deployed website:

1. An ordinary URL has no toolbar and no layout changes.
2. Every generated review URL loads its intended route and shows the toolbar.
3. `C` enters comment mode and `Esc` exits it.
4. Clicking an element opens the small composer.
5. Dragging across an area opens the same composer with the selected area visible.
6. A comment created in a separate reviewer browser/context appears in the owner's inbox.
7. The reviewer name is requested once and its first-name initial appears on a stable-color rounded-square marker.
8. Internal navigation preserves the exact review token.
9. Comments remain scoped to the route, query state, and active modal/context where they were added.
10. Selecting an inbox item returns to the correct screen and opens the comment in context.
11. Marking a comment Done removes its page marker but retains it in every reviewer's inbox with a shared Done state;
    reopening it restores the marker and returns it to the work queue.
12. A newly created marker stays attached to its clicked element while the page or a nested container scrolls.
13. GET, POST, and PATCH requests to the installer-owned Netlify service succeed from the exact prototype origin; disallowed
    origins do not receive cross-origin access.
14. Refreshing and reopening the review link retains shared comments.
15. The production build and existing relevant tests still pass.

If any of these checks fail, report the exact blocker and do not return the links as customer-ready.

## Optional: install the Codex skill

The public repository includes the complete publish-and-revise skill at `skills/review`.

Copy that directory into the owner's Codex skills directory:

```bash
mkdir -p ~/.codex/skills
cp -R skills/review ~/.codex/skills/review
```

Run that command from a clone/fork of Review Prototype. If Review Prototype was installed only as a website
dependency, copy it from `node_modules/review-prototype/skills/review` instead.

If `~/.codex/skills/review` already exists, inspect it before replacing or merging it. Start a fresh Codex
session if the newly installed skill is not discovered immediately. Then, from the target website repository, ask:

> `$review` Make this prototype reviewable.

The skill performs the integration, maintains `review-prototype.json`, uses the established preview workflow, privately
registers the active session, verifies the deployed experience, and returns the route-specific links. When the owner
finishes commenting, they say:

> `$review` I’m done commenting. Apply all clear comments from the current review session.

The skill retrieves unhandled feedback, revises and redeploys the same draft preview, and keeps the original links. It
must stop at account, login, permission, merge, or release-authorization boundaries that require the owner.

## Security and privacy rules

- A generated review URL is a bearer capability: anyone holding it can read and add feedback to that session.
- Use prototype or synthetic data. Do not use review sessions for secrets or confidential production information.
- Reviewer names are self-asserted; there is intentionally no reviewer authentication.
- Chrome voice input is optional and browser-provided. Review Prototype does not receive or store microphone audio;
  it handles only the editable transcript returned by Chrome. Unsupported browsers automatically use typing with the
  same review URL.
- Use exact allowed origins and never `ALLOWED_ORIGINS=*`.
- The included service limits request sizes and comments per session. Do not remove those protections.
- Shared comments expire after the configured retention period; the default is 90 days.
- Done state is shared through the hosted service and excluded from future `$review` work by default. Reopened comments
  become active feedback again. The remembered reviewer name remains browser-local.
- Never place Netlify or GitHub tokens in browser code, the manifest, generated links, issues, or documentation.

## Required handoff to the website owner

Return all of the following:

- the installer-owned Netlify service URL;
- the deployed prototype base URL;
- one full raw review URL for every manifest route;
- the short session identifier;
- the access level or login requirement for the prototype;
- the exact build, test, API, and browser checks completed;
- the 90-day retention and bearer-link caveats;
- the location of the integration and manifest in the website repository;
- any manual account or permission step that remains.

Reviewers should receive only the generated prototype links and simple instructions: enter your name, press `C` or
click the comment icon, click or drag to comment, and press `Esc` to exit comment mode. They do not need the repository,
Codex skill, GitHub account, or Netlify account.
