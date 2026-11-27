#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { client: 'auto', port: '7483', token: '', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--client' && argv[i + 1]) args.client = argv[++i];
    else if (a === '--port' && argv[i + 1]) args.port = argv[++i];
    else if (a === '--token' && argv[i + 1]) args.token = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function isPredictableToken(token) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return true;
  if (/^(.)\1{63}$/.test(token)) return true;
  if (/^(0123456789abcdef)+$/i.test(token)) return true;
  return false;
}

function ensureToken(explicitToken, dryRun) {
  const tokenFile = path.join(repoRoot, '.drishti-token');
  if (explicitToken && /^[a-f0-9]{64}$/i.test(explicitToken)) {
    if (!dryRun) fs.writeFileSync(tokenFile, explicitToken, 'utf8');
    return explicitToken;
  }
  if (fs.existsSync(tokenFile)) {
    const existing = fs.readFileSync(tokenFile, 'utf8').trim();
    if (isPredictableToken(existing)) {
      console.error('❌ ERROR: .drishti-token contains a predictable placeholder token (e.g. repeated chars). Delete .drishti-token or regenerate a random 64-hex token.');
      process.exit(1);
    }
    return existing;
  }
  const fresh = crypto.randomBytes(32).toString('hex');
  if (!dryRun) fs.writeFileSync(tokenFile, fresh, 'utf8');
  return fresh;
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeJsonSafe(filePath, data, dryRun) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function installSkill(targetDir, dryRun) {
  const skillContent = `---
name: drishti-browser-agent
description: Autonomous Chrome/Brave browser controller via Drishti Browser AI MCP. Prefer browser_run, workflow_match/browser_task, browser_observe, and @eN refs over screenshots after every click.
---

# Drishti Browser AI — Agent Protocol (v0.1.3)

1. **Check SQLite Workflow Cache First**: Call \`workflow_match({ query })\` or \`browser_task({ goal })\` before planning clicks from scratch.
2. **Use \`browser_run({ steps, goal })\` for Multi-Step Flows**: Batch \`navigate\`, \`wait_for\`, \`click\`, \`type\`, \`extract\`, \`tables\`, and \`verify\` in one call (compact diffs, 30s budget, auto-cached on success).
3. **Avoid Redundant Screenshots**: Use \`browser_observe()\` and \`browser_snapshot()\` (\`@e1\`, \`@e2\` refs) instead of \`browser_screenshot()\` after every click. Use \`browser_tools({ query })\` when lazy discovery (\`DRISHTI_LAZY_TOOLS=1\`) is active.
4. **Tab Isolation, Downloads & Human Handoff**: Pin your target tab with \`browser_use_tab({ tabId })\`. Use \`browser_download()\` for silent downloads, \`browser_handle_save_dialog()\` for \`blob:\` Save As dialogs, \`browser_wait_download()\` for large files, \`browser_confirm()\` before delete/submit/payment, \`browser_request_human_help({ kind, reason })\` for CAPTCHA/2FA/login, and \`browser_audit({ last })\` to inspect failures.
5. **Fast Typing & Known Limits**: Use \`browser_fill()\` or \`browser_type()\`. Never script \`chrome://\` URLs or solve CAPTCHAs; \`browser_batch_compare\` is capped at 3 URLs.
`;
  if (!dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillContent, 'utf8');
  }
}

function upsertCodexToml(tomlPath, mcpEntry, token, wsUrl, dryRun) {
  const existing = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, 'utf8') : '';
  const cleanEntry = mcpEntry.replace(/\\/g, '/');
  const block = [
    '[mcp_servers.drishti-browser-ai]',
    'command = "node"',
    `args = ["${cleanEntry}"]`,
    '',
    '[mcp_servers.drishti-browser-ai.env]',
    `BRIDGE_AUTH_TOKEN = "${token}"`,
    `BRIDGE_WS_URL = "${wsUrl}"`,
    '',
  ].join('\n');

  const sectionRe = /\[mcp_servers\.drishti-browser-ai\][\s\S]*?(?=\n\[(?!mcp_servers\.drishti-browser-ai\.)|$)/;
  const next = sectionRe.test(existing)
    ? existing.replace(sectionRe, block.trimEnd())
    : (existing ? existing.trimEnd() + '\n\n' : '') + block;

  if (!dryRun) {
    fs.mkdirSync(path.dirname(tomlPath), { recursive: true });
    fs.writeFileSync(tomlPath, next, 'utf8');
  }
}

