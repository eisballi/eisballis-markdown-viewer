# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [1.0.0], 2026-10-28

### Added

- Markdown viewer with rendered GitHub-Flavored Markdown (tables, task lists, code, quotes).
- Plain text editor with line numbers; changed lines are highlighted in orange.
- Split view with a single divider: editor left, preview right, both panes scroll together.
- Resizable text width (view: right edge, edit: both edges, double-click resets).
- Continuous zoom (`Ctrl` + mouse wheel) and independent text size (`A−` / `A+`).
- Dark and light theme, dark by default.
- English and German UI with a language dropdown, English by default.
- Open, save and save as, drag & drop, remembers the last folder and window bounds.
- Update check against GitHub releases (with release-page fallback) or a local git upstream,
  including silent installer start and restart.
- Windows installer (NSIS) and portable EXE, Linux AppImage and `.deb`,
  all registering `.md`, `.markdown` and `.mdown`.
- Unit tests for the string catalogs and update logic, end-to-end tests driving the real app.

[1.0.0]: https://github.com/Eisballi/eisballis-markdown-viewer/releases/tag/v1.0.0
