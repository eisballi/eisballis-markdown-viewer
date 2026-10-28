# Release process

This checklist keeps the app, the GitHub release and the download links on
eisballi.com in sync.

## 1. Prepare the version

1. Update `version` in `package.json` (for example `1.0.1`).
2. Add an entry to `CHANGELOG.md`.
3. Run the test suite:

   ```bash
   npm test
   ```

## 2. Build locally (optional sanity check)

```bash
npm run dist:win      # Windows
npm run dist:linux    # Linux or WSL
```

Artifacts land in `release/`:

| File | Purpose |
| --- | --- |
| `Eisballis-Markdown-Viewer-Setup-<version>.exe` | Windows installer (NSIS) |
| `Eisballis-Markdown-Viewer-<version>-portable.exe` | Windows portable build |
| `Eisballis-Markdown-Viewer-<version>-x86_64.AppImage` | Linux AppImage |
| `Eisballis-Markdown-Viewer-<version>-amd64.deb` | Debian/Ubuntu package |

## 3. Publish

```bash
git commit -am "Release 1.0.1"
git tag v1.0.1
git push origin main --tags
```

The workflow `.github/workflows/release.yml` then:

1. runs the tests,
2. builds Windows and Linux artifacts,
3. creates the GitHub release for the tag,
4. uploads the versioned files **and** the stable aliases
   (`...-Setup.exe`, `...-portable.exe`, `...-x86_64.AppImage`, `...-amd64.deb`),
   which the website links to.

## 4. Verify

- Open the release on GitHub and check that all eight files are attached.
- Install the previous version, start it and press **Check for updates**
  it must offer the new version and install it.
- Download the stable links used on the website (`docs/WEBSITE-DOWNLOAD.md`).

## Version numbers and the updater

The in-app updater compares the installed version with the newest GitHub release tag.
Only **numerically higher** versions are offered, so always bump `package.json`
before tagging. Tags must be `v<major>.<minor>.<patch>`.
