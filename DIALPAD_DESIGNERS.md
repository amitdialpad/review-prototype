# Review for Dialpad designers

Review lets you put comments directly on a Beacon or Design Studio prototype. The person reviewing needs only the link you send them;
they do not need Codex, GitHub, or Netlify.

## Install once

Open Codex and send this exact message:

> Install the Review skill from
> `https://github.com/amitdialpad/review-prototype/tree/v0.3.5/skills/review`.

When Codex finishes, start a fresh conversation so Review is available.

## Make a prototype reviewable

Open the prototype repository in Codex and say:

> `$review` Make this prototype reviewable.

Codex prepares the prototype, publishes it through the existing preview workflow, and returns the review link. You do
not need to configure Netlify, Firebase, GCP, environment variables, or a database.

Send the review link to whoever should comment. They enter their name, press `C` or choose the comment tool, and click
or drag on the prototype.

## Apply the feedback

When everyone is finished commenting, return to the same Codex conversation and say:

> `$review` I’m done commenting. Apply all clear comments from the current review session.

Codex updates the same prototype and returns the same review link for another pass. You decide when feedback is
accepted and mark those comments Done.

## Pilot boundaries

- The shared commenting service is operated by Amit as a lightweight designer pilot.
- Comments expire after 90 days.
- Anyone holding the complete review link can access that review session, so share it deliberately.
- Use prototype or synthetic data. Do not put customer information, credentials, secrets, or confidential production
  material in comments.
- The commenting service stores the written feedback and its location; it does not store the prototype, screenshots,
  page HTML, form values, cookies, console logs, or network traffic.
