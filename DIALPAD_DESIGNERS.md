# Review for Dialpad designers

Review routes Beacon prototypes through the portable commenting service and current Design Studio prototypes through Studio's built-in Comments. The person reviewing needs only the link you send them and any company sign-in required by the preview; they do not need Codex or GitHub.

## Install once

Open Codex and send this exact message:

> Install the Review skill from
> `https://github.com/amitdialpad/review-prototype/tree/v0.3.8/skills/review`.

When Codex finishes, start a fresh conversation so Review is available.

## Make a prototype reviewable

Open the prototype repository in Codex and say:

> `$review` Make this prototype reviewable.

Codex prepares the prototype, publishes it through the existing preview workflow, and returns the review link. You do
not need to configure Netlify, Firebase, GCP, environment variables, or a database.

Send the review link to whoever should comment. On a current Studio preview, they use their company sign-in and Studio's Add comment or Comments controls. On a portable Beacon review, they enter their name, press `C` or choose the comment tool, and click or drag on the prototype.

## Apply the feedback

When everyone is finished commenting, return to the same Codex conversation and say:

> `$review` I’m done commenting. Apply all clear comments from the current review session.

Codex updates the same prototype and returns the same review link for another pass. You decide when feedback is
accepted and mark those comments Done.

## Pilot boundaries

- The portable Beacon commenting service is operated by Amit as a lightweight designer pilot. Current Studio uses its company-hosted Callout API instead.
- Portable service comments expire after 90 days. Studio retention is governed by Studio's own policy.
- Anyone holding a complete portable review link can access that session; Studio requires company sign-in. Share both deliberately.
- Use prototype or synthetic data. Do not put customer information, credentials, secrets, or confidential production
  material in comments.
- The commenting service stores the written feedback and its location; it does not store the prototype, screenshots,
  page HTML, form values, cookies, console logs, or network traffic.
