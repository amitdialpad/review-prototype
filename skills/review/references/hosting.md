# Shared comment hosting

The visual layer may be static, but comments shared between people require a reachable write service. GitHub Pages and browser localStorage alone cannot provide that.

## Dialpad service

Use the Dialpad-owned Review Prototype deployment configured for the target preview repository. Do not silently fall back to a personal deployment. The current Beacon integration passes the service origin through `VITE_DESIGN_REVIEW_API_URL`.

The exact allowed prototype origin must be configured on the service. For Beacon, that origin is `https://beacon-test.dialpad.design`.

## Before calling a link ready

1. Confirm the preview build received the hosted API origin rather than a local endpoint.
2. Confirm the exact deployed prototype origin is allowed by CORS; never use `*`.
3. Confirm health and both GET and POST from the real preview origin.
4. Confirm a comment written in a separate reviewer context appears in the owner's inbox after refresh.
5. Confirm session IDs are unguessable, inputs are bounded, writes are rate-limited, and records expire.
6. Store only project/session IDs, route/context, self-asserted display name, comment text, safe anchor geometry, resolved metadata where supported, and timestamps.
7. Do not collect screenshots, page HTML, form values, cookies, credentials, console output, analytics, or network traffic.

A review URL is a bearer capability: anyone holding it may read and add feedback to that session. Use synthetic/prototype data. Reviewer names are not authenticated identities.

Stop at any account, login, infrastructure, or company-authorization boundary required to create or change the shared service.
