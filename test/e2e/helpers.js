'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const electronBinary = require('electron');
const projectRoot = path.join(__dirname, '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Polls the DevTools endpoint. Fails fast when the child process itself could not be
 * started (for example `spawn ETXTBSY` right after the Electron binary was unpacked).
 */
async function waitForTarget(port, failure, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (failure.error) throw failure.error;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch {
      /* devtools endpoint not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Electron did not expose a DevTools target in time');
}

function connect(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 1;

    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { res, rej });
        socket.send(JSON.stringify({ id, method, params }));
      });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.rej(new Error(message.error.message));
      else entry.res(message.result);
    });
    socket.addEventListener('error', reject);
    socket.addEventListener('open', () => {
      const evaluate = async (expression) => {
        const result = await send('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: true,
        });
        if (result.exceptionDetails) {
          const description =
            (result.exceptionDetails.exception && result.exceptionDetails.exception.description) ||
            result.exceptionDetails.text;
          throw new Error(`Evaluation failed: ${description}`);
        }
        return result.result ? result.result.value : undefined;
      };

      resolve({ evaluate, close: () => socket.close() });
    });
  });
}

function stop(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}

/**
 * Waits until the renderer DOM and its API bridge are available.
 */
async function waitForRenderer(evaluate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate(
        `Boolean(document.getElementById('status-version') && document.getElementById('status-version').textContent)`,
      );
      if (ready) return;
    } catch {
      /* the document is still loading */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Renderer did not become ready in time');
}

/**
 * Starts the real Electron app with an isolated profile and the given document.
 * The DevTools protocol is used for assertions, so the app runs unmodified.
 */
async function launchApp(documentPath, attempt = 1) {
  const port = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eisballi-e2e-'));

  const child = spawn(
    electronBinary,
    ['.', `--remote-debugging-port=${port}`, ...(process.env.CI ? ['--no-sandbox'] : []), documentPath],
    {
      cwd: projectRoot,
      env: { ...process.env, EISBALLI_USER_DATA: userDataDir },
      stdio: 'ignore',
      windowsHide: true,
    },
  );

  const exited = new Promise((resolve) => child.once('exit', resolve));

  // Right after `npm ci` the Electron binary can still be busy (`spawn ETXTBSY`),
  // so spawn errors are captured and turned into a retry.
  const failure = { error: null };
  child.once('error', (error) => {
    failure.error = error;
  });

  let target;
  try {
    target = await waitForTarget(port, failure);
  } catch (error) {
    // A stale instance, a still-busy binary (`spawn ETXTBSY`) or a busy port can
    // swallow the first start, so retry a few times with a growing delay.
    stop(child);
    fs.rmSync(userDataDir, { recursive: true, force: true });
    if (attempt >= 6) throw error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return launchApp(documentPath, attempt + 1);
  }

  const session = await connect(target.webSocketDebuggerUrl);
  await waitForRenderer(session.evaluate);

  return {
    evaluate: session.evaluate,
    async shutdown() {
      try {
        session.close();
      } catch {
        /* already closed */
      }
      stop(child);
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

module.exports = { launchApp };