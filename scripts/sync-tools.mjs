#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'apps', 'mcp-server', 'src', 'tools');

const toolNames = new Set();
for (const file of fs.readdirSync(TOOLS_DIR)) {
  if (!file.endsWith('.tools.ts')) continue;
  const src = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8');
  for (const m of src.matchAll(/name:\s*'([a-z0-9_]+)'/g)) {
    toolNames.add(m[1]);
  }
}

const count = toolNames.size;
const replacements = [
  {
    file: 'docs/mcp-tools-reference.md',
    re: /Drishti Browser AI registers \*\*\d+ official browser automation tools\*\*/,
    to: `Drishti Browser AI registers **${count} official browser automation tools**`,
  },
  {
    file: 'docs/developer-setup.md',
    re: /\*\*Total Registered Tools:\*\* \d+ MCP Tools/,
    to: `**Total Registered Tools:** ${count} MCP Tools`,
  },
  {
    file: 'docs/architecture.md',
    re: /- \d+ Registered & Validated Tools/,
    to: `- ${count} Registered & Validated Tools`,
  },
  {
    file: 'MEMORY.md',
    re: /\(\d+ tools registered\)/,
    to: `(${count} tools registered)`,
  },
  {
    file: 'README.md',
    re: /## MCP Tools Catalog \(\d+ Tools\)/,
    to: `## MCP Tools Catalog (${count} Tools)`,
  },
];

for (const { file, re, to } of replacements) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) continue;
  const prev = fs.readFileSync(abs, 'utf8');
  const next = prev.replace(re, to);
  if (next !== prev) {
    fs.writeFileSync(abs, next, 'utf8');
  }
}

console.log(`[sync-tools] Synced ${count} MCP tools across docs.`);
