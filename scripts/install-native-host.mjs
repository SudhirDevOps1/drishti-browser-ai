#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST_NAME = 'com.drishti.bridge';
const HOST_DIR = path.join(ROOT, 'apps', 'local-bridge', 'native-host');
const MANIFEST_PATH = path.join(HOST_DIR, `${HOST_NAME}.json`);
const CMD_PATH = path.join(HOST_DIR, 'drishti-native-host.cmd');
const BRIDGE_ENTRY = path.join(ROOT, 'apps', 'local-bridge', 'dist', 'index.js');
const EXT_MANIFEST_PATH = path.join(ROOT, 'apps', 'chrome-extension', 'public', 'manifest.json');

const WINDOWS_REG_KEYS = [
  `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
  `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`,
  `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
  `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`,
];

function computeExtensionIdFromKey(base64Key) {
  const der = Buffer.from(base64Key, 'base64');
  const hash = crypto.createHash('sha256').update(der).digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    const b = hash[i];
    id += String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15));
  }
  return id;
}

function uninstall() {
  if (process.platform === 'win32') {
    for (const key of WINDOWS_REG_KEYS) {
      try {
        execFileSync('reg', ['delete', key, '/f'], { stdio: 'ignore' });
        console.log(`[NativeHost] Removed registry key: ${key}`);
      } catch {
        // Key may not exist
      }
    }
  }
  if (fs.existsSync(HOST_DIR)) {
    fs.rmSync(HOST_DIR, { recursive: true, force: true });
    console.log(`[NativeHost] Removed ${HOST_DIR}`);
  }
  console.log('[NativeHost] Uninstall complete.');
}

function install() {
  if (!fs.existsSync(EXT_MANIFEST_PATH)) {
    throw new Error(`Extension manifest not found: ${EXT_MANIFEST_PATH}`);
  }
  const extManifest = JSON.parse(fs.readFileSync(EXT_MANIFEST_PATH, 'utf8'));
  if (!extManifest.key) {
    throw new Error('apps/chrome-extension/public/manifest.json is missing deterministic "key"');
  }
  const extId = computeExtensionIdFromKey(extManifest.key);

  fs.mkdirSync(HOST_DIR, { recursive: true });

  const cmdContent = `@echo off\r\n"${process.execPath}" "${BRIDGE_ENTRY}" --native-host\r\n`;
  fs.writeFileSync(CMD_PATH, cmdContent, 'utf8');

  const nativeManifest = {
    name: HOST_NAME,
    description: 'Drishti Browser AI Native Messaging Host',
    path: process.platform === 'win32' ? CMD_PATH : BRIDGE_ENTRY,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extId}/`],
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(nativeManifest, null, 2) + '\n', 'utf8');

  if (process.platform === 'win32') {
    for (const key of WINDOWS_REG_KEYS) {
      execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', MANIFEST_PATH, '/f'], {
        stdio: 'ignore',
      });
      console.log(`[NativeHost] Registered: ${key}`);
    }
  } else {
    console.log(`[NativeHost] Non-Windows OS detected. Copy ${MANIFEST_PATH} to your browser NativeMessagingHosts directory.`);
  }

  console.log(`[NativeHost] Installed ${HOST_NAME} for Extension ID: ${extId}`);
  console.log(`[NativeHost] Manifest: ${MANIFEST_PATH}`);
}

if (process.argv.includes('--uninstall')) {
  uninstall();
} else {
  install();
}
