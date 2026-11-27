#!/usr/bin/env node
/**
 * Drishti MCP Reliability Benchmark (Real MCP stdio tools/call + Transcript Token Accounting)
 * Usage: node scripts/benchmark.mjs [--runs 20] [--tasks T01,T02] [--raw-ws] [--out benchmark-results.json]
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const RUNS = parseInt(getArg('--runs', '20'), 10);
const TASK_FILTER = getArg('--tasks', '').split(',').filter(Boolean);
const RAW_WS_MODE = args.includes('--raw-ws');
const OUT = getArg('--out', join(ROOT, 'benchmark-results.json'));
const PORT = process.env.BRIDGE_WS_PORT || 7483;
const WS_URL = `ws://127.0.0.1:${PORT}`;
const TOKEN = process.env.BRIDGE_AUTH_TOKEN || readTokenFile();

function readTokenFile() {
  const p = join(ROOT, '.drishti-token');
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : '';
}

const TASKS = JSON.parse(readFileSync(join(ROOT, 'tests/benchmark/agent-tasks.json'), 'utf8')).tasks;

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Drishti Fixture</title>
  <style>
    body { margin: 0; font-family: Inter, sans-serif; background: #080d1b; color: #f4f7ff; padding: 32px 20px 120px; }
    .wrap { max-width: 920px; margin: 0 auto; display: grid; gap: 20px; }
    .card { background: #0c1428; border: 1px solid #1e2b4d; border-radius: 14px; padding: 18px; }
    input, textarea, select { width: 100%; background: #070b16; color: #f4f7ff; border: 1px solid #24345d; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
    button { background: linear-gradient(90deg, #00e5ff, #625bff); color: #050b17; border: 0; border-radius: 10px; padding: 9px 16px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Drishti Fixture Page</h1>
      <div id="s">Idle</div>
      <form onsubmit="event.preventDefault(); document.getElementById('s').textContent='Form Submitted';">
        <input id="email-in" name="email" type="email" placeholder="agent@drishti.dev" />
        <textarea id="paste-in" name="notes" rows="2" placeholder="Paste target"></textarea>
        <button id="btn-click" type="button" onclick="const el=document.getElementById('s'); el.dataset.n=(Number(el.dataset.n||0)+1); el.textContent='Clicked ('+el.dataset.n+')';">Click Me</button>
      </form>
    </div>
    <div class="card">
      <table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody><tr><td>Alpha</td><td>$10</td></tr><tr><td>Beta</td><td>$20</td></tr></tbody></table>
      <a href="https://example.com/docs">Docs</a>
    </div>
  </div>
</body>
</html>`;

function charsToTokens(chars) {
  return Math.max(1, Math.ceil(chars / 4));
}

function p95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

function checkExpect(result, expect) {
  if (!expect) return true;
  const { field, contains, equals, minLength } = expect;
  const val = field ? result?.[field] : result;
  if (equals !== undefined) return val === equals;
  if (contains !== undefined) return String(val || '').includes(String(contains));
  if (minLength !== undefined) return Array.isArray(val) ? val.length >= minLength : (val?.length ?? 0) >= minLength;
  return true;
}

/* ─── Real MCP stdio Client ─────────────────────────────────────────────── */
class McpStdioClient {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.proc = null;
    this.toolsListRaw = '';
  }

  async start() {
    const mcpEntry = join(ROOT, 'apps', 'mcp-server', 'dist', 'index.js');
    this.proc = spawn(process.execPath, [mcpEntry], {
      env: { ...process.env, BRIDGE_AUTH_TOKEN: TOKEN, BRIDGE_WS_URL: WS_URL },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            clearTimeout(p.timer);
            p.resolve({ msg, raw: line });
          }
        } catch {}
      }
    });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'drishti-benchmark', version: '1.1.0' },
    });
    this.notify('notifications/initialized', {});
    const listRes = await this.request('tools/list', {});
    this.toolsListRaw = listRes.resRaw || '';
  }

  notify(method, params) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  request(method, params, timeoutMs = 20000) {
    const id = this.nextId++;
    const reqObj = { jsonrpc: '2.0', id, method, params };
    const reqRaw = JSON.stringify(reqObj);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({
          error: new Error(`MCP timeout: ${method} after ${timeoutMs}ms`),
          reqRaw,
          resRaw: JSON.stringify({ error: `MCP timeout after ${timeoutMs}ms` }),
        });
      }, timeoutMs);
      this.pending.set(id, {
        timer,
        resolve: ({ msg, raw }) => resolve({ msg, reqRaw, resRaw: raw }),
      });
      this.proc.stdin.write(reqRaw + '\n');
    });
  }

  async callTool(name, argsObj) {
    const { msg, reqRaw, resRaw } = await this.request('tools/call', { name, arguments: argsObj });
    if (msg.error) {
      throw { error: new Error(msg.error.message || JSON.stringify(msg.error)), reqRaw, resRaw };
    }
    const textPart = msg.result?.content?.find((c) => c.type === 'text')?.text ?? '{}';
    let parsed;
    try {
      parsed = JSON.parse(textPart);
    } catch {
      parsed = { text: textPart };
    }
    if (msg.result?.isError) {
      throw { error: new Error(parsed?.error || textPart), reqRaw, resRaw };
    }
    return { parsed, reqRaw, resRaw };
  }

  close() {
    try {
      this.proc?.kill('SIGTERM');
    } catch {}
  }
}

