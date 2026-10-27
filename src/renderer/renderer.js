'use strict';

(() => {
  const api = window.api;

  const el = {
    open: document.getElementById('btn-open'),
    save: document.getElementById('btn-save'),
    modeGroup: document.getElementById('mode-group'),
    fontDec: document.getElementById('btn-font-dec'),
    fontInc: document.getElementById('btn-font-inc'),
    fontSizeLabel: document.getElementById('font-size-label'),
    theme: document.getElementById('btn-theme'),
    resetWidth: document.getElementById('btn-reset-width'),
    update: document.getElementById('btn-update'),
    updateBadge: document.getElementById('update-badge'),
    about: document.getElementById('btn-about'),
    workspace: document.getElementById('workspace'),
    editorPane: document.getElementById('editor-pane'),
    editor: document.getElementById('editor'),
    splitter: document.getElementById('splitter'),
    previewPane: document.getElementById('preview-pane'),
    previewScroll: document.getElementById('preview-scroll'),
    preview: document.getElementById('preview'),
    widthHandle: document.getElementById('width-handle'),
    emptyState: document.getElementById('empty-state'),
    statusFile: document.getElementById('status-file'),
    statusMeta: document.getElementById('status-meta'),
    statusUpdate: document.getElementById('status-update'),
    statusZoom: document.getElementById('status-zoom'),
    statusVersion: document.getElementById('status-version'),
    dropOverlay: document.getElementById('drop-overlay'),
  };

  const MIN_TEXT_SIZE = 11;
  const MAX_TEXT_SIZE = 30;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;
  const DEFAULT_WIDTH = 800;
  const MIN_WIDTH = 380;
  const DEFAULT_SPLIT = 0.5;

  const state = {
    appInfo: { version: '0.0.0', platform: 'win32' },
    filePath: null,
    baseUrl: null,
    fileName: null,
    dirty: false,
    mode: 'view',
    theme: 'dark',
    textSize: 17,
    contentWidth: DEFAULT_WIDTH,
    splitRatio: DEFAULT_SPLIT,
    zoom: 1,
    pendingUpdate: null,
    updateBusy: false,
  };

  let renderTimer = null;
  let statusTimer = null;
  let metaTimer = null;

  /* ------------------------------------------------------------ rendering */

  const slugCounts = new Map();

  function slugify(text) {
    const base = String(text)
      .toLowerCase()
      .replace(/[`*_~[\]()#!]/g, '')
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-') || 'abschnitt';
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  }

  const SANITIZE_CONFIG = {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  };

  function resolveRelativeUrl(raw, baseUrl) {
    if (!raw || !baseUrl) return raw;
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(raw)) return raw;
    try {
      return new URL(raw, baseUrl).href;
    } catch {
      return raw;
    }
  }

  function render() {
    const source = el.editor.value;
    if (!source.trim()) {
      el.preview.innerHTML = '';
      updateEmptyState();
      return;
    }

    slugCounts.clear();
    let html = '';
    try {
      html = marked.parse(source, { gfm: true, breaks: false, async: false });
    } catch (error) {
      el.preview.textContent = `Markdown konnte nicht dargestellt werden: ${error.message}`;
      return;
    }

    el.preview.innerHTML = DOMPurify.sanitize(html, SANITIZE_CONFIG);

    for (const heading of el.preview.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      heading.id = slugify(heading.textContent || '');
    }

    for (const image of el.preview.querySelectorAll('img')) {
      const src = image.getAttribute('src');
      if (src) image.setAttribute('src', resolveRelativeUrl(src, state.baseUrl));
    }

    for (const anchor of el.preview.querySelectorAll('a')) {
      const href = anchor.getAttribute('href');
      if (!href) continue;
      if (/^https?:/i.test(href)) anchor.setAttribute('rel', 'noreferrer');
      else anchor.setAttribute('href', resolveRelativeUrl(href, state.baseUrl));
    }

    for (const box of el.preview.querySelectorAll('input[type="checkbox"]')) box.disabled = true;

    updateEmptyState();
    queueHandlePosition();
  }

  function scheduleRender(delay = 220) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay);
  }

  function updateEmptyState() {
    const hasContent = Boolean(state.filePath || el.editor.value.trim());
    el.emptyState.hidden = hasContent;
  }

  /* ------------------------------------------------------------- file ops */

  function updateTitle() {
    const name = state.fileName || (state.filePath ? 'Markdown' : 'Unbenannt');
    const title = `${state.dirty ? '• ' : ''}${name} – Eisballis Markdown Viewer`;
    document.title = title;
    api.setTitle(title);
    el.statusFile.textContent = state.filePath || 'Keine Datei geöffnet';
    el.statusFile.title = state.filePath || '';
    el.statusFile.classList.toggle('dirty', state.dirty);
  }

  function setDirty(value) {
    if (state.dirty === value) return;
    state.dirty = value;
    api.setDirty(value);
    updateTitle();
  }

  function loadFile(file) {
    state.filePath = file.path;
    state.fileName = file.name;
    state.baseUrl = file.baseUrl;
    el.editor.value = file.content ?? '';
    setDirty(false);
    updateTitle();
    updateMeta();
    updateEmptyState();
    render();
  }

  async function openFile(filePath) {
    if (!(await confirmDiscardChanges('Öffnen'))) return;
    try {
      const file = await api.openFile(filePath);
      if (!file) return;
      loadFile(file);
      setStatus(`Geöffnet: ${file.name}`);
    } catch (error) {
      api.message({ type: 'error', message: 'Datei konnte nicht geöffnet werden', detail: error.message });
    }
  }

  async function confirmDiscardChanges(action) {
    if (!state.dirty) return true;
    const choice = await api.confirm({
      message: 'Ungespeicherte Änderungen',
      detail: `Das aktuelle Dokument enthält ungespeicherte Änderungen. Vor „${action}“ speichern?`,
      buttons: ['Speichern', 'Verwerfen', 'Abbrechen'],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice === 0) return save();
    if (choice === 1) return true;
    return false;
  }

  async function save() {
    if (!state.filePath) return saveAs();
    try {
      const result = await api.saveFile({ filePath: state.filePath, content: el.editor.value });
      if (!result) return false;
      state.fileName = result.name;
      setDirty(false);
      updateMeta();
      setStatus('Gespeichert');
      return true;
    } catch (error) {
      api.message({ type: 'error', message: 'Speichern fehlgeschlagen', detail: error.message });
      return false;
    }
  }

  async function saveAs() {
    try {
      const result = await api.saveFileAs({
        content: el.editor.value,
        suggestedName: state.fileName || 'unbenannt.md',
      });
      if (!result) return false;
      state.filePath = result.path;
      state.fileName = result.name;
      state.baseUrl = result.baseUrl;
      setDirty(false);
      updateTitle();
      updateMeta();
      setStatus('Gespeichert');
      return true;
    } catch (error) {
      api.message({ type: 'error', message: 'Speichern fehlgeschlagen', detail: error.message });
      return false;
    }
  }

  /* ---------------------------------------------------------------- status */

  function setStatus(text, timeout = 5000) {
    clearTimeout(statusTimer);
    el.statusUpdate.hidden = false;
    el.statusUpdate.textContent = text;
    if (timeout) {
      statusTimer = setTimeout(() => {
        el.statusUpdate.hidden = true;
        el.statusUpdate.textContent = '';
      }, timeout);
    }
  }

  function updateMeta() {
    const text = el.editor.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text ? text.split('\n').length : 0;
    el.statusMeta.textContent = `${words} Wörter · ${text.length} Zeichen · ${lines} Zeilen`;
  }

  function scheduleMeta() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(updateMeta, 300);
  }

  /* ------------------------------------------------------------ appearance */

  function applyTheme(theme, persist = true) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    el.theme.title = state.theme === 'dark' ? 'Zu hellem Modus wechseln (Strg+D)' : 'Zu dunklem Modus wechseln (Strg+D)';
    api.setTheme(state.theme);
    if (persist) api.updateSettings({ theme: state.theme });
  }

  function applyTextSize(size, persist = true) {
    state.textSize = Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, Math.round(size)));
    document.documentElement.style.setProperty('--md-size', `${state.textSize}px`);
    document.documentElement.style.setProperty('--editor-size', `${Math.round(state.textSize * 0.9)}px`);
    el.fontSizeLabel.textContent = String(state.textSize);
    if (persist) api.updateSettings({ textSize: state.textSize });
    queueHandlePosition();
  }

  function applyContentWidth(width, persist = true) {
    const paneWidth = el.previewPane.clientWidth || 800;
    const max = Math.max(MIN_WIDTH, paneWidth - 24);
    state.contentWidth = Math.min(max, Math.max(MIN_WIDTH, Math.round(width)));
    document.documentElement.style.setProperty('--content-width', `${state.contentWidth}px`);
    if (persist) api.updateSettings({ contentWidth: state.contentWidth });
    queueHandlePosition();
  }

  function applySplit(ratio, persist = true) {
    state.splitRatio = Math.min(0.8, Math.max(0.2, ratio));
    document.documentElement.style.setProperty('--split', `${state.splitRatio * 100}%`);
    if (persist) api.updateSettings({ splitRatio: state.splitRatio });
  }

  async function applyZoom(factor, persist = true) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(factor * 10) / 10));
    const applied = await api.zoom(next);
    state.zoom = applied || next;
    el.statusZoom.textContent = `${Math.round(state.zoom * 100)} %`;
    if (persist) api.updateSettings({ zoom: state.zoom });
    queueHandlePosition();
  }

  function setMode(mode, persist = true) {
    state.mode = ['view', 'edit', 'split'].includes(mode) ? mode : 'view';

    for (const button of el.modeGroup.querySelectorAll('.tb-btn')) {
      button.classList.toggle('is-active', button.dataset.mode === state.mode);
    }

    el.editorPane.hidden = state.mode === 'view';
    el.previewPane.hidden = state.mode === 'edit';
    el.splitter.hidden = state.mode !== 'split';

    if (state.mode !== 'edit') render();
    if (state.mode === 'edit') el.editor.focus();
    if (state.mode === 'split') {
      applySplit(state.splitRatio, false);
      el.editor.focus();
    }
    if (persist) api.updateSettings({ mode: state.mode });

    queueHandlePosition();
  }

  /* --------------------------------------------------------- width handle */

  function positionWidthHandle() {
    if (state.mode === 'edit') {
      el.widthHandle.hidden = true;
      return;
    }
    const previewRect = el.preview.getBoundingClientRect();
    const paneRect = el.previewPane.getBoundingClientRect();
    if (!previewRect.width || !paneRect.width) {
      el.widthHandle.hidden = true;
      return;
    }
    el.widthHandle.hidden = false;
    el.widthHandle.style.left = `${previewRect.right - paneRect.left}px`;
  }

  function queueHandlePosition(delay = 0) {
    requestAnimationFrame(() => {
      positionWidthHandle();
      requestAnimationFrame(() => positionWidthHandle());
    });
    if (delay) setTimeout(positionWidthHandle, delay);
  }

  function setupWidthHandle() {
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    el.widthHandle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startWidth = el.preview.getBoundingClientRect().width;
      el.widthHandle.classList.add('dragging');
      el.widthHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    el.widthHandle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const delta = (event.clientX - startX) * 2;
      applyContentWidth(startWidth + delta, false);
    });

    const stop = (event) => {
      if (!dragging) return;
      dragging = false;
      el.widthHandle.classList.remove('dragging');
      try {
        el.widthHandle.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
      api.updateSettings({ contentWidth: state.contentWidth });
    };

    el.widthHandle.addEventListener('pointerup', stop);
    el.widthHandle.addEventListener('pointercancel', stop);

    el.widthHandle.addEventListener('dblclick', () => {
      applyContentWidth(DEFAULT_WIDTH);
      setStatus('Textbreite zurückgesetzt');
    });
  }

  /* -------------------------------------------------------------- splitter */

  function setupSplitter() {
    let dragging = false;

    el.splitter.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      el.splitter.classList.add('dragging');
      el.splitter.setPointerCapture(event.pointerId);
      document.body.style.cursor = 'col-resize';
      event.preventDefault();
    });

    el.splitter.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const rect = el.workspace.getBoundingClientRect();
      applySplit((event.clientX - rect.left) / rect.width, false);
    });

    const stop = (event) => {
      if (!dragging) return;
      dragging = false;
      el.splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      try {
        el.splitter.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
      api.updateSettings({ splitRatio: state.splitRatio });
    };

    el.splitter.addEventListener('pointerup', stop);
    el.splitter.addEventListener('pointercancel', stop);
  }

  /* ------------------------------------------------------------------ links */

  function fileUrlToPath(url) {
    try {
      const parsed = new URL(url);
      let target = decodeURIComponent(parsed.pathname);
      if (/^\/[A-Za-z]:/.test(target)) target = target.slice(1);
      return target.replace(/\//g, pathSeparator());
    } catch {
      return url;
    }
  }

  function pathSeparator() {
    return state.appInfo.platform === 'win32' ? '\\' : '/';
  }

  function setupLinkHandling() {
    el.preview.addEventListener('click', async (event) => {
      const anchor = event.target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      event.preventDefault();

      if (href.startsWith('#')) {
        const target = el.preview.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (/^(https?|mailto):/i.test(href)) {
        api.openExternal(href);
        return;
      }

      if (href.startsWith('file:')) {
        const targetPath = fileUrlToPath(href);
        if (/\.(md|markdown|mdown|mkd|mkdn)$/i.test(targetPath)) {
          openFile(targetPath);
        } else {
          api.openPath(targetPath);
        }
      }
    });
  }

  /* ---------------------------------------------------------------- updates */

  function showUpdateBadge(show) {
    el.updateBadge.hidden = !show;
  }

  async function promptUpdate(result) {
    const detailLines = [];
    if (result.notes) detailLines.push(result.notes.trim());
    if (result.publishedAt) detailLines.push(`Veröffentlicht: ${new Date(result.publishedAt).toLocaleString('de-DE')}`);
    detailLines.push('Möchtest du jetzt aktualisieren? Die App wird dazu beendet und nach der Installation neu gestartet.');

    const choice = await api.confirm({
      message: `Version ${result.latestVersion} ist verfügbar (installiert: ${result.currentVersion}).`,
      detail: detailLines.join('\n\n'),
      buttons: ['Jetzt aktualisieren', 'Später'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) await installUpdate(result);
  }

  async function installUpdate(result) {
    if (!result.asset) {
      const choice = await api.confirm({
        message: 'Für dieses Update ist kein Installer hinterlegt.',
        detail:
          result.notes ||
          'Veröffentliche im Repository ein Release mit dem Setup-Installer, damit dieser Schritt automatisch funktioniert.',
        buttons: ['Release-Seite öffnen', 'Abbrechen'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice === 0 && result.htmlUrl) api.openExternal(result.htmlUrl);
      return;
    }

    setStatus('Update wird heruntergeladen … 0 %', 0);
    const unsubscribe = api.onUpdateProgress((progress) => {
      if (progress.phase === 'download') {
        setStatus(`Update wird heruntergeladen … ${progress.percent || 0} %`, 0);
      } else {
        setStatus('Update wird installiert …', 0);
      }
    });

    const outcome = await api.installUpdate({ asset: result.asset, latestVersion: result.latestVersion });
    unsubscribe();

    if (!outcome || !outcome.ok) {
      setStatus('Update fehlgeschlagen');
      api.message({
        type: 'error',
        message: 'Update konnte nicht installiert werden',
        detail: (outcome && outcome.message) || 'Unbekannter Fehler beim Herunterladen oder Starten des Installers.',
      });
      return;
    }

    if (outcome.manual) {
      setStatus('Update heruntergeladen');
      api.message({
        message: 'Update heruntergeladen',
        detail: `Die Datei wurde gespeichert unter:\n${outcome.filePath}\n\nBitte installiere sie manuell.`,
      });
      api.showItemInFolder(outcome.filePath);
      return;
    }

    await api.message({
      message: 'Update wird installiert',
      detail: 'Die Anwendung wird jetzt beendet und nach der Installation automatisch neu gestartet.',
    });
    api.quit();
  }

  async function checkForUpdates({ manual = false } = {}) {
    if (state.updateBusy) return;
    state.updateBusy = true;
    el.update.disabled = true;
    setStatus('Suche nach Updates …', 0);

    try {
      const result = await api.checkUpdates({ force: manual });
      await handleUpdateResult(result, manual);
    } catch (error) {
      setStatus('Update-Prüfung fehlgeschlagen');
      if (manual) {
        api.message({
          type: 'error',
          message: 'Update-Prüfung fehlgeschlagen',
          detail: `${error.message}\n\nPrüfe die Internetverbindung und die Update-Quelle.`,
        });
      }
    } finally {
      state.updateBusy = false;
      el.update.disabled = false;
    }
  }

  async function handleUpdateResult(result, manual) {
    if (!result) return;

    if (result.status === 'update') {
      state.pendingUpdate = result;
      showUpdateBadge(true);

      if (!result.asset) {
        setStatus(`Repo-Änderungen erkannt: ${result.commitsBehind} neue(r) Commit(s)`);
        if (manual) {
          const choice = await api.confirm({
            message: 'Es gibt Änderungen im Code-Repository.',
            detail: `${result.notes || ''}\n\nEs liegt kein fertiger Installer vor. Soll das Repository-Verzeichnis geöffnet werden, um neu zu bauen?`,
            buttons: ['Ordner öffnen', 'Schließen'],
            defaultId: 0,
            cancelId: 1,
          });
          if (choice === 0 && result.repoPath) api.openPath(result.repoPath);
        }
        return;
      }

      setStatus(`Update ${result.latestVersion} verfügbar`, 0);
      await promptUpdate(result);
      return;
    }

    if (result.status === 'current') {
      showUpdateBadge(false);
      setStatus(`Aktuell (Version ${result.currentVersion})`);
      if (manual) {
        api.message({
          message: 'Du bist auf dem neuesten Stand.',
          detail: `Installierte Version: ${result.currentVersion}`,
        });
      }
      return;
    }

    showUpdateBadge(false);
    setStatus('Keine Update-Quelle erreichbar');
    if (manual) {
      api.message({
        message: 'Keine Update-Quelle gefunden',
        detail:
          'Es wurde weder ein veröffentlichtes Release noch ein lokales Git-Repository mit Upstream gefunden.\n\n' +
          `Details: ${result.notes || 'unbekannt'}`,
      });
    }
  }

  /* --------------------------------------------------------------- dialogs */

  async function showAbout() {
    const shortcuts = [
      'Strg+O  Öffnen',
      'Strg+S  Speichern',
      'Strg+Shift+S  Speichern unter',
      'Strg+1 / 2 / 3  Ansicht / Bearbeiten / Geteilt',
      'Strg+D  Hell/Dunkel',
      'Strg + Mausrad  Zoom',
      'Strg+ + / -   Textgröße',
      'Doppelklick auf Breiten-Griff  Textbreite zurücksetzen',
    ].join('\n');

    await api.message({
      message: `Eisballis Markdown Viewer ${state.appInfo.version}`,
      detail: `Plattform: ${state.appInfo.platform}\n\nTastenkürzel:\n${shortcuts}`,
    });
  }

  /* ------------------------------------------------------------- key events */

  function insertText(text) {
    const { selectionStart, selectionEnd, value } = el.editor;
    const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    el.editor.value = next;
    el.editor.selectionStart = el.editor.selectionEnd = selectionStart + text.length;
    handleEditorInput();
  }

  function wrapSelection(before, after = before) {
    const { selectionStart, selectionEnd, value } = el.editor;
    const selected = value.slice(selectionStart, selectionEnd);
    const next =
      value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
    el.editor.value = next;
    el.editor.selectionStart = selectionStart + before.length;
    el.editor.selectionEnd = selectionEnd + before.length;
    handleEditorInput();
  }

  function handleEditorInput() {
    setDirty(true);
    scheduleMeta();
    if (state.mode !== 'edit') scheduleRender();
    updateEmptyState();
  }

  function handleEditorKeydown(event) {
    const ctrl = event.ctrlKey || event.metaKey;

    if (event.key === 'Tab') {
      event.preventDefault();
      insertText('  ');
      return;
    }

    if (!ctrl || event.shiftKey || event.altKey) return;

    if (event.key.toLowerCase() === 'b') {
      event.preventDefault();
      wrapSelection('**');
    } else if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      wrapSelection('*');
    } else if (event.key.toLowerCase() === 'k') {
      event.preventDefault();
      wrapSelection('[', '](https://)');
    }
  }

  function setupGlobalKeys() {
    window.addEventListener(
      'wheel',
      (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const step = event.deltaY < 0 ? 0.1 : -0.1;
        applyZoom(state.zoom + step);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (event) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl || event.altKey) return;

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        applyTextSize(state.textSize + 1);
      } else if (event.key === '-') {
        event.preventDefault();
        applyTextSize(state.textSize - 1);
      } else if (event.key === '0') {
        event.preventDefault();
        applyTextSize(17);
      }
    });
  }

  /* ------------------------------------------------------------- drag & drop */

  function setupDragAndDrop() {
    let depth = 0;

    window.addEventListener('dragenter', (event) => {
      event.preventDefault();
      depth += 1;
      el.dropOverlay.hidden = false;
    });

    window.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragleave', (event) => {
      event.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) el.dropOverlay.hidden = true;
    });

    window.addEventListener('drop', (event) => {
      event.preventDefault();
      depth = 0;
      el.dropOverlay.hidden = true;
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      const filePath = api.pathForFile(file);
      if (filePath) openFile(filePath);
    });
  }

  /* ------------------------------------------------------------- commands */

  function setupCommands() {
    api.onCommand(async (command) => {
      switch (command) {
        case 'open':
          openFile();
          break;
        case 'save':
          await save();
          break;
        case 'save-as':
          await saveAs();
          break;
        case 'save-and-close':
          if (await save()) api.forceClose();
          break;
        case 'reveal':
          if (state.filePath) api.showItemInFolder(state.filePath);
          else api.message({ message: 'Es ist keine Datei geöffnet.' });
          break;
        case 'mode-view':
          setMode('view');
          break;
        case 'mode-edit':
          setMode('edit');
          break;
        case 'mode-split':
          setMode('split');
          break;
        case 'font-inc':
          applyTextSize(state.textSize + 1);
          break;
        case 'font-dec':
          applyTextSize(state.textSize - 1);
          break;
        case 'font-reset':
          applyTextSize(17);
          break;
        case 'zoom-reset':
          applyZoom(1);
          break;
        case 'toggle-theme':
          applyTheme(state.theme === 'dark' ? 'light' : 'dark');
          break;
        case 'check-updates':
          checkForUpdates({ manual: true });
          break;
        case 'about':
          showAbout();
          break;
        default:
          break;
      }
    });

    api.onOpenPath((filePath) => {
      if (filePath) openFile(filePath);
    });

    api.onUpdateAvailable((result) => {
      state.pendingUpdate = result;
      showUpdateBadge(true);
      setStatus(`Update ${result.latestVersion} verfügbar – zum Installieren auf „Nach Updates suchen“ klicken`, 0);
    });
  }

  /* -------------------------------------------------------------- wiring */

  function setupToolbar() {
    el.open.addEventListener('click', () => openFile());
    el.save.addEventListener('click', () => save());
    el.fontDec.addEventListener('click', () => applyTextSize(state.textSize - 1));
    el.fontInc.addEventListener('click', () => applyTextSize(state.textSize + 1));
    el.theme.addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));
    el.resetWidth.addEventListener('click', () => {
      applyContentWidth(DEFAULT_WIDTH);
      setStatus('Textbreite zurückgesetzt');
    });
    el.about.addEventListener('click', showAbout);

    for (const button of el.modeGroup.querySelectorAll('.tb-btn')) {
      button.addEventListener('click', () => setMode(button.dataset.mode));
    }

    el.update.addEventListener('click', () => {
      if (state.pendingUpdate && state.pendingUpdate.asset) promptUpdate(state.pendingUpdate);
      else checkForUpdates({ manual: true });
    });

    el.editor.addEventListener('input', handleEditorInput);
    el.editor.addEventListener('keydown', handleEditorKeydown);
  }

  function applyInitialSettings(settings) {
    applyTheme(settings.theme === 'light' ? 'light' : 'dark', false);
    applyTextSize(Number(settings.textSize) || 17, false);
    applyContentWidth(Number(settings.contentWidth) || DEFAULT_WIDTH, false);
    applySplit(Number(settings.splitRatio) || DEFAULT_SPLIT, false);
    setMode(settings.mode || 'view', false);
    applyZoom(Number(settings.zoom) || 1, false);
  }

  function setupResizeObserver() {
    const observer = new ResizeObserver(() => queueHandlePosition());
    observer.observe(el.previewPane);
    observer.observe(el.preview);
  }

  async function init() {
    marked.setOptions({ gfm: true, breaks: false });
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && node.getAttribute('href')) {
        node.setAttribute('rel', 'noreferrer noopener');
      }
    });

    state.appInfo = await api.info();
    el.statusVersion.textContent = `v${state.appInfo.version}`;

    setupToolbar();
    setupCommands();
    setupGlobalKeys();
    setupDragAndDrop();
    setupWidthHandle();
    setupSplitter();
    setupLinkHandling();
    setupResizeObserver();

    applyInitialSettings(state.appInfo.settings || {});
    updateTitle();
    updateMeta();

    window.addEventListener('resize', () => queueHandlePosition(150));

    setStatus('Bereit', 2500);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
