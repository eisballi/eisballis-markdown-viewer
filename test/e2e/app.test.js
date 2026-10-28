'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { launchApp } = require('./helpers.js');

const fixtureSource = path.join(__dirname, '..', 'fixtures', 'sample.md');
let app;
let workDir;
let documentPath;

test.before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eisballi-e2e-doc-'));
  documentPath = path.join(workDir, 'sample.md');
  fs.copyFileSync(fixtureSource, documentPath);
  app = await launchApp(documentPath);

  // Wait until the renderer finished loading the document.
  await app.evaluate(`(async () => {
    for (let i = 0; i < 100; i += 1) {
      if (document.getElementById('status-file').textContent.endsWith('sample.md')) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })()`);
});

test.after(async () => {
  if (app) await app.shutdown();
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('starts in dark mode and renders the Markdown document', async () => {
  const state = await app.evaluate(`({
    theme: document.documentElement.dataset.theme,
    mode: document.documentElement.dataset.mode,
    editorHidden: document.getElementById('editor-pane').hidden,
    previewHidden: document.getElementById('preview-pane').hidden,
    headings: document.querySelectorAll('#preview h1, #preview h2').length,
    tables: document.querySelectorAll('#preview table').length,
    codeBlocks: document.querySelectorAll('#preview pre code').length,
    checkboxes: document.querySelectorAll('#preview input[type="checkbox"]').length,
    title: document.title,
    version: document.getElementById('status-version').textContent,
  })`);

  assert.equal(state.theme, 'dark');
  assert.equal(state.mode, 'view');
  assert.equal(state.editorHidden, true);
  assert.equal(state.previewHidden, false);
  assert.ok(state.headings >= 3, 'headings should be rendered');
  assert.equal(state.tables, 1);
  assert.equal(state.codeBlocks, 1);
  assert.equal(state.checkboxes, 3);
  assert.match(state.title, /sample\.md – Eisballi's Markdown Viewer/);
  assert.match(state.version, /^v\d+\.\d+\.\d+/);
});

test('switching the language updates the UI and is persisted', async () => {
  const german = await app.evaluate(`(async () => {
    const select = document.getElementById('lang-select');
    select.value = 'de';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    const info = await window.api.info();
    return {
      open: document.getElementById('btn-open').textContent.trim(),
      split: document.querySelector('[data-mode="split"]').textContent.trim(),
      lang: document.documentElement.lang,
      stored: info.settings.language,
      placeholder: document.getElementById('editor').placeholder,
    };
  })()`);

  assert.equal(german.open, 'Öffnen');
  assert.equal(german.split, 'Geteilt');
  assert.equal(german.lang, 'de');
  assert.equal(german.stored, 'de');
  assert.match(german.placeholder, /Überschrift/);

  const english = await app.evaluate(`(async () => {
    const select = document.getElementById('lang-select');
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      open: document.getElementById('btn-open').textContent.trim(),
      stored: (await window.api.info()).settings.language,
    };
  })()`);

  assert.equal(english.open, 'Open');
  assert.equal(english.stored, 'en');
});

test('view mode shows the column borders and the width grip', async () => {
  const view = await app.evaluate(`(() => {
    const preview = document.getElementById('preview');
    const paneElement = document.getElementById('preview-pane');
    const pane = paneElement.getBoundingClientRect();
    const column = preview.getBoundingClientRect();
    const overlay = getComputedStyle(paneElement, '::after');
    const handle = document.getElementById('width-handle');
    return {
      borderLeft: parseFloat(overlay.borderLeftWidth),
      borderRight: parseFloat(overlay.borderRightWidth),
      columnWidth: Math.round(column.width),
      configuredWidth: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--content-width'), 10),
      gapRight: Math.round(pane.right - column.right),
      handleHidden: handle.hidden,
      handleLeft: Math.round(parseFloat(handle.style.left || '0')),
      columnRight: Math.round(column.right - pane.left),
    };
  })()`);

  assert.ok(view.borderLeft > 0, 'the column has a left border');
  assert.ok(view.borderRight > 0, 'the column has a right border');
  assert.equal(view.columnWidth, view.configuredWidth);
  assert.ok(view.gapRight > 0, 'the column does not touch the window edge');
  assert.equal(view.handleHidden, false);
  assert.ok(Math.abs(view.handleLeft - view.columnRight) <= 2, 'grip sits on the column edge');
});

test('edit mode centers the text, aligns line numbers and marks changed lines', async () => {
  const edit = await app.evaluate(`(async () => {
    document.querySelector('[data-mode="edit"]').click();
    await new Promise((resolve) => setTimeout(resolve, 700));

    const editor = document.getElementById('editor');
    const pane = document.getElementById('editor-pane').getBoundingClientRect();
    const box = editor.getBoundingClientRect();
    const numbers = [...document.querySelectorAll('.ln')];
    const mirror = [...document.querySelectorAll('#editor-mirror .mirror-line')];

    const cumulative = [];
    let top = 0;
    for (const line of mirror) {
      cumulative.push(top);
      top += line.getBoundingClientRect().height;
    }
    const samples = [0, 3, Math.floor(numbers.length / 2), numbers.length - 1];
    const drift = samples.map((index) => Math.abs(parseFloat(numbers[index].style.top) - cumulative[index]));

    return {
      editorLeftGap: Math.round(box.left - pane.left),
      editorRightGap: Math.round(pane.right - box.right),
      textRightGap: parseInt(getComputedStyle(editor).paddingRight, 10),
      scrollbarAtWindowEdge: Math.round(window.innerWidth - box.right),
      scrollbarWidth: editor.offsetWidth - editor.clientWidth,
      lineCount: numbers.length,
      mirrorCount: mirror.length,
      sourceLines: editor.value.split('\\n').length,
      leftGripHidden: document.getElementById('edit-handle').hidden,
      rightGripHidden: document.getElementById('edit-handle-right').hidden,
      previewHidden: document.getElementById('preview-pane').hidden,
      maxDrift: Math.max(...drift),
    };
  })()`);

  assert.equal(edit.previewHidden, true);
  assert.ok(edit.editorLeftGap > 20, 'the editor column is centered');
  assert.ok(edit.textRightGap > 24, 'the text keeps a gap to the right edge');
  assert.equal(edit.editorRightGap, 0, 'the scrollbar belongs to the full-width editor');
  assert.equal(edit.scrollbarAtWindowEdge, 0, 'the scrollbar sits at the window edge');
  assert.ok(edit.scrollbarWidth > 0, 'the editor shows its scrollbar');
  assert.equal(edit.lineCount, edit.sourceLines);
  assert.equal(edit.mirrorCount, edit.sourceLines);
  assert.equal(edit.leftGripHidden, false);
  assert.equal(edit.rightGripHidden, false);
  assert.ok(edit.maxDrift < 1, `line numbers must align with the text (drift ${edit.maxDrift}px)`);

  const changed = await app.evaluate(`(async () => {
    const editor = document.getElementById('editor');
    editor.value = editor.value + '\\n\\nExtra line';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    const marks = [...document.querySelectorAll('.ln.changed')];
    return { count: marks.length, color: marks.length ? getComputedStyle(marks[0]).color : '' };
  })()`);

  assert.ok(changed.count > 0, 'changed lines are marked');
  assert.equal(changed.color, 'rgb(245, 162, 69)', 'changed line numbers are orange');

  const reverted = await app.evaluate(`(async () => {
    const editor = document.getElementById('editor');
    editor.value = editor.value.replace('\\n\\nExtra line', '');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    return document.querySelectorAll('.ln.changed').length;
  })()`);

  assert.equal(reverted, 0);
});

test('split mode uses one scrollbar and keeps both panes in sync', async () => {
  const split = await app.evaluate(`(async () => {
    document.querySelector('[data-mode="split"]').click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Make sure both panes have enough content to scroll.
    const editor = document.getElementById('editor');
    const original = editor.value;
    editor.value = original + '\\n\\n' + Array.from({ length: 120 }, (_, i) => 'Filler line ' + i).join('\\n');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 800));

    const preview = document.getElementById('preview');
    const previewPane = document.getElementById('preview-pane').getBoundingClientRect();
    const previewScroll = document.getElementById('preview-scroll');
    const divider = document.getElementById('splitter').getBoundingClientRect();
    const ratio = (element) => {
      const max = element.scrollHeight - element.clientHeight;
      return max > 0 ? element.scrollTop / max : 0;
    };

    previewScroll.scrollTop = Math.round((previewScroll.scrollHeight - previewScroll.clientHeight) * 0.6);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const result = {
      editorPaneHidden: document.getElementById('editor-pane').hidden,
      previewPaneHidden: document.getElementById('preview-pane').hidden,
      editorScrollbarWidth: editor.offsetWidth - editor.clientWidth,
      previewScrollbarWidth: previewScroll.offsetWidth - previewScroll.clientWidth,
      dividerWidth: Math.round(divider.width),
      gapAfterDivider: Math.round(preview.getBoundingClientRect().left - divider.right),
      paneGapRight: Math.round(window.innerWidth - previewPane.right),
      gapRight: Math.round(previewPane.right - preview.getBoundingClientRect().right),
      widthGripHidden: document.getElementById('width-handle').hidden,
      previewRatio: Number(ratio(previewScroll).toFixed(2)),
      editorRatio: Number(ratio(editor).toFixed(2)),
    };

    editor.value = original;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    return result;
  })()`);

  assert.equal(split.editorPaneHidden, false);
  assert.equal(split.previewPaneHidden, false);
  assert.equal(split.editorScrollbarWidth, 0, 'the editor hides its scrollbar in split mode');
  assert.ok(split.previewScrollbarWidth > 0, 'the preview keeps the single scrollbar');
  assert.equal(split.dividerWidth, 1, 'there is exactly one divider line');
  assert.equal(split.gapAfterDivider, 0, 'the preview starts at the divider');
  assert.equal(split.paneGapRight, 0, 'the preview pane reaches the window edge');
  assert.equal(split.gapRight, split.previewScrollbarWidth, 'only the scrollbar remains on the right');
  assert.equal(split.widthGripHidden, true);
  assert.ok(Math.abs(split.previewRatio - split.editorRatio) <= 0.02, 'both panes scroll together');
});

test('column lines span the full pane even for a short document', async () => {
  const lines = await app.evaluate(`(async () => {
    const editor = document.getElementById('editor');
    const original = editor.value;
    editor.value = '# Short\\n\\nOnly a few lines.';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-mode="view"]').click();
    await new Promise((resolve) => setTimeout(resolve, 600));

    const pane = document.getElementById('preview-pane');
    const preview = document.getElementById('preview');
    const style = getComputedStyle(pane, '::after');
    const result = {
      paneHeight: Math.round(pane.getBoundingClientRect().height),
      previewHeight: Math.round(preview.getBoundingClientRect().height),
      borderLeft: parseFloat(style.borderLeftWidth),
      borderRight: parseFloat(style.borderRightWidth),
      top: style.top,
      bottom: style.bottom,
      leftVar: getComputedStyle(document.documentElement).getPropertyValue('--column-left').trim(),
      rightVar: getComputedStyle(document.documentElement).getPropertyValue('--column-right').trim(),
    };

    editor.value = original;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    return result;
  })()`);

  assert.ok(lines.previewHeight < lines.paneHeight, 'the document is shorter than the pane');
  assert.ok(lines.borderLeft > 0 && lines.borderRight > 0, 'both column lines are drawn');
  assert.equal(lines.top, '0px');
  assert.equal(lines.bottom, '0px');
  assert.ok(parseInt(lines.leftVar, 10) > 0);
  assert.ok(parseInt(lines.rightVar, 10) > 0);
});

test('zoom scales the document but keeps the base font size and the toolbar', async () => {
  const zoom = await app.evaluate(`(async () => {
    const toolbar = document.getElementById('toolbar');
    const heading = document.querySelector('#preview h1');
    const measure = () => ({
      toolbarHeight: Math.round(toolbar.getBoundingClientRect().height),
      buttonFont: getComputedStyle(document.getElementById('btn-open')).fontSize,
      baseSize: getComputedStyle(document.documentElement).getPropertyValue('--md-size').trim(),
      label: document.getElementById('font-size-label').textContent,
      headingHeight: Math.round(heading.getBoundingClientRect().height),
      zoom: document.getElementById('status-zoom').textContent,
    });

    const before = measure();
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    const zoomed = measure();

    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    const restored = measure();

    return { before, zoomed, restored };
  })()`);

  assert.notEqual(zoom.zoomed.zoom, zoom.before.zoom, 'the zoom indicator changes');
  assert.ok(zoom.zoomed.headingHeight > zoom.before.headingHeight, 'the document is scaled up');
  assert.equal(zoom.zoomed.baseSize, zoom.before.baseSize, 'the base font size stays untouched');
  assert.equal(zoom.zoomed.label, zoom.before.label, 'the font size label stays untouched');
  assert.equal(zoom.zoomed.toolbarHeight, zoom.before.toolbarHeight, 'the toolbar keeps its height');
  assert.equal(zoom.zoomed.buttonFont, zoom.before.buttonFont, 'the toolbar keeps its font size');
  assert.equal(zoom.restored.headingHeight, zoom.before.headingHeight, 'the zoom can be reset');
});

test('text size buttons change the rendered font size', async () => {
  const sizes = await app.evaluate(`(async () => {
    document.querySelector('[data-mode="view"]').click();
    const before = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--md-size'), 10);
    document.getElementById('btn-font-inc').click();
    document.getElementById('btn-font-inc').click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const larger = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--md-size'), 10);
    document.getElementById('btn-font-dec').click();
    document.getElementById('btn-font-dec').click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const restored = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--md-size'), 10);
    return { before, larger, restored };
  })()`);

  assert.equal(sizes.larger, sizes.before + 2);
  assert.equal(sizes.restored, sizes.before);
});

test('saving writes the document to disk and clears the dirty marker', async () => {
  const before = await app.evaluate(`(async () => {
    const editor = document.getElementById('editor');
    editor.value = editor.value + '\\n\\nSaved by the test.';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      dirty: document.getElementById('status-file').classList.contains('dirty'),
      title: document.title,
    };
  })()`);

  assert.equal(before.dirty, true);
  assert.ok(before.title.startsWith('•'));

  const after = await app.evaluate(`(async () => {
    document.getElementById('btn-save').click();
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      dirty: document.getElementById('status-file').classList.contains('dirty'),
      status: document.getElementById('status-update').textContent,
    };
  })()`);

  assert.equal(after.dirty, false);
  assert.equal(after.status, 'Saved');
  assert.ok(fs.readFileSync(documentPath, 'utf8').includes('Saved by the test.'));
});
