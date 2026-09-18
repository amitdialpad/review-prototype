# Security

Please report vulnerabilities privately to the repository owner through GitHub's private vulnerability reporting when
available. Do not put secrets or exploit details in a public issue.

Deployment owners should:

- allow only exact trusted website origins;
- keep the default bounded request sizes, rate limits, session cap, and 90-day expiry;
- never put Cloudflare or GitHub secrets in browser configuration;
- treat review URLs as bearer capabilities and rotate to a new session if a link is exposed;
- use review mode only with prototype or synthetic data.

The service intentionally has no reviewer accounts. This keeps customer review frictionless, but it also means a
display name is self-asserted and the shared URL controls access.
