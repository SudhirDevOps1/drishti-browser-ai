import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BridgeClient } from './bridge-client.js';
import { MemoryStore } from './db/memory-store.js';
import { registerAllTools } from './tools/index.js';

function readRootVersion(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const rootPkgPath = path.resolve(dir, '../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8')) as { version?: string };
    return pkg.version || '0.1.1';
  } catch {
    return '0.1.1';
  }
}

const BRIDGE_WS_URL = process.env.BRIDGE_WS_URL || 'ws://127.0.0.1:7483';
const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || '';

const bridge = new BridgeClient(BRIDGE_WS_URL, AUTH_TOKEN);
const store = new MemoryStore();

const server = new Server(
  { name: 'drishti-browser-ai', version: readRootVersion() },
  { capabilities: { tools: {} } }
);

await bridge.connect();
registerAllTools(server, bridge, store);

const transport = new StdioServerTransport();
await server.connect(transport);

const shutdown = async () => {
  await bridge.disconnect();
  store.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
