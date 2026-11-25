import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeServer } from './bridge-server.js';
import { generateAuthToken } from './auth.js';
import { logger } from './logger.js';

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

const PORT = parseInt(process.env.BRIDGE_WS_PORT || '7483', 10);
const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || generateAuthToken();
const VERSION = readRootVersion();

logger.info(`Starting Drishti Browser AI Bridge v${VERSION}`);
logger.info(`WebSocket port: ${PORT}`);
logger.info(`Auth token: ****${AUTH_TOKEN.slice(-4)} (configured)`);
logger.info('Extension settings must use the same 64-char token.');

const bridge = new BridgeServer({ port: PORT, authToken: AUTH_TOKEN });

await bridge.start();
logger.info('Bridge ready. Waiting for Chrome Extension connection...');

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await bridge.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bridge.stop();
  process.exit(0);
});
