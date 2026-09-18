# Contributing

Thank you for helping make prototype feedback easier.

1. Fork the repository and create a focused branch.
2. Run `npm install`, `npm test`, and `npm run build`.
3. Keep the widget framework-neutral and dependency-light.
4. Do not add analytics, screenshots, DOM capture, console collection, network inspection, or production authentication
   data.
5. Include tests for behavioral changes and explain the reviewer-facing effect in the pull request.

Design principles:

- The reviewer should only need a link and their name.
- Clicking and dragging should open the same small composer immediately.
- Review UI must not alter the underlying prototype unless comment mode is active.
- Resolved feedback remains visible in the inbox as Done.
- Accessibility, light/dark contrast, and keyboard behavior are product requirements.

By contributing, you agree that your contribution is licensed under the MIT License.
