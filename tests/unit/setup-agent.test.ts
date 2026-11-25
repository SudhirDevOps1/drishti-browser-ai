import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSetup } from '../../scripts/setup-agent.mjs';

describe('setup-agent.mjs zero-clone MCP & skill registration', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes OpenCode, Claude, Antigravity, and Cursor configs plus SKILL.md into target home', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'drishti-setup-'));
    tempDirs.push(tmpHome);

    const token = 'a'.repeat(64);
    const result = runSetup({
      homeDir: tmpHome,
      client: 'all',
      port: '7483',
      token,
      dryRun: false,
    });

    expect(result.configured).toHaveLength(4);
    expect(result.tokenPreview).toBe('****aaaa');

    const opencodeCfg = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.config', 'opencode', 'opencode.json'), 'utf8')
    );
    expect(opencodeCfg.mcp['drishti-browser-ai'].enabled).toBe(true);
    expect(opencodeCfg.mcp['drishti-browser-ai'].environment.BRIDGE_AUTH_TOKEN).toBe(token);

    expect(
      fs.existsSync(path.join(tmpHome, '.config', 'opencode', 'skills', 'drishti-browser-agent', 'SKILL.md'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpHome, '.gemini', 'config', 'skills', 'drishti-browser-agent', 'SKILL.md'))
    ).toBe(true);
  });
});
