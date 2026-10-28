# Eisballi's Markdown Viewer

Ein bewusst **schlanker** Markdown-Viewer mit einfachem Editor für **Windows** und **Linux (Ubuntu)**.
Standardmäßig startet die App im **Dark Mode** und im **Ansichtsmodus** – also sofort lesbar, ohne Klick.

![App-Icon](build/icons/256x256.png)

## Funktionen

| Bereich | Details |
| --- | --- |
| Oberste Leiste | Öffnen · Speichern · Speichern unter · Ansicht · Bearbeiten · Geteilt · Textgröße ± · Hell/Dunkel · Nach Updates suchen · GitHub · eisballi.com · Sprache (EN/DE) |
| Ansicht | Markdown gerendert (GFM: Tabellen, Aufgabenlisten, Code, Zitate) |
| Bearbeiten | Texteditor mittig in der Textspaltenbreite, mit **Zeilennummern**; geänderte Zeilennummern sind **orange** markiert; Breite über die Griffe an beiden Kanten ziehbar |
| Geteilt | Editor links, Vorschau rechts (Vorschau reicht bis zum Fensterrand) – die mittlere Trennlinie ist der Zieh-Griff für die Breite, beide Bereiche scrollen synchron |
| Textbreite | Ansicht: rechter Rand der Textspalte ziehbar · Bearbeiten: beide Kanten · Doppelklick auf einen Griff setzt zurück |
| Zoom | `Strg` + Mausrad zoomt die gesamte Oberfläche stufenlos (50–300 %) |
| Textgröße | `A−` / `A+` bzw. `Strg` + `-` / `Strg` + `+`, unabhängig vom Zoom |
| Dateien | Öffnen/Speichern/Speichern unter, Drag & Drop, „zuletzt geöffneter Ordner“ |
| Sprache | Dropdown in der Leiste: **English (Standard)** oder **Deutsch**, auch über das Menü |
| Update | Prüft GitHub-Releases **oder** lokale Git-Änderungen, fragt vor der Installation nach |
| Standardprogramm | `.md`, `.markdown`, `.mdown` – Windows-Installer und Linux-Paket registrieren die Zuordnung |

Alles wird lokal gespeichert (`config.json` im Benutzer-Datenverzeichnis): Theme, Sprache,
Textgröße, Textbreite, Split-Verhältnis, Zoom und Fenstergröße.

## Tastenkürzel

| Kürzel | Aktion |
| --- | --- |
| `Strg+O` | Öffnen |
| `Strg+S` / `Strg+Shift+S` | Speichern / Speichern unter |
| `Strg+1` / `Strg+2` / `Strg+3` | Ansicht / Bearbeiten / Geteilt |
| `Strg+D` | Hell/Dunkel umschalten |
| `Strg` + Mausrad | Zoom |
| `Strg` + `+` / `-` / `0` | Textgröße ändern / zurücksetzen |
| `Strg+B` / `Strg+I` / `Strg+K` | Fett / Kursiv / Link (im Editor) |
| `Tab` | Zwei Leerzeichen einfügen |

## Entwicklung

Voraussetzungen: Node.js ≥ 20.

```bash
npm install
npm start          # App lokal starten
```

`npm start` kopiert vorher `marked` und `DOMPurify` nach `src/renderer/vendor/`.
Beim Entwickeln lässt sich eine Datei direkt übergeben: `npx electron . beispiel.md`.

## Builds erzeugen

```bash
npm run dist:win     # Windows: NSIS-Installer + portable EXE  -> release/
npm run dist:linux   # Linux: AppImage + .deb                  -> release/
```

* **Windows** wird nativ gebaut (electron-builder, NSIS). Ergebnis:
  `Eisballis-Markdown-Viewer-Setup-<version>.exe` (Installation + Dateizuordnung,
  optionaler Standard-Haken für `.md`) und eine portable EXE (ohne Installation).
* **Linux** muss auf Linux gebaut werden (AppImage-Werkzeuge). Unter Windows geht das z. B. in WSL:

  ```bash
  wsl -d Ubuntu bash -lc "cd /mnt/c/Users/<user>/.../eisballis-markdown-viewer && npm install && npm run dist:linux"
  ```

  Das `.deb` installiert sich mit `sudo dpkg -i Eisballis-Markdown-Viewer-<version>-x64.deb`,
  die `.AppImage` läuft nach `chmod +x` direkt. Danach lässt sich die App in den
  Systemeinstellungen als Standard für Markdown wählen.

Die Icons werden aus `build/logo-source.png` erzeugt mit `npm run icons` (Python + Pillow).
Diese Datei austauschen und den Befehl erneut ausführen, um ein anderes App-Icon zu setzen.

## Update-Prüfung

Der Button **„Nach Updates suchen“** (und ein stiller Check ~10 s nach dem Start) nutzt zwei Quellen:

1. **GitHub-Releases** des Repositorys aus `package.json` (`repository.url`) –
   ist ein neueres Release vorhanden, fragt die App:
   *„Version X ist verfügbar … Möchtest du jetzt aktualisieren?“*
   Nach dem Download startet unter Windows der Setup-Installer still, die App wird beendet
   und anschließend automatisch neu gestartet. Unter Linux wird die neue AppImage/.deb gestartet.
2. **Lokales Git-Repository** (Fallback, z. B. Entwickler-Checkout): Die App führt
   `git fetch` aus und meldet neue Commits im Upstream-Branch.

### Ein Update veröffentlichen

1. `package.json` → `"version"` erhöhen (z. B. `1.0.1`).
2. Tag setzen und pushen: `git tag v1.0.1 && git push origin v1.0.1`.
3. Die GitHub-Action `.github/workflows/build.yml` baut Windows- und Linux-Artefakte und
   hängt sie an das Release. Fertig – installierte Apps finden das Update.

Ohne veröffentlichtes Release meldet die App „Keine Update-Quelle gefunden“ – das ist erwartet.
Alternativ lässt sich die Update-Quelle per Umgebungsvariable `EISBALLI_UPDATE_REPO=owner/repo`
übersteuern; für einen Entwickler-Checkout kann in der `config.json` zusätzlich
`"devRepoPath": "C:/pfad/zum/repo"` gesetzt werden.

## Technik

* Electron (Chromium + Node) – keine weiteren Laufzeit-Abhängigkeiten außer `marked` und `DOMPurify`,
  beide werden als schlanke Vendor-Dateien in den Renderer kopiert.
* `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; alle Datei- und
  Systemzugriffe laufen über eine schmale Preload-API.
* Gerendertes Markdown wird mit DOMPurify bereinigt, externe Links öffnen im Standardbrowser.
* Windows-Installer: NSIS über electron-builder (Dateizuordnung, Startmenü, Desktop-Verknüpfung).
* Linux: AppImage + Debian-Paket mit `.desktop`-Eintrag und MIME-Typen.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
