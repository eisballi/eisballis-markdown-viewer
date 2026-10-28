# Eisballi's Markdown Viewer

A deliberately small Markdown viewer with a plain text editor for **Windows** and **Linux (Ubuntu)**.
It starts in **dark mode** and **view mode**, so a document is readable right away – no clicking around.

![App icon](build/icons/256x256.png)

## Features

| Area | Details |
| --- | --- |
| Toolbar | Open · Save · Save as · View · Edit · Split · Text size ± · Light/dark · Check for updates · GitHub · eisballi.com · Language (EN/DE) |
| View | Rendered Markdown (GFM: tables, task lists, code, quotes) |
| Edit | Plain text editor centered in the text column with **line numbers**; changed line numbers are **orange**; width adjustable from both edges |
| Split | Editor left, preview right (preview reaches the window edge) – the single divider is the drag handle for the width, both panes scroll together |
| Text width | View: drag the right edge of the column · Edit: drag either edge · double-click a grip to reset |
| Zoom | `Ctrl` + mouse wheel scales the document (text, images, spacing) from 50–300 %; the toolbar and the base font size stay unchanged |
| Text size | `A−` / `A+` or `Ctrl` + `-` / `Ctrl` + `+` sets the base font size; zoom scales on top of it |
| Files | Open, save, save as, drag & drop, remembers the last folder |
| Language | Dropdown in the toolbar: **English (default)** or **Deutsch**, also available in the menu |
| Updates | Checks GitHub releases **or** local git changes, asks before installing |
| Default app | `.md`, `.markdown`, `.mdown` – the Windows installer and the Linux package register the association |

Everything is stored locally (`config.json` in the user data directory): theme, language,
text size, text width, split ratio, zoom and window bounds.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / save as |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | View / Edit / Split |
| `Ctrl+D` | Toggle light/dark |
| `Ctrl` + mouse wheel | Zoom |
| `Ctrl` + `+` / `-` / `0` | Text size up / down / reset |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | Bold / italic / link (in the editor) |
| `Tab` | Insert two spaces |

## Run from source

Requirements: Node.js ≥ 20.

```bash
npm ci
npm start                                    # app with an empty document
npx electron . examples/sample.md            # open a file directly
```

`npm start` copies `marked` and `DOMPurify` into `src/renderer/vendor/` beforehand.

## Tests

```bash
npm test           # unit + end-to-end
npm run test:unit  # string catalogs and update logic
npm run test:e2e   # starts the real app and drives it via the DevTools protocol
```

The end-to-end suite launches Electron with an isolated profile (`EISBALLI_USER_DATA`),
opens `test/fixtures/sample.md` and verifies modes, layout, line numbers, scroll sync,
language switching, text size and saving. On Linux CI it needs a display (`xvfb-run`).

## Build

```bash
npm run dist:win     # Windows: NSIS installer + portable EXE   -> release/
npm run dist:linux   # Linux: AppImage + .deb                   -> release/
```

* **Windows** builds natively with electron-builder:
  `Eisballis-Markdown-Viewer-Setup-<version>.exe` (installs, registers the file
  associations, optional "open with" entry) and a portable EXE.
* **Linux** must be built on Linux because of the AppImage tooling. On Windows, WSL works:

  ```bash
  wsl -d Ubuntu bash -lc "cd /mnt/c/path/to/eisballis-markdown-viewer && npm ci && npm run dist:linux"
  ```

  Install the `.deb` with `sudo apt install ./Eisballis-Markdown-Viewer-<version>-amd64.deb`,
  or `chmod +x` the AppImage and run it. Afterwards the app can be picked as the
  default Markdown handler in the system settings.

Icons are generated from `build/logo-source.png` with `npm run icons` (Python + Pillow).
Replace that file and re-run the command to use a different app icon.

## Update check

The **Check for updates** button (and a silent check ~10 s after start) uses two sources:

1. **GitHub releases** of the repository from `package.json` – when a newer release exists
   the app asks *"Version X is available … update now?"*. After the download the Windows
   setup runs silently, the app quits and restarts. On Linux the new AppImage or `.deb` is started.
2. **Local git repository** (fallback, e.g. a developer checkout): runs `git fetch` and
   reports new commits on the upstream branch.

See [docs/RELEASE.md](docs/RELEASE.md) for the release process. Set
`EISBALLI_UPDATE_REPO=owner/repo` to override the update source, and `devRepoPath` in
`config.json` to point a checkout at a specific clone.

## Architecture

* Electron (Chromium + Node) with no runtime dependencies besides `marked` and `DOMPurify`,
  both shipped as vendor files in the renderer.
* `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; all file and system
  access goes through a small preload API.
* Rendered Markdown is sanitized with DOMPurify; external links open in the default browser.
* UI strings live in `src/shared/strings.js` and are shared by the main and renderer process.

## Known build notes

These are expected and harmless:

* `npm ci` reports deprecation notices for `glob@7`, `rimraf@2`, `inflight` and `boolean`.
  They come from **electron-builder's own dependencies** (development only) and are not
  part of the shipped app. They disappear once electron-builder updates its tree.
* electron-builder logs “no node modules found in collection” because the app has no
  runtime dependencies – `marked` and `DOMPurify` are vendored into `src/renderer/vendor/`.
* “no code signing certificate configured” appears until a certificate is added; see
  [docs/RELEASE.md](docs/RELEASE.md).
* For `node_modules`, remember to run `npm install` before `npm start`; `sync-vendor` is part of
  the start/test/build scripts.

## License and assets

Source code: [MIT](LICENSE). Third-party components: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

The koala logo (`build/logo-source.png`, `build/icon.*`, `src/renderer/assets/`) is a project
asset of Eisballi and is **not** covered by the MIT license.
