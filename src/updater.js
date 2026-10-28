'use strict';

/**
 * Update check without third-party dependencies.
 *
 * Two sources:
 *  1. GitHub releases (preferred): compares the installed version with the latest
 *     release and downloads the matching installer when needed.
 *  2. Local git repository (fallback, e.g. a developer checkout): reports new
 *     commits compared to the upstream branch.
 */

const { app, shell } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const USER_AGENT = 'Eisballis-Markdown-Viewer-UpdateChecker';
const REQUEST_TIMEOUT = 12000;
const FALLBACK_REPO = 'Eisballi/eisballis-markdown-viewer';

function repoSlug() {
  const override = process.env.EISBALLI_UPDATE_REPO;
  if (override && /^[\w.-]+\/[\w.-]+$/.test(override)) return override;
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const url = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository && pkg.repository.url) || '';
    const match = /github\.com[:/]+([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i.exec(url.replace(/#.*$/, ''));
    if (match) return `${match[1]}/${match[2]}`;
  } catch {
    /* fall through */
  }
  return FALLBACK_REPO;
}

function versionParts(raw) {
  return String(raw || '0')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part.replace(/\D.*$/, ''), 10) || 0);
}

function isNewer(candidate, reference) {
  const a = versionParts(candidate);
  const b = versionParts(reference);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left !== right) return left > right;
  }
  return false;
}

function pickAsset(assets, platform) {
  const list = Array.isArray(assets) ? assets : [];
  const byName = (regex) => list.find((asset) => regex.test(asset.name || ''));
  if (platform === 'win32') {
    return (
      byName(/setup.*\.exe$/i) ||
      byName(/\.exe$/i) ||
      null
    );
  }
  if (platform === 'darwin') {
    return byName(/\.dmg$/i) || byName(/\.zip$/i) || null;
  }
  return byName(/\.appimage$/i) || byName(/\.deb$/i) || null;
}

function assetKind(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.exe')) return 'exe';
  if (lower.endsWith('.appimage')) return 'appimage';
  if (lower.endsWith('.deb')) return 'deb';
  if (lower.endsWith('.dmg')) return 'dmg';
  return 'unknown';
}

function httpGet(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = require('node:https').get(
      url,
      { headers: { 'User-Agent': USER_AGENT, ...headers } },
      (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location && redirects < 5) {
          response.resume();
          resolve(httpGet(new URL(response.headers.location, url).href, headers, redirects + 1));
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          if (body.length < 3 * 1024 * 1024) body += chunk;
        });
        response.on('end', () => resolve({ status, body, url }));
      },
    );
    request.setTimeout(REQUEST_TIMEOUT, () => request.destroy(new Error('Request timed out')));
    request.on('error', reject);
  });
}

