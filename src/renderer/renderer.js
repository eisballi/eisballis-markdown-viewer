'use strict';

(() => {
  const api = window.api;
  const STRINGS = window.APP_STRINGS || { en: {} };

  const el = {
    open: document.getElementById('btn-open'),
    save: document.getElementById('btn-save'),
    saveAs: document.getElementById('btn-save-as'),
    modeGroup: document.getElementById('mode-group'),
    fontDec: document.getElementById('btn-font-dec'),
    fontInc: document.getElementById('btn-font-inc'),
    fontSizeLabel: document.getElementById('font-size-label'),
    theme: document.getElementById('btn-theme'),
    resetWidth: document.getElementById('btn-reset-width'),
    update: document.getElementById('btn-update'),
    updateBadge: document.getElementById('update-badge'),
    github: document.getElementById('btn-github'),
    website: document.getElementById('btn-website'),
    language: document.getElementById('lang-select'),
    about: document.getElementById('btn-about'),
    workspace: document.getElementById('workspace'),
    editorPane: document.getElementById('editor-pane'),
    editor: document.getElementById('editor'),
    editorMirror: document.getElementById('editor-mirror'),
    gutterInner: document.getElementById('gutter-inner'),
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
    dropText: document.getElementById('drop-text'),
    hintCtrl: document.getElementById('hint-ctrl'),
  };

  const MIN_TEXT_SIZE = 11;
  const MAX_TEXT_SIZE = 30;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;
  const DEFAULT_WIDTH = 800;
  const MIN_WIDTH = 380;
  const DEFAULT_SPLIT = 0.5;
  const DEFAULT_TEXT_SIZE = 17;
  const GUTTER_LINE_LIMIT = 6000;
  const GUTTER_WIDTH = 58;

  const state = {
    appInfo: { version: '0.0.0', platform: 'win32', githubUrl: '', websiteUrl: '' },
    language: 'en',
    filePath: null,
    baseUrl: null,
    fileName: null,
    dirty: false,
    mode: 'view',
    theme: 'dark',
    textSize: DEFAULT_TEXT_SIZE,
    contentWidth: DEFAULT_WIDTH,
    splitRatio: DEFAULT_SPLIT,
    zoom: 1,
    pendingUpdate: null,
    updateBusy: false,
    baseline: [''],
    changedLines: new Set(),
  };

  let renderTimer = null;
  let statusTimer = null;
  let metaTimer = null;
  let gutterTimer = null;
  let editPad = { left: -1, right: -1 };

  /* ------------------------------------------------------------------ i18n */

  function t(key, vars) {
    const dict = STRINGS[state.language] || STRINGS.en || {};
    let value = dict[key];
    if (value === undefined) value = (STRINGS.en || {})[key];
    if (value === undefined) value = key;
    if (vars) {
      value = value.replace(/\{(\w+)\}/g, (match, name) =>
        vars[name] === undefined ? match : String(vars[name]),
      );
    }
    return value;
  }

  function applyLanguage(language, persist = true) {
    state.language = language === 'de' ? 'de' : 'en';
    document.documentElement.lang = state.language;

    for (const node of document.querySelectorAll('[data-i18n]')) {
      node.textContent = t(node.getAttribute('data-i18n'));
    }

    el.language.value = state.language;
    el.language.title = t('ui.language');
    el.editor.placeholder = t('editor.placeholder');
    el.dropText.textContent = t('drop.text');
    el.hintCtrl.textContent = t('key.ctrl');

    el.open.title = `${t('app.open')} (Ctrl+O)`;
    el.save.title = `${t('app.save')} (Ctrl+S)`;
    el.saveAs.title = `${t('app.saveAs')} (Ctrl+Shift+S)`;
    for (const button of el.modeGroup.querySelectorAll('.tb-btn')) {
      const mode = button.dataset.mode;
      const shortKey = mode === 'view' ? 'mode.view' : mode === 'edit' ? 'mode.edit' : 'mode.split';
      const shortcut = mode === 'view' ? 'Ctrl+1' : mode === 'edit' ? 'Ctrl+2' : 'Ctrl+3';
      button.title = `${t(shortKey)} (${shortcut})`;
    }
    el.fontDec.title = t('ui.textSmaller');
    el.fontInc.title = t('ui.textLarger');
    el.fontSizeLabel.title = t('ui.textSize');
    el.resetWidth.title = t('ui.resetWidth');
    el.update.title = t('ui.checkUpdates');
    el.github.title = t('ui.github');
    el.website.title = t('ui.website');
    el.about.title = t('ui.about');
    updateThemeTitle();

    if (state.filePath) el.statusFile.textContent = state.filePath;
    else el.statusFile.textContent = t('status.noFile');

    updateTitle();
    updateMeta();

    if (persist) api.updateSettings({ language: state.language });
  }

  /* ------------------------------------------------------------ rendering */

  const slugCounts = new Map();

  function slugify(text) {
    const base =
      String(text)
        .toLowerCase()
        .replace(/[`*_~[\]()#!]/g, '')
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-') || 'section';
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
      el.preview.textContent = error.message;
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
    if (state.mode === 'split') syncPreviewToEditor();
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
    const name = state.fileName || t('title.untitled');
    const title = `${state.dirty ? '• ' : ''}${name} – Eisballi's Markdown Viewer`;
    document.title = title;
    api.setTitle(title);
    el.statusFile.textContent = state.filePath || t('status.noFile');
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
    state.baseline = el.editor.value.split('\n');
    el.editor.scrollTop = 0;
    el.previewScroll.scrollTop = 0;
    setDirty(false);
    updateTitle();
    updateMeta();
    updateEmptyState();
    render();
    scheduleGutter(0);
  }

  async function openFile(filePath) {
    if (!(await confirmDiscardChanges(t('dialog.button.open')))) return;
    try {
      const file = await api.openFile(filePath);
      if (!file) return;
      loadFile(file);
      setStatus(t('status.opened', { name: file.name }));
    } catch (error) {
      api.message({ type: 'error', message: t('status.fileError'), detail: error.message });
    }
  }

  async function confirmDiscardChanges(action) {
    if (!state.dirty) return true;
    const choice = await api.confirm({
      message: t('dialog.unsaved.title'),
      detail: t('dialog.unsaved.detail', { action }),
      buttons: [t('dialog.button.save'), t('dialog.button.discard'), t('dialog.button.cancel')],
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
      state.baseline = el.editor.value.split('\n');
      setDirty(false);
      updateMeta();
      scheduleGutter(0);
      setStatus(t('status.saved'));
      return true;
    } catch (error) {
      api.message({ type: 'error', message: t('dialog.saveFailed'), detail: error.message });
      return false;
    }
  }

  async function saveAs() {
    try {
      const result = await api.saveFileAs({
        content: el.editor.value,
        suggestedName: state.fileName || 'untitled.md',
      });
      if (!result) return false;
      state.filePath = result.path;
      state.fileName = result.name;
      state.baseUrl = result.baseUrl;
      state.baseline = el.editor.value.split('\n');
      setDirty(false);
      updateTitle();
      updateMeta();
      scheduleGutter(0);
      setStatus(t('status.saved'));
      return true;
    } catch (error) {
      api.message({ type: 'error', message: t('dialog.saveFailed'), detail: error.message });
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
    el.statusMeta.textContent = t('status.words', { words, chars: text.length, lines });
  }

  function scheduleMeta() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(updateMeta, 300);
  }

  /* ------------------------------------------------------------ appearance */

  function updateThemeTitle() {
    el.theme.title = state.theme === 'dark' ? t('ui.theme.toLight') : t('ui.theme.toDark');
  }

  function applyTheme(theme, persist = true) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    updateThemeTitle();
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
    scheduleGutter(60);
  }

  function applyContentWidth(width, persist = true) {
    const paneWidth = el.previewPane.clientWidth || 800;
    const max = Math.max(MIN_WIDTH, paneWidth - 24);
    state.contentWidth = Math.min(max, Math.max(MIN_WIDTH, Math.round(width)));
    document.documentElement.style.setProperty('--content-width', `${state.contentWidth}px`);
    if (persist) api.updateSettings({ contentWidth: state.contentWidth });
    queueHandlePosition();
    scheduleGutter(60);
  }

  function applySplit(ratio, persist = true) {
    state.splitRatio = Math.min(0.8, Math.max(0.2, ratio));
    document.documentElement.style.setProperty('--split', `${state.splitRatio * 100}%`);
    if (persist) api.updateSettings({ splitRatio: state.splitRatio });
    scheduleGutter(60);
  }

  async function applyZoom(factor, persist = true) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(factor * 10) / 10));
    const applied = await api.zoom(next);
    state.zoom = applied || next;
    el.statusZoom.textContent = `${Math.round(state.zoom * 100)} %`;
    if (persist) api.updateSettings({ zoom: state.zoom });
    queueHandlePosition();
    scheduleGutter(120);
  }

  function setMode(mode, persist = true) {
    state.mode = ['view', 'edit', 'split'].includes(mode) ? mode : 'view';
    document.documentElement.dataset.mode = state.mode;

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
      requestAnimationFrame(() => syncPreviewToEditor());
    }
    if (persist) api.updateSettings({ mode: state.mode });

    queueHandlePosition();
    scheduleGutter(30);
  }

  /* ---------------------------------------------------------------- gutter */

  function computeChangedLines(lines) {
    const counts = new Map();
    for (const line of state.baseline) counts.set(line, (counts.get(line) || 0) + 1);
    const changed = new Set();
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const remaining = counts.get(line) || 0;
      if (remaining > 0) counts.set(line, remaining - 1);
      else changed.add(index);
    }
    return changed;
  }

  function syncGutterScroll() {
    el.gutterInner.style.transform = `translateY(${-el.editor.scrollTop}px)`;
  }

  function renderGutter() {
    const lines = el.editor.value.split('\n');
    state.changedLines = computeChangedLines(lines);

    const measured = lines.length <= GUTTER_LINE_LIMIT;
    let heights;

    if (measured) {
      const mirrorWidth = el.editor.clientWidth;
      if (mirrorWidth > 0) el.editorMirror.style.width = `${mirrorWidth}px`;

      const mirrorFragment = document.createDocumentFragment();
      for (const line of lines) {
        const node = document.createElement('div');
        node.className = 'mirror-line';
        node.textContent = line.length ? line : '\u200b';
        mirrorFragment.appendChild(node);
      }
      el.editorMirror.replaceChildren(mirrorFragment);
      // Bruchgenaue Höhen (nicht gerundet), damit sich über viele Zeilen kein Versatz aufbaut.
      heights = Array.from(
        el.editorMirror.children,
        (node) => node.getBoundingClientRect().height,
      );
    } else {
      const computed = Number.parseFloat(getComputedStyle(el.editor).lineHeight);
      const uniform = Number.isFinite(computed) && computed > 0 ? computed : 24;
      heights = new Array(lines.length).fill(uniform);
    }

    const fragment = document.createDocumentFragment();
    let top = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const number = document.createElement('div');
      number.className = state.changedLines.has(index) ? 'ln changed' : 'ln';
      number.style.top = `${top}px`;
      number.textContent = String(index + 1);
      fragment.appendChild(number);
      top += heights[index] || 0;
    }
    el.gutterInner.replaceChildren(fragment);
    el.gutterInner.style.height = `${top}px`;
    syncGutterScroll();
  }

  function scheduleGutter(delay = 120) {
    clearTimeout(gutterTimer);
    gutterTimer = setTimeout(() => {
      if (state.mode === 'view') return;
      updateEditLayout();
      renderGutter();
      const before = `${editPad.left}:${editPad.right}`;
      updateEditLayout();
      if (`${editPad.left}:${editPad.right}` !== before) renderGutter();
    }, delay);
  }

  /**
   * Rein rechter Rand im Bearbeiten-Modus: Der Textblock bleibt mittig, die
   * Scrollleiste gehört aber zum Vollbreiten-Editor und sitzt am Fensterrand.
   */
  function updateEditLayout() {
    if (state.mode !== 'edit') return;
    const pane = el.editorPane.clientWidth;
    if (!pane) return;

    const scrollbar = Math.max(0, el.editor.offsetWidth - el.editor.clientWidth);
    const avail = Math.max(160, pane - scrollbar);
    const width = Math.min(state.contentWidth, Math.max(MIN_WIDTH, pane - 40));
    const free = Math.max(0, avail - GUTTER_WIDTH - width);
    const left = Math.round(free / 2);
    const right = Math.round(free - left);

    if (left === editPad.left && right === editPad.right) return;
    editPad = { left, right };
    document.documentElement.style.setProperty('--edit-pad-left', `${left}px`);
    document.documentElement.style.setProperty('--edit-pad-right', `${right}px`);
    document.documentElement.style.setProperty('--edit-scrollbar', `${scrollbar}px`);
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
      setStatus(t('status.widthReset'));
    });
  }

  /* -------------------------------------------------------------- splitter */

  function scrollRatio(element) {
    const max = element.scrollHeight - element.clientHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, element.scrollTop / max));
  }

  function syncPreviewToEditor() {
    if (state.mode !== 'split') return;
    const max = el.previewScroll.scrollHeight - el.previewScroll.clientHeight;
    if (max <= 0) return;
    el.previewScroll.scrollTop = Math.round(scrollRatio(el.editor) * max);
  }

  function setupScrollSync() {
    let lock = null;
    const releaseLock = () => {
      requestAnimationFrame(() => {
        lock = null;
      });
    };
    const scrollTo = (target, top) => {
      if (Math.abs(target.scrollTop - top) < 1) return;
      target.scrollTop = top;
    };

    el.editor.addEventListener('scroll', () => {
      syncGutterScroll();
      if (state.mode !== 'split' || lock === 'editor') return;
      const max = el.previewScroll.scrollHeight - el.previewScroll.clientHeight;
      if (max <= 0) return;
      lock = 'preview';
      scrollTo(el.previewScroll, Math.round(scrollRatio(el.editor) * max));
      releaseLock();
    });

    el.previewScroll.addEventListener('scroll', () => {
      if (state.mode !== 'split' || lock === 'preview') return;
      const max = el.editor.scrollHeight - el.editor.clientHeight;
      if (max <= 0) return;
      lock = 'editor';
      scrollTo(el.editor, Math.round(scrollRatio(el.previewScroll) * max));
      releaseLock();
    });
  }

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

  function pathSeparator() {
    return state.appInfo.platform === 'win32' ? '\\' : '/';
  }

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

  function restoreEditorFocus() {
    if (state.mode !== 'view') el.editor.focus({ preventScroll: true });
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
        if (/\.(md|markdown|mdown|mkd|mkdn)$/i.test(targetPath)) openFile(targetPath);
        else api.openPath(targetPath);
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
    if (result.publishedAt) {
      const locale = state.language === 'de' ? 'de-DE' : 'en-US';
      detailLines.push(t('update.published', { date: new Date(result.publishedAt).toLocaleString(locale) }));
    }
    detailLines.push(t('update.availableDetail'));

    const choice = await api.confirm({
      message: t('update.availableMessage', { latest: result.latestVersion, current: result.currentVersion }),
      detail: detailLines.join('\n\n'),
      buttons: [t('update.now'), t('update.later')],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) await installUpdate(result);
  }

  async function installUpdate(result) {
    if (!result.asset) {
      const choice = await api.confirm({
        message: t('update.noAssetTitle'),
        detail: t('update.noAssetDetail'),
        buttons: [t('update.openRelease'), t('dialog.button.cancel')],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice === 0 && result.htmlUrl) api.openExternal(result.htmlUrl);
      return;
    }

    setStatus(t('status.downloading', { percent: 0 }), 0);
    const unsubscribe = api.onUpdateProgress((progress) => {
      if (progress.phase === 'download') {
        setStatus(t('status.downloading', { percent: progress.percent || 0 }), 0);
      } else {
        setStatus(t('status.installing'), 0);
      }
    });

    const outcome = await api.installUpdate({ asset: result.asset, latestVersion: result.latestVersion });
    unsubscribe();

    if (!outcome || !outcome.ok) {
      setStatus(t('status.updateFailed'));
      api.message({
        type: 'error',
        message: t('update.failedTitle'),
        detail: (outcome && outcome.message) || t('update.failedDetail'),
      });
      return;
    }

    if (outcome.manual) {
      setStatus(t('status.updateDownloaded'));
      api.message({
        message: t('update.downloadedTitle'),
        detail: t('update.downloadedDetail', { path: outcome.filePath }),
      });
      api.showItemInFolder(outcome.filePath);
      return;
    }

    await api.message({
      message: t('update.installingTitle'),
      detail: t('update.installingDetail'),
    });
    api.quit();
  }

  async function checkForUpdates({ manual = false } = {}) {
    if (state.updateBusy) return;
    state.updateBusy = true;
    el.update.disabled = true;
    setStatus(t('status.checking'), 0);

    try {
      const result = await api.checkUpdates({ force: manual });
      await handleUpdateResult(result, manual);
    } catch (error) {
      setStatus(t('status.checkFailed'));
      if (manual) {
        api.message({
          type: 'error',
          message: t('status.checkFailed'),
          detail: error.message,
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
        setStatus(t('status.repoChanges', { count: result.commitsBehind || 0 }));
        if (manual) {
          const choice = await api.confirm({
            message: t('update.repoChangesTitle'),
            detail: t('update.repoChangesDetail', {
              notes: result.notes || t('update.gitCommits', { count: result.commitsBehind || 0 }),
            }),
            buttons: [t('update.openFolder'), t('dialog.button.close')],
            defaultId: 0,
            cancelId: 1,
          });
          if (choice === 0 && result.repoPath) api.openPath(result.repoPath);
        }
        return;
      }

      setStatus(t('status.updateAvailable', { version: result.latestVersion }), 0);
      await promptUpdate(result);
      return;
    }

    if (result.status === 'current') {
      showUpdateBadge(false);
      setStatus(t('status.upToDate', { version: result.currentVersion }));
      if (manual) {
        api.message({
          message: t('update.currentTitle'),
          detail: t('update.currentDetail', { version: result.currentVersion }),
        });
      }
      return;
    }

    showUpdateBadge(false);
    setStatus(t('status.noSource'));
    if (manual) {
      api.message({
        message: t('update.noSourceTitle'),
        detail: t('update.noSourceDetail', { notes: result.notes || '—' }),
      });
    }
  }

  /* --------------------------------------------------------------- dialogs */

  async function showAbout() {
    await api.message({
      message: t('about.title', { version: state.appInfo.version }),
      detail: t('about.detail', {
        platform: state.appInfo.platform,
        shortcuts: t('about.shortcuts'),
      }),
    });
  }

  function handleLanguageChange() {
    applyLanguage(el.language.value);
    setStatus(`${t('ui.language')}: ${t('lang.name')}`, 2500);
    el.language.blur();
    restoreEditorFocus();
  }

  /* ------------------------------------------------------------ key events */

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
    const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
    el.editor.value = next;
    el.editor.selectionStart = selectionStart + before.length;
    el.editor.selectionEnd = selectionEnd + before.length;
    handleEditorInput();
  }

  function handleEditorInput() {
    setDirty(true);
    scheduleMeta();
    scheduleGutter();
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
        applyZoom(state.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
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
        applyTextSize(DEFAULT_TEXT_SIZE);
      }
    });
  }

  /* ------------------------------------------------------------ drag & drop */

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

  /* ---------------------------------------------------------------- commands */

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
          else api.message({ message: t('dialog.noFileOpen') });
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
          applyTextSize(DEFAULT_TEXT_SIZE);
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
        case 'language-en':
          applyLanguage('en');
          break;
        case 'language-de':
          applyLanguage('de');
          break;
        case 'github':
          if (state.appInfo.githubUrl) api.openExternal(state.appInfo.githubUrl);
          break;
        case 'website':
          if (state.appInfo.websiteUrl) api.openExternal(state.appInfo.websiteUrl);
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
      setStatus(t('status.updateHint', { version: result.latestVersion }), 0);
    });
  }

  /* ---------------------------------------------------------------- wiring */

  function setupToolbar() {
    el.open.addEventListener('click', () => openFile());
    el.save.addEventListener('click', () => save());
    el.saveAs.addEventListener('click', () => saveAs());

    el.fontDec.addEventListener('click', () => {
      applyTextSize(state.textSize - 1);
      restoreEditorFocus();
    });
    el.fontInc.addEventListener('click', () => {
      applyTextSize(state.textSize + 1);
      restoreEditorFocus();
    });
    el.theme.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
      restoreEditorFocus();
    });
    el.resetWidth.addEventListener('click', () => {
      applyContentWidth(DEFAULT_WIDTH);
      setStatus(t('status.widthReset'));
    });
    el.language.addEventListener('change', handleLanguageChange);
    el.github.addEventListener('click', () => {
      if (state.appInfo.githubUrl) api.openExternal(state.appInfo.githubUrl);
    });
    el.website.addEventListener('click', () => {
      if (state.appInfo.websiteUrl) api.openExternal(state.appInfo.websiteUrl);
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
    applyLanguage(settings.language === 'de' ? 'de' : 'en', false);
    applyTheme(settings.theme === 'light' ? 'light' : 'dark', false);
    applyTextSize(Number(settings.textSize) || DEFAULT_TEXT_SIZE, false);
    applyContentWidth(Number(settings.contentWidth) || DEFAULT_WIDTH, false);
    applySplit(Number(settings.splitRatio) || DEFAULT_SPLIT, false);
    setMode(settings.mode || 'view', false);
    applyZoom(Number(settings.zoom) || 1, false);
  }

  function setupResizeObserver() {
    const observer = new ResizeObserver(() => {
      queueHandlePosition();
      scheduleGutter(120);
    });
    observer.observe(el.previewPane);
    observer.observe(el.preview);
    observer.observe(el.editorPane);
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
    setupScrollSync();
    setupLinkHandling();
    setupResizeObserver();

    applyInitialSettings(state.appInfo.settings || {});
    updateTitle();
    updateMeta();
    scheduleGutter(0);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => scheduleGutter(0));
    }

    const pendingFile = await api.pendingFile();
    if (pendingFile) await openFile(pendingFile);

    window.addEventListener('resize', () => {
      queueHandlePosition(150);
      scheduleGutter(150);
    });

    setStatus(t('status.ready'), 2500);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
