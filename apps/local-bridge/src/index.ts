import { BridgeServer } from './bridge-server.js';
import { generateAuthToken } from './auth.js';
import { logger } from './logger.js';

const PORT = parseInt(process.env.BRIDGE_WS_PORT || '7483', 10);
const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || generateAuthToken();

logger.info(`Starting Drishti Browser AI Bridge v0.1.0`);
logger.info(`WebSocket port: ${PORT}`);
logger.info(`Auth token: ${AUTH_TOKEN}`);
logger.info('Copy this token into the extension settings.');

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
