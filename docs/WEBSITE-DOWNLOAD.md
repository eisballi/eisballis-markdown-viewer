# Download section for eisballi.com

The release workflow uploads stable aliases next to the versioned files, so the website can
use permanent links that always resolve to the newest release.

## Stable URLs

| Platform | Link |
| --- | --- |
| Windows installer | <https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest/download/Eisballis-Markdown-Viewer-Setup.exe> |
| Windows portable | <https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest/download/Eisballis-Markdown-Viewer-portable.exe> |
| Linux AppImage | <https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest/download/Eisballis-Markdown-Viewer-x86_64.AppImage> |
| Debian / Ubuntu | <https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest/download/Eisballis-Markdown-Viewer-amd64.deb> |
| All files and notes | <https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest> |

These links only work after the first tagged release has been published.

## Ready-to-paste HTML

```html
<section class="downloads">
  <h2>Eisballi's Markdown Viewer</h2>
  <p>Lightweight Markdown viewer and editor for Windows and Linux.</p>

  <p>
    <a class="button" href="https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest/download/Eisballis-Markdown-Viewer-Setup.exe">
      Download for Windows (.exe)
    </a>
    <a class="button secondary" href="https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest/download/Eisballis-Markdown-Viewer-portable.exe">
      Portable version
    </a>
  </p>

  <p>
    <a class="button" href="https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest/download/Eisballis-Markdown-Viewer-x86_64.AppImage">
      Download for Linux (AppImage)
    </a>
    <a class="button secondary" href="https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest/download/Eisballis-Markdown-Viewer-amd64.deb">
      Debian / Ubuntu (.deb)
    </a>
  </p>

  <p class="muted">
    Requires Windows 10 or later, or a current Ubuntu/Debian with a desktop environment.
    <a href="https://github.com/Eisballi/eisballis-markdown-viewer/releases/latest">All versions and release notes</a>
  </p>
</section>
```

## Notes

* Markdown files can be associated with the app during setup (`Open with` →
  “Choose another app” → *Eisballi's Markdown Viewer*). On Linux the `.deb` registers
  `text/markdown` automatically.
* The installer is currently unsigned. Browsers may show a SmartScreen hint on first
  download; code signing can be added later without changing these links.
* Updates are delivered in-app: the app asks before installing a newer release, so the
  website does not need a separate version manifest.
