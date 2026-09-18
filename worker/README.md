# Comment service

This Worker is the shared transport for Review Prototype. It accepts comments only from the exact origins configured
in `wrangler.jsonc`, rate-limits writes per review session, caps active comments, and stores bounded fields in D1.

Comments expire after 90 days. Reads always exclude expired records; the `17 3 * * *` Cron Trigger permanently deletes
expired rows and old rate-limit counters each day.

The service intentionally has no user accounts. A random review-session URL is the access capability, which keeps
customer review frictionless but makes the link inappropriate for confidential material.
