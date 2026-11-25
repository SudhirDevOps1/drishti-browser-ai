import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSetup } from '../../scripts/setup-agent.mjs';

describe('setup-agent.mjs multi-client MCP & skill registration', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes Antigravity, Gemini CLI, OpenCode, Claude, Cursor, and Codex configs when client=all', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'drishti-setup-all-'));
    tempDirs.push(tmpHome);

    const token = 'a'.repeat(64);
    const result = runSetup({
      homeDir: tmpHome,
      client: 'all',
      port: '7483',
      token,
      dryRun: false,
    });

    expect(result.configured).toHaveLength(6);
    expect(result.tokenPreview).toBe('****aaaa');

    const geminiCfg = JSON.parse(fs.readFileSync(path.join(tmpHome, '.gemini', 'settings.json'), 'utf8'));
    expect(geminiCfg.mcpServers['drishti-browser-ai'].env.BRIDGE_AUTH_TOKEN).toBe(token);

    const codexToml = fs.readFileSync(path.join(tmpHome, '.codex', 'config.toml'), 'utf8');
    expect(codexToml).toContain('[mcp_servers.drishti-browser-ai]');
    expect(codexToml).toContain(`BRIDGE_AUTH_TOKEN = "${token}"`);

    expect(fs.existsSync(path.join(tmpHome, '.gemini', 'skills', 'drishti-browser-agent', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, '.codex', 'skills', 'drishti-browser-agent', 'SKILL.md'))).toBe(true);
  });

  it('auto-detects only installed AI clients when client=auto', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'drishti-setup-auto-'));
    tempDirs.push(tmpHome);

    fs.mkdirSync(path.join(tmpHome, '.codex'), { recursive: true });
    const result = runSetup({
      homeDir: tmpHome,
      client: 'auto',
      port: '7483',
      token: 'b'.repeat(64),
      dryRun: false,
    });

    expect(result.configured.map((c) => c.client)).toEqual(['codex']);
    expect(fs.existsSync(path.join(tmpHome, '.config', 'opencode', 'opencode.json'))).toBe(false);
  });
});
