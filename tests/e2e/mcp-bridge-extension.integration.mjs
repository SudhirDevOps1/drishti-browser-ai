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
  <a id="filter-link" href="/filtered.html?lang=ts">TypeScript Filter</a>
  <a href="/trending/typescript?since=daily">TypeScript</a>
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

    // Seed auth token & ephemeral bridge port into extension storage, then trigger reconnect
    const optPage = await context.newPage();
    await optPage.goto(`chrome-extension://${extId}/src/options/options.html`);
    await optPage.evaluate(async ({ tok, port }) => {
      await chrome.storage.local.set({ bridgeAuthToken: tok, automationEnabled: true, bridgePort: port });
      await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION', token: tok, port }).catch(() => {});
    }, { tok: token, port: wsPort });

    // Also verify extension background loads and can execute against fixture page
    const page = await context.newPage();
    await page.goto(fixtureUrl);
    assert.equal(await page.title(), 'Drishti Fixture');
    console.log(`[INT OK] Fixture page loaded at ${fixtureUrl}`);

    // Connect MCP stdio server to ephemeral bridge and wait for extension registration
    const mcpEntry = path.join(ROOT, 'apps', 'mcp-server', 'dist', 'index.js');
    const mcp = spawn(process.execPath, [mcpEntry], {
      env: { ...process.env, BRIDGE_WS_URL: `ws://127.0.0.1:${wsPort}`, BRIDGE_AUTH_TOKEN: token },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let mcpBuf = '';
    const pending = new Map();
    mcp.stdout.on('data', (d) => {
      mcpBuf += d.toString();
      let nl;
      while ((nl = mcpBuf.indexOf('\n')) >= 0) {
        const line = mcpBuf.slice(0, nl).trim();
        mcpBuf = mcpBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id && pending.has(msg.id)) {
            const { resolve } = pending.get(msg.id);
            pending.delete(msg.id);
            resolve(msg);
          }
        } catch {}
      }
    });
    let rpcId = 1;
    const callRpc = (method, params) => new Promise((resolve, reject) => {
      const id = rpcId++;
      const t = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, 15000);
      pending.set(id, {
        resolve: (msg) => { clearTimeout(t); resolve(msg); },
      });
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

    await callRpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'int', version: '1.0' } });

    // Wait for extension to connect to ephemeral bridge
    let connected = false;
    let lastStatusTxt = '';
    for (let i = 0; i < 15; i++) {
      const st = await callRpc('tools/call', { name: 'browser_status', arguments: {} });
      lastStatusTxt = st?.result?.content?.[0]?.text || '';
      if (!st?.result?.isError && (lastStatusTxt.includes('bridgeConnected') || lastStatusTxt.includes('CONNECTED'))) {
        connected = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.ok(connected, `Extension should connect to ephemeral bridge via bridgePort (last: ${lastStatusTxt})`);
    console.log('[INT OK] Extension connected to ephemeral Local Bridge');

    // Regression: navigate TWICE to the same fixture URL, then click immediately without wait_for
    const nav1 = await callRpc('tools/call', { name: 'browser_navigate', arguments: { url: fixtureUrl } });
    const nav1Json = JSON.parse(nav1.result.content[0].text);
    assert.equal(nav1Json.verified, true, 'First navigate must return verified:true');

    const nav2 = await callRpc('tools/call', { name: 'browser_navigate', arguments: { url: fixtureUrl } });
    const nav2Json = JSON.parse(nav2.result.content[0].text);
    assert.equal(nav2Json.verified, true, 'Second same-URL navigate must return verified:true');

    const clickRes = await callRpc('tools/call', { name: 'browser_click', arguments: { selector: '#btn-click' } });
    assert.ok(!clickRes.result.isError, 'Immediate click after double-navigate must succeed without wait_for');
    const statusText = await callRpc('tools/call', { name: 'browser_evaluate', arguments: { fn: "() => document.getElementById('status')?.textContent" } });
    assert.ok(statusText.result.content[0].text.includes('Clicked!'), 'Click must update #status to Clicked!');

    // Fast type (<=60 chars uses instant fill path < 500ms and diff:summary)
    const typeRes = await callRpc('tools/call', { name: 'browser_type', arguments: { selector: 'input[name="email"]', text: 'fast@drishti.dev' } });
    const typeJson = JSON.parse(typeRes.result.content[0].text);
    assert.equal(typeJson.diff, 'summary');
    assert.ok(typeJson.ms < 1500 && typeJson.animated === false, `Expected fast instant fill, got ms=${typeJson.ms}, animated=${typeJson.animated}`);

    // Regression: click sidebar filter link and assert location.href changed
    const filterClick = await callRpc('tools/call', { name: 'browser_click', arguments: { selector: '#filter-link', waitForUrlChange: true } });
    const filterJson = JSON.parse(filterClick.result.content[0].text);
    assert.equal(filterJson.verified, true, 'Filter link click must return verified:true');
    const hrefEval = await callRpc('tools/call', { name: 'browser_evaluate', arguments: { fn: '() => location.href' } });
    assert.ok(hrefEval.result.content[0].text.includes('/filtered.html?lang=ts'), 'Clicking filter link must update location.href');
    console.log('[INT OK] Double same-URL navigate, fast fill, and filter link URL-change verified');

    // Screenshot & PDF disk export checks
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drishti-media-'));
    const pngPath = path.join(outDir, 'fixture.png');
    const pdfPath = path.join(outDir, 'fixture.pdf');

    const shotRes = await callRpc('tools/call', { name: 'browser_screenshot', arguments: { path: pngPath } });
    assert.ok(!shotRes.result.isError, 'browser_screenshot(path) should succeed');
    const pngBuf = fs.readFileSync(pngPath);
    assert.ok(pngBuf.length > 500 && pngBuf[0] === 0x89 && pngBuf[1] === 0x50 && pngBuf[2] === 0x4e && pngBuf[3] === 0x47, 'Saved screenshot must have valid PNG signature');

    // Regression: browser_run screenshot step saves to disk (< 1s, no base64)
    const runPngPath = path.join(outDir, 'run-shot.png');
    const runShotT0 = Date.now();
    const runShotRes = await callRpc('tools/call', {
      name: 'browser_run',
      arguments: { steps: [{ action: 'screenshot', params: { path: runPngPath } }] },
    });
    const runShotMs = Date.now() - runShotT0;
    assert.ok(!runShotRes.result.isError, 'browser_run screenshot step should succeed');
    assert.ok(!runShotRes.result.content[0].text.includes('base64'), 'browser_run screenshot step must not return base64');
    assert.ok(runShotMs < 1000, `browser_run screenshot step must finish <1s, took ${runShotMs}ms`);
    const runPngBuf = fs.readFileSync(runPngPath);
    assert.ok(runPngBuf.length > 500 && runPngBuf[0] === 0x89 && runPngBuf[1] === 0x50, 'browser_run screenshot must create valid PNG');

    // Regression: trending/typescript filter link click changes location.href with 0 stale clicks
    const tsClick = await callRpc('tools/call', {
      name: 'browser_click',
      arguments: { selector: 'a[href*="/trending/typescript"]', waitForUrlChange: true },
    });
    const tsJson = JSON.parse(tsClick.result.content[0].text);
    assert.equal(tsJson.verified, true, 'Trending TypeScript click must return verified:true');
    const tsHref = await callRpc('tools/call', { name: 'browser_evaluate', arguments: { fn: '() => location.href' } });
    assert.ok(tsHref.result.content[0].text.includes('/trending/typescript'), 'Trending TypeScript click must change location.href');

    const pdfRes = await callRpc('tools/call', { name: 'browser_print_pdf', arguments: { path: pdfPath, format: 'A4' } });
    assert.ok(!pdfRes.result.isError, 'browser_print_pdf(path) should succeed');
    const pdfBuf = fs.readFileSync(pdfPath);
    assert.ok(pdfBuf.length > 1000 && pdfBuf.slice(0, 5).toString('ascii') === '%PDF-', 'Saved PDF must have valid %PDF- signature');
    fs.rmSync(outDir, { recursive: true, force: true });
    mcp.kill('SIGTERM');
    console.log('[INT OK] Valid PNG and PDF files verified on disk');

    // 5. Verify MCP server does NOT exit code 13 or hang on wrong auth token (<3s)
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
