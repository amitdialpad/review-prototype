# Privacy

Review Prototype is deliberately data-minimal.

The shared service stores:

- a random review-session identifier and non-secret project identifier;
- the current prototype route/context;
- the reviewer's display name and comment;
- normalized marker or selection coordinates and a short element label;
- created and expiry timestamps.

It does not collect screenshots, page HTML, form contents, credentials, cookies, console output, analytics, or network
traffic. The included deployment retains comments for 90 days, excludes expired records from reads, and permanently
deletes expired records daily.

The person deploying the Worker controls the database and allowed website origins. The session URL is a capability:
anyone with that URL can read and add comments. Do not place confidential information in a review.

Done state and the remembered reviewer name stay in the current browser's local storage. They are not written to the
shared service.
