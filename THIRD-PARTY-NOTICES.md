# Third-party notices

Eisballi's Markdown Viewer is distributed under the MIT license (see `LICENSE`).
It bundles or builds upon the following third-party components. All of them are
compatible with an MIT-licensed application; none is copyleft-only.

## Runtime

| Component | Version | License | Usage |
| --- | --- | --- | --- |
| [Electron](https://www.electronjs.org/) | 45.x | MIT | Application runtime (Chromium + Node.js) |
| [marked](https://github.com/markedjs/marked) | 18.x | MIT | Markdown parsing |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.x | Apache-2.0 OR MPL-2.0 | Sanitizing rendered HTML |

The vendored copies in `src/renderer/vendor/` keep their original license headers.
Chromium and its dependencies are documented by Electron in
`LICENSES.chromium.html`, which ships with every build.

## Development only (not shipped)

| Component | License | Usage |
| --- | --- | --- |
| [electron-builder](https://www.electron.build/) | MIT | Packaging installers and Linux packages |

Development dependencies are only used to build and package the app; they are not
included in the installers.

## Fonts

No fonts are bundled. The UI uses the system font stack
(`Segoe UI`, `Inter`, `Ubuntu`, `Helvetica Neue`, `system-ui`) and, for code, the system
monospace stack (`Cascadia Mono`, `JetBrains Mono`, `Consolas`, `DejaVu Sans Mono`).

## Assets

The koala logo (`build/logo-source.png`, generated icons, `src/renderer/assets/`) is a
project asset of Eisballi. It is not covered by the MIT license and may not be reused
without permission.
