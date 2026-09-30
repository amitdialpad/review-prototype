# Review manifest

Use `review-prototype.json` at the relevant application root so repeated review rounds share stable route metadata. Create and maintain it for the prototype owner.

```json
{
  "version": 1,
  "name": "Resolve Receptionist billing",
  "projectId": "resolve-receptionist-billing",
  "router": "history",
  "reviewParam": "review",
  "routes": [
    {
      "label": "Credits & Usage",
      "path": "/settings/billing/credits-usage",
      "query": { "scene": "credits-low-auto-recharge-off" }
    }
  ]
}
```

Rules:

- `version` is `1`.
- `name` identifies the review round in human language.
- `projectId` is stable and non-secret, using letters, numbers, `.`, `_`, or `-`.
- `router` is `history` or `hash`.
- `reviewParam` defaults to `review`.
- `routes` contains the main shareable sections, not every test state.
- Each route has a concise `label`, absolute application `path`, and optional string-valued `query` object.
- Use the same project ID and router mode as the installed comment layer.
- Never store a session token, preview number, hostname, secret, reviewer name, or credential in the manifest.

Generate links only after the deployed preview base is known:

```bash
python3 <skill-dir>/scripts/generate_review_links.py \
  --manifest <app>/review-prototype.json \
  --base-url <deployed-preview-base>
```

Use `--session <token>` only to intentionally reproduce an existing round, and `--format json` for machine-readable output.