function httpGetJson(url) {
  return httpGet(url, { Accept: 'application/vnd.github+json' }).then((response) => {
    if (response.status !== 200) {
      const error = new Error(`HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return JSON.parse(response.body);
  });
}

function buildResult({ currentVersion, latestVersion, notes, htmlUrl, publishedAt, asset }) {
  const available = latestVersion ? isNewer(latestVersion, currentVersion) : Boolean(asset);
  return {
    status: available ? 'update' : 'current',
    source: 'github',
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    notes: String(notes || '').slice(0, 4000),
    htmlUrl: htmlUrl || '',
    publishedAt: publishedAt || '',
    asset: asset || null,
    checkedAt: Date.now(),
  };
}

async function checkGithub(owner, currentVersion) {
  const release = await httpGetJson(`https://api.github.com/repos/${owner}/releases/latest`);
  const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');
  const asset = pickAsset(release.assets, process.platform);
  return buildResult({
    currentVersion,
    latestVersion,
    notes: release.body,
    htmlUrl: release.html_url,
    publishedAt: release.published_at,
    asset: asset
      ? {
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size || 0,
          kind: assetKind(asset.name),
        }
      : null,
  });
}

/**
 * Fallback without the API (e.g. when the GitHub rate limit is hit): reads the
 * public release page and the downloads linked there.
 */
async function checkGithubReleasePage(owner, currentVersion) {
  const pageUrl = `https://github.com/${owner}/releases/latest`;
  const page = await httpGet(pageUrl, { Accept: 'text/html' });
  if (page.status !== 200) throw new Error(`HTTP ${page.status}`);

  const tagMatch = /\/releases\/tag\/([^"'?#\s]+)/.exec(page.url + ' ' + page.body);
  const latestVersion = tagMatch ? decodeURIComponent(tagMatch[1]).replace(/^v/i, '') : '';

  const downloads = [...new Set(
    [...page.body.matchAll(/\/[\w.-]+\/[\w.-]+\/releases\/download\/[^"'\s<>\\]+/g)].map((match) =>
      match[0].replace(/&amp;/g, '&'),
    ),
  )];

  const assets = downloads.map((downloadPath) => ({
    name: decodeURIComponent(downloadPath.split('/').pop() || 'update'),
    browser_download_url: `https://github.com${downloadPath}`,
    size: 0,
  }));

  const asset = pickAsset(assets, process.platform);
  return buildResult({
    currentVersion,
    latestVersion,
    notes: '',
    htmlUrl: `https://github.com/${owner}/releases/latest`,
    asset: asset
      ? {
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size || 0,
          kind: assetKind(asset.name),
        }
      : null,
  });
}

function git(repoDir, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile('git', ['-C', repoDir, ...args], { timeout, windowsHide: true }, (error, stdout) => {
      resolve({ ok: !error, stdout: String(stdout || '').trim() });
    });
  });
}

async function checkGitRepository(appRoot, currentVersion, settings) {
  const candidate = settings && settings.devRepoPath ? settings.devRepoPath : appRoot;
  if (!candidate || !fs.existsSync(path.join(candidate, '.git'))) return null;

  await git(candidate, ['fetch', '--quiet', '--prune'], 20000);
  const behind = await git(candidate, ['rev-list', '--count', 'HEAD..@{u}']);
  if (!behind.ok) return null;
  const commitsBehind = Number.parseInt(behind.stdout, 10) || 0;

  const upstreamPkg = await git(candidate, ['show', '@{u}:package.json']);
  let upstreamVersion = currentVersion;
  if (upstreamPkg.ok) {
    try {
      upstreamVersion = JSON.parse(upstreamPkg.stdout).version || currentVersion;
    } catch {
      /* ignore */
    }
  }

  const hasChanges = commitsBehind > 0 || isNewer(upstreamVersion, currentVersion);
  return {
    status: hasChanges ? 'update' : 'current',
    source: 'git',
    currentVersion,
    latestVersion: upstreamVersion,
    commitsBehind,
    repoPath: candidate,
    asset: null,
    notes: '',
    checkedAt: Date.now(),
  };
}

async function checkForUpdates({ owner, currentVersion, settings, appRoot }) {
  const errors = [];

  if (owner) {
    try {
      return await checkGithub(owner, currentVersion);
    } catch (error) {
      errors.push(`GitHub-API: ${error.message}`);
      try {
        return await checkGithubReleasePage(owner, currentVersion);
      } catch (fallbackError) {
        errors.push(`Release-Seite: ${fallbackError.message}`);
      }
    }
  }

  try {
    const gitResult = await checkGitRepository(appRoot, currentVersion, settings);
    if (gitResult) return gitResult;
  } catch (error) {
    errors.push(`Git: ${error.message}`);
  }

  return {
    status: 'no-source',
    source: null,
    currentVersion,
    latestVersion: currentVersion,
    notes: errors.join(', '),
    asset: null,
    checkedAt: Date.now(),
  };
}

function download(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const request = require('node:https').get(
      url,
      { headers: { 'User-Agent': USER_AGENT } },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).href;
          resolve(download(nextUrl, destination, onProgress));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed (HTTP ${response.statusCode})`));
          return;
        }

        const total = Number(response.headers['content-length'] || 0);
        let received = 0;
        const file = fs.createWriteStream(destination);

        response.on('data', (chunk) => {
          received += chunk.length;
          onProgress({ received, total, percent: total ? Math.round((received / total) * 100) : 0 });
        });
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve(destination)));
        file.on('error', reject);
      },
    );
    request.setTimeout(REQUEST_TIMEOUT, () => request.destroy(new Error('Request timed out')));
    request.on('error', reject);
  });
}

function runDetached(command, args, options = {}) {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', ...options });
  child.unref();
  return child;
}

async function launchWindowsInstaller(installerPath) {
  const exeToRelaunch = app.getPath('exe');
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const script = [
    // Give the app time to exit before its files are replaced.
    'Start-Sleep -Milliseconds 2000',
    `Start-Process -FilePath ${quote(installerPath)} -ArgumentList '/S' -Wait`,
    'Start-Sleep -Milliseconds 1000',
    `Start-Process -FilePath ${quote(exeToRelaunch)}`,
  ].join('; ');
  runDetached('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script]);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function launchLinuxUpdate(filePath, kind) {
  await fsp.chmod(filePath, 0o755);
  if (kind === 'deb') {
    runDetached('xdg-open', [filePath]);
    return;
  }

  const runningAppImage = process.env.APPIMAGE;
  if (runningAppImage && runningAppImage.toLowerCase().endsWith('.appimage')) {
    // Replace the running AppImage with the new build and start it.
    const script = [
      'sleep 3',
      `cp -f ${shellQuote(filePath)} ${shellQuote(runningAppImage)}`,
      `chmod +x ${shellQuote(runningAppImage)}`,
      `exec ${shellQuote(runningAppImage)}`,
    ].join(' && ');
    runDetached('bash', ['-c', script]);
    return;
  }

  runDetached('bash', ['-c', `sleep 3 && exec ${shellQuote(filePath)}`]);
}

async function installUpdate({ payload, send }) {
  const asset = payload && payload.asset;
  if (!asset || !asset.url) {
    return { ok: false, reason: 'no-asset' };
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'eisballi-update-'));
  const target = path.join(tempDir, asset.name || 'update.bin');

  send({ phase: 'download', percent: 0, total: asset.size || 0 });

  try {
    await download(asset.url, target, (progress) => {
      send({ phase: 'download', ...progress });
    });
  } catch (error) {
    return { ok: false, reason: 'download-failed', message: error.message };
  }

  send({ phase: 'install', percent: 100 });

  try {
    if (process.platform === 'win32' && asset.kind === 'exe') {
      await launchWindowsInstaller(target);
    } else if (process.platform === 'linux') {
      await launchLinuxUpdate(target, asset.kind);
    } else {
      shell.showItemInFolder(target);
      return { ok: true, manual: true, filePath: target };
    }
  } catch (error) {
    return { ok: false, reason: 'launch-failed', message: error.message, filePath: target };
  }

  return { ok: true, filePath: target };
}

module.exports = { repoSlug, checkForUpdates, installUpdate, isNewer, pickAsset, assetKind };
