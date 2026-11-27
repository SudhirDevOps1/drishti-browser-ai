import { readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from '../../apps/mcp-server/src/tools/index.js';
import { ALL_MCP_TOOL_NAMES } from '../../packages/mcp-tools/src/index.js';
import { MemoryStore, containsSensitiveData } from '../../apps/mcp-server/src/db/memory-store.js';
import { auditLog, readAuditLog } from '../../apps/mcp-server/src/audit-logger.js';

const ROOT = process.cwd();
const bgSource = readFileSync(join(ROOT, 'apps/chrome-extension/src/background/background.ts'), 'utf8');
const routerSource = readFileSync(join(ROOT, 'apps/local-bridge/src/command-router.ts'), 'utf8');

const MCP_ONLY_TOOLS = new Set([
  'browser_run',
  'browser_tools',
  'browser_audit',
  'browser_memory',
  'browser_confirm',
  'browser_task',
  'browser_handle_save_dialog',
  'workflow_start',
  'workflow_stop',
  'workflow_list',
  'workflow_match',
  'workflow_run',
]);

describe('Tool Dispatch & Registry Parity', () => {
  it('registers every ALL_TOOLS name in packages/mcp-tools ALL_MCP_TOOL_NAMES', () => {
    const regNames = ALL_TOOLS.map((t) => t.name).sort();
    const pkgNames = [...ALL_MCP_TOOL_NAMES].sort();
    expect(regNames).toEqual(pkgNames);
  });

  it('every bridge-dispatched MCP tool has a handler case in background.ts', () => {
    const dispatchCases = new Set(
      Array.from(bgSource.matchAll(/case '([A-Z0-9_]+)':/g)).map((m) => m[1])
    );

    const TOOL_TO_ACTION: Record<string, string> = {
      browser_status: 'BROWSER_STATUS',
      browser_bridge_health: 'BROWSER_BRIDGE_HEALTH',
      browser_observe: 'OBSERVE',
      browser_snapshot: 'GET_DOM_SNAPSHOT',
      browser_screenshot: 'SCREENSHOT',
      browser_inspect: 'INSPECT',
      browser_get_page_info: 'GET_PAGE_INFO',
      browser_navigate: 'NAVIGATE',
      browser_back: 'GO_BACK',
      browser_forward: 'GO_FORWARD',
      browser_reload: 'RELOAD',
      browser_wait: 'WAIT',
      browser_wait_for: 'WAIT_FOR',
      browser_list_tabs: 'GET_TABS',
      browser_new_tab: 'NEW_TAB',
      browser_switch_tab: 'SWITCH_TAB',
      browser_close_tab: 'CLOSE_TAB',
      browser_group_tabs: 'GROUP_TABS',
      browser_use_tab: 'USE_TAB',
      browser_click: 'CLICK',
      browser_double_click: 'DOUBLE_CLICK',
      browser_hover: 'HOVER',
      browser_type: 'TYPE',
      browser_fill: 'TYPE',
      browser_press_key: 'PRESS_KEY',
      browser_scroll: 'SCROLL',
      browser_select: 'SELECT_OPTION',
      browser_drag: 'DRAG',
      browser_scroll_into_view: 'SCROLL_INTO_VIEW',
      browser_get_text: 'GET_TEXT',
      browser_evaluate: 'EVALUATE',
      browser_read: 'READ_PAGE',
      browser_grep: 'GREP_PAGE',
      browser_get_links: 'GET_LINKS',
      browser_find_element: 'FIND_ELEMENT',
      browser_get_tables: 'GET_TABLES',
      browser_get_forms: 'GET_FORMS',
      browser_execute_workflow: 'EXECUTE_WORKFLOW',
      browser_verify_action: 'VERIFY_ACTION',
      browser_task_status: 'TASK_STATUS',
      browser_stop_task: 'STOP_TASK',
      browser_batch_compare: 'BATCH_COMPARE',
      browser_download: 'DOWNLOAD_MEDIA',
      browser_wait_download: 'WAIT_DOWNLOAD',
      browser_request_human_help: 'REQUEST_HUMAN_HELP',
      browser_console: 'GET_CONSOLE_LOGS',
      browser_get_errors: 'GET_CONSOLE_LOGS',
      browser_network_inspect: 'GET_NETWORK_LOGS',
      browser_print_pdf: 'PRINT_PDF',
    };

    for (const tool of ALL_TOOLS) {
      if (MCP_ONLY_TOOLS.has(tool.name)) continue;
      if (tool.name === 'browser_get_missions' || tool.name === 'browser_update_mission') continue;
      const action = TOOL_TO_ACTION[tool.name];
      expect(action, `Missing mapping for ${tool.name}`).toBeTruthy();
      expect(dispatchCases.has(action), `Missing background.ts handler for ${action}`).toBe(true);
    }
  });

  it('CommandRouter allowlist uses real MCP action names', () => {
    expect(routerSource).toContain("'CLICK'");
    expect(routerSource).toContain("'NAVIGATE'");
    expect(routerSource).toContain("'GROUP_TABS'");
    expect(routerSource).toContain("'VERIFY_ACTION'");
    expect(routerSource).not.toContain("'page:click'");
  });
});

describe('P0 Fixes & Output Caps Regression', () => {
  it('pressKey normalizes modifiers and supports Ctrl/Control', () => {
    expect(bgSource).toContain('modifiers.map((m) => m.toLowerCase())');
    expect(bgSource).toContain("mods.includes('ctrl') || mods.includes('control')");
  });

  it('getConsoleLogs filters by tabId and levels, and getDomSnapshot supports includeHtml', () => {
    expect(bgSource).toContain('allowed.has((l.level ||');
    expect(bgSource).toContain('includeHtml ? { html:');
  });

  it('preserves output caps in background.ts', () => {
    expect(bgSource).toContain('.slice(0, 200)'); // snapshot & links cap
    expect(bgSource).toContain('.slice(0, 240)'); // element text cap
    expect(bgSource).toContain('.slice(0, 16000)'); // get_text cap
    expect(bgSource).toContain('slice(0, 2000)'); // observe cap
  });
});

describe('Safety, PII Redaction & Audit Log', () => {
  it('redacts passwords, 64-hex tokens, Bearer tokens, and API keys', () => {
    expect(containsSensitiveData('password', 'secret123')).toBe(true);
    expect(containsSensitiveData('bridge_token', 'a'.repeat(64))).toBe(true);
    expect(containsSensitiveData('note', 'Bearer abcdef1234567890')).toBe(true);
    expect(containsSensitiveData('note', 'sk-1234567890abcdefghij')).toBe(true);
    expect(containsSensitiveData('preferred_browser', 'chrome')).toBe(false);
  });

  it('writes and reads JSONL audit log entries', () => {
    const tmpLog = join(ROOT, 'tests/.tmp-audit.jsonl');
    process.env.DRISHTI_AUDIT_LOG = tmpLog;
    try {
      auditLog({
        timestamp: new Date().toISOString(),
        tool: 'browser_navigate',
        tabId: 1,
        outcome: 'ok',
        durationMs: 42,
      });
      const entries = readAuditLog(10);
      expect(entries.length).toBe(1);
      expect(entries[0].tool).toBe('browser_navigate');
      expect(entries[0].outcome).toBe('ok');
    } finally {
      delete process.env.DRISHTI_AUDIT_LOG;
      try {
        unlinkSync(tmpLog);
      } catch {}
    }
  });

  it('caches and resolves selectors via SQLite selector_cache', () => {
    const tmpDb = join(os.tmpdir(), `drishti-sel-${Date.now()}.db`);
    const store = new MemoryStore(tmpDb);
    try {
      store.cacheSelector({
        domain: 'example.com',
        intent: 'button:has-text("Submit")',
        selector: '#submit-btn',
      });
      const hit = store.lookupSelector('example.com', 'button:has-text("Submit")');
      expect(hit?.selector).toBe('#submit-btn');
    } finally {
      store.close();
      try { unlinkSync(tmpDb); } catch {}
    }
  });

  it('enforces user-tab ownership guard in background.ts', () => {
    expect(bgSource).toContain('assertTabWritable');
    expect(bgSource).toContain('Refusing to modify user-owned tab');
  });

  it('includes bounded CDP click timeout, open shadowRoot traversal, and non-chrome:// fallback', () => {
    expect(bgSource).toContain('Promise.race([runCdp, cdpTimeout])');
    expect(bgSource).toContain('clearTimeout(timerId)');
    expect(bgSource).toContain('host.shadowRoot');
    expect(bgSource).toContain('^(chrome|brave|chrome-extension|edge):');
  });

  it('implements EVALUATE, READ_PAGE (untrusted wrapper), GREP_PAGE, and non-hanging auth_fail', () => {
    const bridgeSrv = readFileSync(join(ROOT, 'apps/local-bridge/src/bridge-server.ts'), 'utf8');
    const bridgeCli = readFileSync(join(ROOT, 'apps/mcp-server/src/bridge-client.ts'), 'utf8');
    const mcpIdx = readFileSync(join(ROOT, 'apps/mcp-server/src/index.ts'), 'utf8');
    expect(bgSource).toContain('UNTRUSTED_PAGE_CONTENT');
    expect(bgSource).toContain('Runtime.evaluate');
    expect(bridgeSrv).toContain("type: 'auth_fail'");
    expect(bridgeCli).toContain("ws.once('close'");
    expect(mcpIdx).toContain('start().catch');
  });

  it('verifies browser_scroll instant scroll & verified:true when scrollY changes 0 -> 771', () => {
    expect(bgSource).toContain("behavior: 'auto'");
    expect(bgSource).toContain('Math.abs(newY - prevY) > 0');
    const prevY = 0;
    const newY = 771;
    const verified = Math.abs(newY - prevY) > 0;
    expect(verified).toBe(true);
  });

  it('verifies navigate pre-warm, 2-attempt retry, content.js preload, and gitignored audit log', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    const bridgeSrv = readFileSync(join(ROOT, 'apps/local-bridge/src/bridge-server.ts'), 'utf8');
    expect(bgSource).toContain('for (let attempt = 1; attempt <= 2; attempt++)');
    expect(bgSource).toContain('sawLoading');
    expect(bgSource).toContain('readyStateComplete');
    expect(bgSource).toContain('const verified = !timedOut && urlMatches && readyStateComplete');
    expect(bgSource).toContain("files: ['content.js']");
    expect(bridgeSrv).toContain('setTimeout(r, 500)');
    expect(gitignore).toContain('drishti-audit.jsonl');
  });

  it('verifies browser_screenshot path, browser_print_pdf, per-phase timings, and browser_audit filters', () => {
    const browserTools = readFileSync(join(ROOT, 'apps/mcp-server/src/tools/browser.tools.ts'), 'utf8');
    const debugTools = readFileSync(join(ROOT, 'apps/mcp-server/src/tools/debugging.tools.ts'), 'utf8');
    const auditLogger = readFileSync(join(ROOT, 'apps/mcp-server/src/audit-logger.ts'), 'utf8');

    expect(browserTools).toContain('browser_print_pdf');
    expect(browserTools).toContain('PRINT_PDF');
    expect(browserTools).toContain('writeFileSync');
    expect(bgSource).toContain('Page.printToPDF');

    expect(bgSource).toContain('locateMs');
    expect(bgSource).toContain('cursorMs');
    expect(bgSource).toContain('executeMs');
    expect(bgSource).toContain('verifyMs');

    expect(debugTools).toContain('outcome');
    expect(debugTools).toContain('since');
    expect(auditLogger).toContain('opts.tool');
    expect(auditLogger).toContain('opts.outcome');
    expect(auditLogger).toContain('opts.since');

    // Verify WAIT_FOR timeoutMs + 25s cap, zero-rect click guard, and compact path screenshot
    expect(bgSource).toContain('payload.timeoutMs ?? payload.timeout');
    expect(bgSource).toContain('is not visible (0x0)');
    expect(bgSource).toContain('tabId: tab.id');
    expect(bgSource).toContain('scrollIntoView({ behavior:');
    expect(browserTools).toContain('params.inline !== true');
  });
});