export function runSetup(options = {}) {
  const home = options.homeDir || os.homedir();
  const client = (options.client || 'auto').toLowerCase();
  const port = options.port || '7483';
  const dryRun = Boolean(options.dryRun);
  const token = ensureToken(options.token || '', dryRun);
  const mcpEntry = path.join(repoRoot, 'apps', 'mcp-server', 'dist', 'index.js');
  const wsUrl = `ws://127.0.0.1:${port}`;
  const configured = [];

  const want = (name, detectDir) => {
    if (client === 'all' || client === name) return true;
    if (client === 'auto' && detectDir) return fs.existsSync(detectDir);
    return false;
  };

  // 1. Google Antigravity (~/.gemini/antigravity/mcp_config.json + skill)
  if (want('antigravity', path.join(home, '.gemini', 'antigravity'))) {
    const agyPath = path.join(home, '.gemini', 'antigravity', 'mcp_config.json');
    const agy = readJsonSafe(agyPath);
    agy.mcpServers = agy.mcpServers || {};
    agy.mcpServers['drishti-browser-ai'] = {
      command: 'node',
      args: [mcpEntry],
      env: { BRIDGE_AUTH_TOKEN: token, BRIDGE_WS_URL: wsUrl },
    };
    writeJsonSafe(agyPath, agy, dryRun);
    installSkill(path.join(home, '.gemini', 'config', 'skills', 'drishti-browser-agent'), dryRun);
    configured.push({ client: 'antigravity', config: agyPath });
  }

  // 2. Gemini CLI (~/.gemini/settings.json + skill)
  if (want('gemini', path.join(home, '.gemini'))) {
    const geminiPath = path.join(home, '.gemini', 'settings.json');
    const gemini = readJsonSafe(geminiPath);
    gemini.mcpServers = gemini.mcpServers || {};
    gemini.mcpServers['drishti-browser-ai'] = {
      command: 'node',
      args: [mcpEntry],
      env: { BRIDGE_AUTH_TOKEN: token, BRIDGE_WS_URL: wsUrl },
    };
    writeJsonSafe(geminiPath, gemini, dryRun);
    installSkill(path.join(home, '.gemini', 'skills', 'drishti-browser-agent'), dryRun);
    configured.push({ client: 'gemini', config: geminiPath });
  }

  // 3. OpenCode (~/.config/opencode/opencode.json + skill)
  if (want('opencode', path.join(home, '.config', 'opencode'))) {
    const ocConfigPath = path.join(home, '.config', 'opencode', 'opencode.json');
    const ocConfig = readJsonSafe(ocConfigPath);
    ocConfig.mcp = ocConfig.mcp || {};
    ocConfig.mcp['drishti-browser-ai'] = {
      type: 'local',
      command: ['node', mcpEntry],
      enabled: true,
      environment: {
        BRIDGE_AUTH_TOKEN: token,
        BRIDGE_WS_URL: wsUrl,
      },
    };
    writeJsonSafe(ocConfigPath, ocConfig, dryRun);
    installSkill(path.join(home, '.config', 'opencode', 'skills', 'drishti-browser-agent'), dryRun);
    configured.push({ client: 'opencode', config: ocConfigPath });
  }

  // 4. Claude Code (~/.claude/mcp.json + skill)
  if (want('claude', path.join(home, '.claude'))) {
    const claudePath = path.join(home, '.claude', 'mcp.json');
    const claude = readJsonSafe(claudePath);
    claude.mcpServers = claude.mcpServers || {};
    claude.mcpServers['drishti-browser-ai'] = {
      command: 'node',
      args: [mcpEntry],
      env: { BRIDGE_AUTH_TOKEN: token, BRIDGE_WS_URL: wsUrl },
    };
    writeJsonSafe(claudePath, claude, dryRun);
    installSkill(path.join(home, '.claude', 'skills', 'drishti-browser-agent'), dryRun);
    configured.push({ client: 'claude', config: claudePath });
  }

  // 5. Cursor (~/.cursor/mcp.json)
  if (want('cursor', path.join(home, '.cursor'))) {
    const cursorPath = path.join(home, '.cursor', 'mcp.json');
    const cursor = readJsonSafe(cursorPath);
    cursor.mcpServers = cursor.mcpServers || {};
    cursor.mcpServers['drishti-browser-ai'] = {
      command: 'node',
      args: [mcpEntry],
      env: { BRIDGE_AUTH_TOKEN: token, BRIDGE_WS_URL: wsUrl },
    };
    writeJsonSafe(cursorPath, cursor, dryRun);
    configured.push({ client: 'cursor', config: cursorPath });
  }

  // 6. OpenAI Codex (~/.codex/config.toml + skill)
  if (want('codex', path.join(home, '.codex'))) {
    const codexPath = path.join(home, '.codex', 'config.toml');
    upsertCodexToml(codexPath, mcpEntry, token, wsUrl, dryRun);
    installSkill(path.join(home, '.codex', 'skills', 'drishti-browser-agent'), dryRun);
    configured.push({ client: 'codex', config: codexPath });
  }

  return {
    repoRoot,
    mcpEntry,
    wsUrl,
    token,
    tokenPreview: `****${token.slice(-4)}`,
    tokenFile: path.join(repoRoot, '.drishti-token'),
    configured,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = parseArgs(process.argv.slice(2));
  const summary = runSetup(args);
  console.log('[Drishti Setup] Completed zero-clone MCP & Skill registration:');
  console.log(JSON.stringify({ ...summary, token: undefined }, null, 2));
  console.log('\n[Drishti Setup] 64-Char Auth Token (copy and paste into Chrome Extension Settings -> Connection & Bridge):');
  console.log(summary.token);
}
