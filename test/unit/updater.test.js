'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isNewer, pickAsset, assetKind, repoSlug } = require('../../src/updater.js');

test('isNewer compares semantic versions', () => {
  assert.equal(isNewer('1.0.1', '1.0.0'), true);
  assert.equal(isNewer('1.1.0', '1.0.9'), true);
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
  assert.equal(isNewer('1.0.0', '1.0.0'), false);
  assert.equal(isNewer('1.0.0', '1.0.1'), false);
  assert.equal(isNewer('0.9.9', '1.0.0'), false);
});

test('isNewer ignores a leading v and pre-release suffixes', () => {
  assert.equal(isNewer('v1.2.3', '1.2.2'), true);
  assert.equal(isNewer('1.2.3-beta.1', '1.2.3'), false);
  assert.equal(isNewer('1.2.3', '1.2.3-beta.1'), false);
});

test('isNewer tolerates malformed input', () => {
  assert.equal(isNewer('', '1.0.0'), false);
  assert.equal(isNewer('1.0.0', ''), true);
  assert.equal(isNewer('abc', '0.0.0'), false);
});

test('pickAsset chooses the installer for each platform', () => {
  const assets = [
    { name: 'app-1.0.0-x86_64.AppImage' },
    { name: 'app-1.0.0-amd64.deb' },
    { name: 'app-Setup-1.0.0.exe' },
    { name: 'app-1.0.0-portable.exe' },
    { name: 'app-1.0.0.dmg' },
  ];
  assert.equal(pickAsset(assets, 'win32').name, 'app-Setup-1.0.0.exe');
  assert.equal(pickAsset(assets, 'linux').name, 'app-1.0.0-x86_64.AppImage');
  assert.equal(pickAsset(assets, 'darwin').name, 'app-1.0.0.dmg');
});

test('pickAsset prefers the portable exe on Windows when there is no setup', () => {
  const assets = [{ name: 'app-1.0.0-portable.exe' }];
  assert.equal(pickAsset(assets, 'win32').name, 'app-1.0.0-portable.exe');
});

test('pickAsset falls back to the deb on Linux', () => {
  const assets = [{ name: 'app-1.0.0-amd64.deb' }];
  assert.equal(pickAsset(assets, 'linux').name, 'app-1.0.0-amd64.deb');
});

test('pickAsset returns null without a matching asset', () => {
  assert.equal(pickAsset([], 'linux'), null);
  assert.equal(pickAsset(null, 'win32'), null);
});

test('assetKind classifies downloads', () => {
  assert.equal(assetKind('x.exe'), 'exe');
  assert.equal(assetKind('X.APPIMAGE'), 'appimage');
  assert.equal(assetKind('x.deb'), 'deb');
  assert.equal(assetKind('x.dmg'), 'dmg');
  assert.equal(assetKind('x.zip'), 'unknown');
});

test('repoSlug is read from package.json', () => {
  assert.equal(repoSlug(), 'Eisballi/eisballis-markdown-viewer');
});
