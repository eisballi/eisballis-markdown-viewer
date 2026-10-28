# Contributing

Thanks for taking a look! This project intentionally stays small, so please keep
changes focused.

## Getting started

```bash
npm ci
npm start          # runs the app
npm test           # unit + end-to-end tests
```

## Rules of the road

* **Code and documentation are in English.** The German translation lives only in
  `src/shared/strings.js` (the `de` catalog) and must stay complete.
* **No new runtime dependencies.** The renderer bundles only `marked` and `DOMPurify`.
  If you really need something, explain why in the pull request.
* **Keep the UI as is** unless the change explicitly targets it: dark first, view first,
  one divider in split mode, one scrollbar per pane.
* **No duplicated helpers.** Extend the existing function instead of adding a second one.
* Add or update tests for behaviour changes (`test/unit` or `test/e2e`).
* Keep user-facing text out of the code, add a key to both catalogs instead.

## Formatting

* 2 spaces, single quotes, semicolons, roughly 100 columns per line.
* Comments only where the code is not obvious.
* CSS custom properties for anything that the renderer changes at runtime
  (`--content-width`, `--edit-pad-*`, `--md-size`, …).

## Pull requests

1. Describe what changes for the user and why.
2. Make sure `npm test` passes.
3. Mention any UI screenshot-worthy change with a short before/after note.

## Releasing

Maintainers follow [docs/RELEASE.md](docs/RELEASE.md).
