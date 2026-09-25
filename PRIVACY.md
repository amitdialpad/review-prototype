# Privacy

Review Prototype is deliberately data-minimal.

The shared service stores:

- a random review-session identifier and non-secret project identifier;
- the current prototype route/context;
- the reviewer's display name and comment;
- normalized marker or selection coordinates and a short element label;
- open/Done status with its resolved timestamp;
- created and expiry timestamps.

It does not collect screenshots, page HTML, form contents, credentials, cookies, console output, analytics, or network
traffic. The included deployment retains comments for 90 days, excludes expired records from reads, and permanently
deletes expired records daily.

The person deploying the Netlify site controls the Blobs store and allowed website origins. The session URL is a capability:
anyone with that URL can read and add comments. Do not place confidential information in a review.

Done state is written to the shared service so every reviewer and the prototype owner sees the same history. The
remembered reviewer name stays only in the current browser's local storage.