/* ─── Raw WS Diagnostic Pre-check ───────────────────────────────────────── */
async function checkBridgeOnline() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`BRIDGE DOWN: Cannot connect to ${WS_URL}. Run: pnpm bridge:start`));
    }, 3000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: TOKEN, client: 'mcp' }));
    }, { once: true });
    ws.addEventListener('message', (ev) => {
      clearTimeout(timer);
      const msg = JSON.parse(String(ev.data));
      try { ws.close(); } catch {}
      if (msg.type === 'auth:ok' || msg.type === 'auth_ok') resolve(true);
      else reject(new Error(`BRIDGE AUTH FAILED: ${JSON.stringify(msg)}`));
    }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`BRIDGE ERROR: Connection failed on ${WS_URL}. Run: pnpm bridge:start`));
    }, { once: true });
  });
}

async function runTaskViaMcp(mcp, task, runNum, activeTabId, schemaCacheTokens) {
  const start = Date.now();
  const params = { ...(task.params || {}) };
  if (params.tabId === '$ACTIVE_TAB') params.tabId = activeTabId;

  try {
    const { parsed, reqRaw, resRaw } = await mcp.callTool(task.tool, params);
    const durationMs = Date.now() - start;
    const passed = checkExpect(parsed, task.expect);
    const tokens_input = charsToTokens(reqRaw.length);
    const tokens_output = charsToTokens(resRaw.length);
    const tokens_reasoning = 0;
    const tokens_cache_read = runNum === 1 ? schemaCacheTokens : 0;
    const payload_tokens = tokens_input + tokens_output;
    const session_tokens = payload_tokens + tokens_reasoning + tokens_cache_read;
    return {
      run: runNum,
      ok: passed,
      durationMs,
      tokens_input,
      tokens_output,
      tokens_reasoning,
      tokens_cache_read,
      payload_tokens,
      session_tokens,
      error: passed ? null : 'expectation failed',
    };
  } catch (caught) {
    const durationMs = Date.now() - start;
    const errObj = caught?.error instanceof Error ? caught.error : caught instanceof Error ? caught : new Error(String(caught));
    const reqRaw = caught?.reqRaw || JSON.stringify({ method: 'tools/call', params: { name: task.tool, arguments: params } });
    const resRaw = caught?.resRaw || JSON.stringify({ error: errObj.message });
    const tokens_input = charsToTokens(reqRaw.length);
    const tokens_output = charsToTokens(resRaw.length); // Never 0 on failure
    const tokens_cache_read = runNum === 1 ? schemaCacheTokens : 0;
    const payload_tokens = tokens_input + tokens_output;
    const session_tokens = payload_tokens + tokens_cache_read;
    return {
      run: runNum,
      ok: false,
      durationMs,
      tokens_input,
      tokens_output,
      tokens_reasoning: 0,
      tokens_cache_read,
      payload_tokens,
      session_tokens,
      error: errObj.message,
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(76));
  console.log(`  DRISHTI MCP RELIABILITY BENCHMARK v0.1.3 (${RAW_WS_MODE ? 'RAW-WS' : 'MCP STDIO tools/call'})`);
  console.log('='.repeat(76));

  if (!TOKEN) {
    console.error('ERROR: No auth token. Set BRIDGE_AUTH_TOKEN or create .drishti-token');
    process.exit(1);
  }

  try {
    await checkBridgeOnline();
    console.log(`Bridge verified online at ${WS_URL}`);
  } catch (err) {
    console.error(`\n[BRIDGE DOWN] ${err.message}\n`);
    writeFileSync(OUT, JSON.stringify({ timestamp: new Date().toISOString(), bridgeDown: true, error: err.message, tasks: [] }, null, 2));
    process.exit(1);
  }

  const fixtureServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FIXTURE_HTML);
  });
  await new Promise((res) => {
    fixtureServer.once('error', () => res());
    fixtureServer.listen(9876, '127.0.0.1', () => res());
  });

  const mcp = new McpStdioClient();
  const tasks = TASK_FILTER.length ? TASKS.filter((t) => TASK_FILTER.includes(t.id)) : TASKS;
  const results = [];

  try {
    await mcp.start();
    const schemaTokensTotal = charsToTokens(mcp.toolsListRaw.length);
    const schemaPerTask = Math.round(schemaTokensTotal / Math.max(1, tasks.length));
    console.log(`MCP stdio initialized (tools/list schema overhead: ~${schemaTokensTotal} tokens)\n`);

    const statusRes = await mcp.callTool('browser_status', {});
    const activeTabId = statusRes.parsed?.activeTabId;

    for (const task of tasks) {
      const runs = [];
      for (let i = 1; i <= RUNS; i++) {
        const r = await runTaskViaMcp(mcp, task, i, activeTabId, schemaPerTask);
        runs.push(r);
        await new Promise((res) => setTimeout(res, 60));
      }
      const passCount = runs.filter((r) => r.ok).length;
      const runSuccessPct = Math.round((passCount / RUNS) * 100);
      const firstTryOk = runs[0].ok;
      const retryOk = runs.some((r) => r.ok);
      const flaked = passCount > 0 && passCount < RUNS;
      const p95Ms = p95(runs.map((r) => r.durationMs));
      const avgPayloadTok = Math.round(runs.reduce((s, r) => s + r.payload_tokens, 0) / runs.length);
      const totalSessionTok = runs.reduce((s, r) => s + r.session_tokens, 0);

      console.log(
        `  ${task.id} ${task.name.padEnd(18)} ${passCount}/${RUNS} (${runSuccessPct}%) | p95=${p95Ms}ms | payload~${avgPayloadTok} tok | session~${totalSessionTok} tok${flaked ? ' [FLAKED]' : ''}`
      );
      results.push({
        taskId: task.id,
        name: task.name,
        first_try_ok: firstTryOk,
        retry_ok: retryOk,
        runSuccessPct,
        p95Ms,
        flaked,
        avgPayloadTokens: avgPayloadTok,
        totalSessionTokens: totalSessionTok,
        runs,
      });
    }
  } finally {
    mcp.close();
    fixtureServer.close();
  }

  const totalTasks = results.length;
  const totalRuns = totalTasks * RUNS;
  const passedRuns = results.reduce((s, t) => s + t.runs.filter((r) => r.ok).length, 0);
  const perRunPct = Math.round((passedRuns / Math.max(1, totalRuns)) * 100);
  const firstTryOkCount = results.filter((r) => r.first_try_ok).length;
  const retryOkCount = results.filter((r) => r.retry_ok).length;
  const firstTryPct = Math.round((firstTryOkCount / totalTasks) * 100);
  const retryPct = Math.round((retryOkCount / totalTasks) * 100);
  const flakeCount = results.filter((r) => r.flaked).length;
  const overallP95Ms = p95(results.flatMap((r) => r.runs.map((x) => x.durationMs)));
  const totalPayloadTokens = results.reduce((s, r) => s + r.avgPayloadTokens, 0);
  const totalSessionTokens = results.reduce((s, r) => s + r.totalSessionTokens, 0);

  console.log('\n' + '='.repeat(76));
  console.log(`  MCP PATH RESULTS (${totalTasks} tasks x ${RUNS} runs = ${totalRuns} executions)`);
  console.log(`  First-try success rate : ${firstTryPct}% (${firstTryOkCount}/${totalTasks})`);
  console.log(`  Retry success rate     : ${retryPct}% (${retryOkCount}/${totalTasks})`);
  console.log(`  Per-run success rate   : ${perRunPct}% (${passedRuns}/${totalRuns})`);
  console.log(`  Flake count            : ${flakeCount}`);
  console.log(`  Overall p95 latency    : ${overallP95Ms}ms`);
  console.log(`  Payload tokens (1x)    : ~${totalPayloadTokens}`);
  console.log(`  Session tokens (${RUNS}x)   : ~${totalSessionTokens}`);
  console.log('='.repeat(76) + '\n');

  const report = {
    timestamp: new Date().toISOString(),
    version: '0.1.3',
    transport: RAW_WS_MODE ? 'raw-ws' : 'mcp-stdio',
    runs: RUNS,
    summary: {
      totalTasks,
      totalRuns,
      passedRuns,
      perRunPct,
      firstTryOkCount,
      retryOkCount,
      firstTryPct,
      retryPct,
      flakeCount,
      overallP95Ms,
      totalPayloadTokens,
      totalSessionTokens,
    },
    targets: { firstTryPct: 90, retryPct: 98 },
    meetsTargets: firstTryPct >= 90 && retryPct >= 98,
    tasks: results,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Report saved to: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
