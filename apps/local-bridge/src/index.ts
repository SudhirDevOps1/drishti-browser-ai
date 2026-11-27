import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeServer, getDefaultPipePath } from './bridge-server.js';
import { generateAuthToken } from './auth.js';
import { logger } from './logger.js';
import { attachNativeStdioTransport } from './native-host.js';

const IS_NATIVE_HOST = process.argv.includes('--native-host');
if (IS_NATIVE_HOST) {
  process.env.DRISHTI_NATIVE_HOST = '1';
}

function readRootVersion(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const rootPkgPath = path.resolve(dir, '../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8')) as { version?: string };
    return pkg.version || '0.1.3';
  } catch {
    return '0.1.3';
  }
}

function readLocalToken(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const tokenPath = path.resolve(dir, '../../../.drishti-token');
    if (fs.existsSync(tokenPath)) {
      const val = fs.readFileSync(tokenPath, 'utf8').trim();
      if (val) return val;
    }
  } catch {}
  return '';
}

const PORT = parseInt(process.env.BRIDGE_WS_PORT || '7483', 10);
const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || readLocalToken() || generateAuthToken();
const VERSION = readRootVersion();

logger.info(`Starting Drishti Browser AI Bridge v${VERSION}${IS_NATIVE_HOST ? ' [Native Host]' : ''}`);
logger.info(`Named Pipe: ${getDefaultPipePath()}`);
logger.info(`WebSocket port: ${PORT}${IS_NATIVE_HOST ? ' (optional fallback)' : ''}`);
if (!IS_NATIVE_HOST) {
  logger.info(`Auth token: ****${AUTH_TOKEN.slice(-4)} (configured)`);
}

const bridge = new BridgeServer({
  port: PORT,
  authToken: AUTH_TOKEN,
  optionalWs: IS_NATIVE_HOST,
});

await bridge.start();

if (IS_NATIVE_HOST) {
  const nativeTransport = attachNativeStdioTransport({
    onMessage: (msg) => {
      void bridge.handleNativeMessage(msg as any);
    },
    onClose: () => {
      logger.info('Native Messaging pipe closed by browser; shutting down.');
      bridge.detachNativeExtension(nativeTransport);
      void bridge.stop().then(() => process.exit(0));
    },
    onError: (err) => {
      logger.warn(`Native Messaging framing error: ${err.message}`);
    },
  });
  bridge.attachNativeExtension(nativeTransport);
} else {
  logger.info('Bridge ready. Waiting for Chrome Extension connection...');
}

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await bridge.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bridge.stop();
  process.exit(0);
});
