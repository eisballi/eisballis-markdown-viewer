'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const strings = require('../../src/shared/strings.js');

const root = path.join(__dirname, '..', '..');

test('every language provides the same keys', () => {
  const en = Object.keys(strings.en).sort();
  const de = Object.keys(strings.de).sort();
  assert.deepEqual(de, en);
});

test('no string is empty', () => {
  for (const [language, dict] of Object.entries(strings)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string', `${language}.${key} must be a string`);
      assert.ok(value.length > 0, `${language}.${key} must not be empty`);
    }
  }
});

test('placeholders match between languages', () => {
  const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [key, value] of Object.entries(strings.en)) {
    assert.deepEqual(placeholders(strings.de[key]), placeholders(value), `placeholder mismatch for ${key}`);
  }
});

test('the default language is English', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.match(html, /<html lang="en"/);
});

test('English strings contain no German characters', () => {
  const germanOnly = /[äöüßÄÖÜ]/;
  for (const [key, value] of Object.entries(strings.en)) {
    assert.ok(!germanOnly.test(value), `English string ${key} contains German characters`);
  }
});

test('the German translation is German', () => {
  assert.equal(strings.de['app.open'], 'Öffnen');
  assert.equal(strings.de['mode.split'], 'Geteilt');
  assert.equal(strings.en['app.open'], 'Open');
});
