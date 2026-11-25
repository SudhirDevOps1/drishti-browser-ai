import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BridgeClient } from './bridge-client.js';
import { registerAllTools } from './tools/index.js';

const BRIDGE_WS_URL = process.env.BRIDGE_WS_URL || 'ws://127.0.0.1:7483';
const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || '';

const bridge = new BridgeClient(BRIDGE_WS_URL, AUTH_TOKEN);

const server = new Server(
  { name: 'sudhir-browser-ai', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

await bridge.connect();
registerAllTools(server, bridge);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', async () => {
  await bridge.disconnect();
  process.exit(0);
});
