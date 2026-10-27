# Beispiel-Dokument

Willkommen beim **Eisballis Markdown Viewer**. Diese Datei zeigt, was der Viewer kann.

## Text & Formatierung

Normaler Text mit *kursiven*, **fetten** und `Inline-Code`-Abschnitten.
Ein [Link zu GitHub](https://github.com) öffnet sich im Standardbrowser.

> Ein Zitat zeigt sich mit farbigem Balken – gut lesbar in Dark und Light.

## Listen

- Ein Punkt
- Noch ein Punkt
  - Unterpunkt
1. Erster Schritt
2. Zweiter Schritt

- [x] Ansicht prüfen
- [ ] Eigene Datei öffnen
- [ ] Textbreite mit dem Griff am rechten Rand ziehen

## Tabelle

| Modus | Tastenkürzel | Beschreibung |
| --- | --- | --- |
| Ansicht | `Strg+1` | Nur gerendertes Markdown |
| Bearbeiten | `Strg+2` | Nur Texteditor |
| Geteilt | `Strg+3` | Editor links, Vorschau rechts |

## Code

```js
const viewer = {
  theme: 'dark',
  mode: 'view',
  zoom: 1,
};
console.log('Hallo Markdown', viewer);
```

## Bild

![App-Icon](../build/icons/256x256.png)

## Trennlinie

---

Zuletzt geändert: heute.
