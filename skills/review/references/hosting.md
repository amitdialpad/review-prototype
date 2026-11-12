# Shared comment hosting

The visual layer may be static, but comments shared between people require a reachable write service. GitHub Pages and browser localStorage alone cannot provide that.

## Dialpad designer pilot

For Dialpad Beacon prototypes using the portable Review Prototype widget, use the shared pilot service:

`https://review-prototype.netlify.app`

The service is operated by the Review Prototype owner and allows these exact Dialpad prototype origins:

- Beacon: `https://beacon-test.dialpad.design`

CORS works at the origin level. The service may still allow legacy `https://dialpad.github.io` reviews, but current Studio in `dialpad/design` uses its own company-hosted Comments system at `https://studio.dialpad.design`. Do not send current Studio reviews to this pilot service or treat a legacy allowed origin as a Studio preview path. Portable review sessions are protected by their unguessable bearer token.

This is an intentional lightweight pilot, not a Dialpad-owned production service. Do not ask each designer to fork the
service, create a Netlify account, deploy a backend, or obtain GCP/Firebase access. The API URL is public configuration,
not a secret, and may be placed directly in the prototype's review-only integration.

Use the shared service only for synthetic or prototype content. If a requested prototype is served from another
origin, stop with that exact origin as the blocker so the service owner can decide whether to allow it. Do not widen
CORS to `*` and do not substitute another backend without the owner's approval.

## Before calling a link ready

1. Confirm the preview build received the hosted API origin rather than a local endpoint.
2. Confirm the exact deployed prototype origin is allowed by CORS; never use `*`.
3. Confirm health and both GET and POST from the real preview origin.
4. Confirm a comment written in a separate reviewer context appears in the owner's inbox after refresh.
5. Confirm session IDs are unguessable, inputs are bounded, writes are rate-limited, and records expire after 90 days.
6. Store only project/session IDs, route/context, self-asserted display name, comment text, safe anchor geometry, resolved metadata where supported, and timestamps.
7. Do not collect screenshots, page HTML, form values, cookies, credentials, console output, analytics, or network traffic.

A review URL is a bearer capability: anyone holding it may read and add feedback to that session. Use synthetic/prototype data. Reviewer names are not authenticated identities.

Stop at any account, login, infrastructure, or company-authorization boundary required to create or change the shared service.
