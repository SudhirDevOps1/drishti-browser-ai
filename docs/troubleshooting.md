# Troubleshooting Guide — Drishti Browser AI

Common issues, diagnostics, and step-by-step resolutions for Drishti Browser AI.

---

## 1. Extension Shows "service worker (Inactive)" in Chrome / Brave

### Symptoms
In `chrome://extensions` or `brave://extensions`, under "Inspect views", it says:
`service worker (Inactive)`.

### Root Cause
This is **standard Manifest V3 (MV3) Chromium behavior**. Chromium suspends background service workers after 30 seconds of inactivity to save RAM and battery. 

### Resolution
- **Nothing is broken!**
- The moment you open the popup, click the Sidepanel, or an AI agent sends an MCP command over WebSocket, Chromium wakes up the service worker in 1-2 milliseconds.
- If you click "Inspect views: service worker (Inactive)", DevTools opens and immediately wakes it up to `service worker (Active)`.

---

## 2. Which Folder to Select when Loading Unpacked?

### Symptoms
Error: `Manifest file is missing or unreadable` when trying to load extension.

### Cause
Selecting the TypeScript source directory `apps/chrome-extension/` instead of the compiled build directory.

### Resolution
Always select the compiled directory:
- `<path-to-drishti-browser-ai>\apps\chrome-extension\dist`
  OR
- `<path-to-drishti-browser-ai>/apps/chrome-extension/dist`

---

## 3. "Native Host Not Found" or "Connection Refused on ws://127.0.0.1:7483"

### Symptoms
Options ping test shows `Connection refused` or Native Messaging disconnects.

### Resolution
1. **Recommended (Zero-Token Native Pipe):** Register the Native Messaging host for Chrome, Brave, Edge, and Chromium:
   ```powershell
   pnpm native:install
   ```
   Then reload `extension-ready-to-install/` in `chrome://extensions` or `brave://extensions` and click **Test Bridge Ping**.
2. **If using WebSocket Fallback (`ws://127.0.0.1:7483`):** Start the bridge on demand:
   ```powershell
   $env:BRIDGE_AUTH_TOKEN = (Get-Content ".drishti-token" -Raw).Trim()
   node apps/local-bridge/dist/index.js
   ```

---

## 4. "Authentication Rejected: Invalid Auth Token" (WebSocket Fallback Only)

### Cause
Only applies when using WebSocket fallback (`ws://127.0.0.1:7483`) instead of Native Messaging (`pnpm native:install`).

### Resolution
Either switch to **Native Messaging** (`pnpm native:install`) so no token is needed, or paste the matching token from `.drishti-token` into **Options → Connection & Bridge → Advanced / WebSocket Fallback Settings**.

---

## 5. Chrome Cannot Inject Scripts on Internal Pages

### Cause
For browser security, Chromium strictly blocks extension content scripts on:
- `chrome://*` and `brave://*`
- `chrome-extension://*`
- `https://chromewebstore.google.com/*`

### Resolution
Navigate to any standard website (e.g. `https://www.google.com`, `https://github.com`, `https://wikipedia.org`) before triggering DOM observation or typing commands.
