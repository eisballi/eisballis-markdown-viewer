# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately via
GitHub's [private vulnerability reporting](https://github.com/Eisballi/eisballis-markdown-viewer/security/advisories/new)
or by e-mail to the address in `package.json`.

You can expect an acknowledgement within a few days. Please include the version,
platform and a short reproduction.

## Design notes

* The renderer runs with `contextIsolation: true`, `nodeIntegration: false` and
  `sandbox: true`; all file and system access goes through the preload API.
* Rendered Markdown is sanitized with DOMPurify before it is inserted into the DOM.
* External links are opened with the system browser after the protocol is checked
  (`http`, `https`, `mailto` only).
* Update downloads come exclusively from the project's own GitHub releases; the URL is
  taken from the release metadata, not from the document.
* Documents are only read from paths the user chose (dialog, argument or drag & drop).
