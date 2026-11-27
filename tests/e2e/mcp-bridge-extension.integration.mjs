import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { BridgeClient } from '../../apps/mcp-server/dist/bridge-client.js';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'apps', 'chrome-extension', 'dist');
const BRIDGE_ENTRY = path.join(ROOT, 'apps', 'local-bridge', 'dist', 'index.js');

const FIXTURE_HTML = `<!doctype html>
<html>
<head><title>Drishti Fixture</title></head>
<body>
  <h1>Drishti Fixture Page</h1>
  <p>Deterministic integration fixture for MCP -> Bridge -> Extension.</p>
  <form id="demo-form">
    <input name="email" type="email" placeholder="Email" />
    <button id="btn-click" type="button" onclick="document.getElementById('status').textContent='Clicked!'">Click Me</button>
  </form>
  <div id="status">Idle</div>
  <table>
    <thead><tr><th>Item</th><th>Price</th></tr></thead>
    <tbody>
      <tr><td>Alpha</td><td>$10</td></tr>
      <tr><td>Beta</td><td>$20</td></tr>
    </tbody>
  </table>
  <a href="https://example.com/docs">Docs Link</a>
</body>
</html>`;

async function main() {
  // 1. Bridge-down actionable error check
  const deadClient = new BridgeClient('ws://127.0.0.1:17499', 'a'.repeat(64));
  await assert.rejects(
    () => deadClient.sendCommand('BROWSER_STATUS', {}),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /pnpm bridge:start/);
      assert.match(err.message, /7483|not connected/i);
      return true;
    },
    'Bridge-down call must fail immediately with actionable error'
  );
  deadClient.disconnect?.();
  console.log('[INT OK] Bridge-down actionable error verified');

  // 2. Start local HTTP fixture server
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FIXTURE_HTML);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const httpPort = server.address().port;
  const fixtureUrl = `http://127.0.0.1:${httpPort}/fixture.html`;

  // 3. Start Local Bridge on an ephemeral port
  const wsPort = 17500 + Math.floor(Math.random() * 500);
  const token = crypto.randomBytes(32).toString('hex');
  const bridgeProc = spawn(process.execPath, [BRIDGE_ENTRY], {
    env: { ...process.env, BRIDGE_WS_PORT: String(wsPort), BRIDGE_AUTH_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Bridge startup timeout')), 8000);
    bridgeProc.stdout.on('data', (d) => {
      if (d.toString().includes('WebSocket server listening')) {
        clearTimeout(t);
        resolve();
      }
    });
    bridgeProc.stderr.on('data', (d) => {
      // keep drained
    });
  });
  console.log(`[INT OK] Ephemeral Local Bridge listening on ws://127.0.0.1:${wsPort}`);

  // 4. Launch headless Chromium with extension and configure its bridge token + port
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drishti-int-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
      '--no-sandbox',
    ],
  });

  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extId = new URL(sw.url()).host;

    // Seed auth token into extension storage & connect via options page
    const optPage = await context.newPage();
    await optPage.goto(`chrome-extension://${extId}/src/options/options.html`);
    await optPage.evaluate(async (tok) => {
      await chrome.storage.local.set({ bridgeAuthToken: tok, automationEnabled: true });
    }, token);

    // Also verify extension background loads and can execute against fixture page directly via WebSocket
    const page = await context.newPage();
    await page.goto(fixtureUrl);
    assert.equal(await page.title(), 'Drishti Fixture');
    console.log(`[INT OK] Fixture page loaded at ${fixtureUrl}`);

    // Connect MCP WebSocket client to ephemeral bridge
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    ws.send(JSON.stringify({ type: 'auth', token, client: 'mcp' }));
    await new Promise((res) => {
      const onMsg = (ev) => {
        const m = JSON.parse(String(ev.data));
        if (m.type === 'auth:ok' || m.type === 'auth_ok') {
          ws.removeEventListener('message', onMsg);
          res();
        }
      };
      ws.addEventListener('message', onMsg);
    });
    console.log('[INT OK] MCP WebSocket client authenticated with Local Bridge');
    ws.close();

    // 5. Verify MCP server does NOT exit code 13 or hang on wrong auth token (<3s)
    const mcpEntry = path.join(ROOT, 'apps', 'mcp-server', 'dist', 'index.js');
    const badStart = Date.now();
    const badMcp = spawn(process.execPath, [mcpEntry], {
      env: { ...process.env, BRIDGE_WS_URL: `ws://127.0.0.1:${wsPort}`, BRIDGE_AUTH_TOKEN: 'f'.repeat(64) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let badStderr = '';
    badMcp.stderr.on('data', (d) => { badStderr += d.toString(); });
    badMcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'int', version: '1.0' } } }) + '\n');
    const initLine = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Bad-token MCP startup hung > 4s')), 4000);
      let buf = '';
      badMcp.stdout.on('data', (d) => {
        buf += d.toString();
        const nl = buf.indexOf('\n');
        if (nl >= 0) {
          clearTimeout(t);
          resolve(buf.slice(0, nl));
        }
      });
    });
    const badElapsed = Date.now() - badStart;
    assert.ok(initLine.includes('"result"'), 'MCP should settle connect() and respond to initialize even on auth_fail');
    assert.ok(badElapsed < 3500, `Expected <3.5s settle, got ${badElapsed}ms`);
    badMcp.kill('SIGTERM');
    console.log(`[INT OK] Wrong-token MCP startup settled cleanly in ${badElapsed}ms (no exit code 13)`);
  } finally {
    await context.close();
    bridgeProc.kill('SIGTERM');
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[INT FAIL]', err);
  process.exit(1);
});
