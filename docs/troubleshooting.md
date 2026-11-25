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

## 3. "Connection Refused on ws://127.0.0.1:7483"

### Symptoms
Options ping test shows:
`Connection refused on ws://127.0.0.1:7483. Make sure bridge is running with 'pnpm bridge:start'`

### Resolution
1. Verify the bridge process is listening in PowerShell:
   ```powershell
   Get-NetTCPConnection -LocalPort 7483
   ```
2. If nothing is listening, start the bridge daemon:
   ```powershell
   $env:BRIDGE_AUTH_TOKEN = "YOUR_64_CHARACTER_BRIDGE_TOKEN"
   cd "<path-to-drishti-browser-ai>\apps\local-bridge"
   node dist/index.js
   ```
3. In Chrome/Brave Settings, make sure the token is entered:
   `YOUR_64_CHARACTER_BRIDGE_TOKEN`
4. Click **Test Bridge Ping**.

---

## 4. "Authentication Rejected: Invalid Auth Token"

### Cause
Mismatch between the token configured in the bridge daemon and the token saved in the extension settings.

### Resolution
The active 64-character SHA-256 token is:
```
YOUR_64_CHARACTER_BRIDGE_TOKEN
```
Copy and paste this exact token into Settings and click **Save Changes**.

---

## 5. Chrome Cannot Inject Scripts on Internal Pages

### Cause
For browser security, Chromium strictly blocks extension content scripts on:
- `chrome://*` and `brave://*`
- `chrome-extension://*`
- `https://chromewebstore.google.com/*`

### Resolution
Navigate to any standard website (e.g. `https://www.google.com`, `https://github.com`, `https://wikipedia.org`) before triggering DOM observation or typing commands.
