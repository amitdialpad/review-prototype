# Beacon PR-preview publishing

Use this reference only for work in the Dialpad design repository whose review surface belongs on Beacon.

## Target

Publish through the repository's existing Beacon PR-preview workflows. The canonical base is:

`https://beacon-test.dialpad.design/pr-preview-<PR>/`

Derive `<PR>` from the current branch's actual draft/open pull request. Never reuse a remembered PR number without checking.

## Required behavior

1. Inspect the current worktree, branch, upstream, PR state, preview workflows, base-path handling, and unrelated changes.
2. Keep review/prototype work on a dedicated branch and normally use a draft PR. Do not merge unless the owner explicitly changes the mode.
3. Preserve the repository's existing Beacon build and preview-deploy workflow. Do not create a parallel frontend host.
4. Ensure the preview build uses its `/pr-preview-<PR>/` base path and that route navigation/assets respect it.
5. When contextual comments are enabled, use the Dialpad designer-pilot service from
   [hosting.md](hosting.md). The API origin is public configuration and may be set directly in the review-only
   integration or passed through the repository's established environment configuration.
6. Wait for the preview build and deploy to finish. Use the deployed workflow output or PR comment to establish the exact base URL.
7. Verify the full requested route beneath the preview prefix. A successful root page or HTTP 200 is insufficient.
8. Expect company access controls. Label links `Dialpad login required` when Google/IAP protects the preview.

## Evidence

For a complete check, inspect the rendered route, current hosted HTML, main bundle, route chunk/assets, expected copy/state, and review controls. Separate inherited lint-warning budgets from new errors; do not broaden a review PR into repository cleanup.

## URL handling

- Use history routes beneath the preview prefix, for example: `https://beacon-test.dialpad.design/pr-preview-120/settings/billing/summary`.
- Preserve the prefix during navigation and when generating review URLs.
- Put scenario/query parameters before or alongside the generated `review` token.
- Show the complete raw URL in the handoff; do not hide it behind labels such as `preview` or `PR 120`.
