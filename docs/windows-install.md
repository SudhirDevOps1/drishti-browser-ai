# Windows Installation & Setup Guide — Drishti Browser AI

Complete, step-by-step setup guide for running **Drishti Browser AI** on Windows 10/11 (64-bit) with Google Chrome, Brave, or any Chromium browser.

---

## 1. System Requirements

- **Operating System:** Windows 10 or Windows 11 (64-bit)
- **Browser:** Google Chrome (v115+) or Brave Browser (supports Manifest V3)
- **Node.js:** v20.x, v22.x, or v26.x LTS ([Download from nodejs.org](https://nodejs.org))
- **Package Manager:** `pnpm` (v9 or v10+)
- **Active Auth Token:** `YOUR_64_CHARACTER_BRIDGE_TOKEN`
- **Default Port:** `7483` (WebSocket)

Verify your environment:
```powershell
node -v
pnpm -v
```

---

## 2. Clone and Build

Open PowerShell in the workspace:

```powershell
cd "<path-to-drishti-browser-ai>"

# Install all workspace dependencies
pnpm install

# Compile all 10 packages & Vite extensions
pnpm build

# Run unit tests (19 passed)
pnpm test
```

---

## 3. Where to Load the Extension in Chrome / Brave (IMPORTANT!)

> [!CAUTION]
> **DO NOT** select `<path-to-drishti-browser-ai>\apps\chrome-extension` directly in Chrome/Brave! That is the TypeScript source code directory with uncompiled `.tsx` files. Chrome will throw an error if you select it.

### Correct Folder to Load:
Select either of the compiled output folders:
- **Primary Build Directory:**
  ```
  <path-to-drishti-browser-ai>\apps\chrome-extension\dist
  ```
- **Pre-Synced Ready Directory (Identical Mirror):**
  ```
  <path-to-drishti-browser-ai>/apps/chrome-extension/dist
  ```

### Step-by-Step Loading in Chrome / Brave:
1. In your browser address bar:
   - For **Chrome**: `chrome://extensions/`
   - For **Brave**: `brave://extensions/`
2. In the top-right corner, turn **Developer mode** toggle **ON**.
3. Click **Load unpacked** in the top-left toolbar.
4. Select `<path-to-drishti-browser-ai>/apps/chrome-extension/dist` (or `apps\chrome-extension\dist`).
5. The extension card **"Drishti Browser AI"** (`v0.1.0`) will appear.
6. Pin the extension to your toolbar.

> [!NOTE]
> In Chrome/Brave, you may notice `Inspect views: service worker (Inactive)`. This is normal Chromium Manifest V3 behavior! Chromium automatically puts background workers to sleep when idle to save CPU/RAM. As soon as a WebSocket message or button click occurs, it wakes up within 2ms.

---

## 4. Start Local Bridge Daemon

In PowerShell:
```powershell
$env:BRIDGE_AUTH_TOKEN = "YOUR_64_CHARACTER_BRIDGE_TOKEN"
cd "<path-to-drishti-browser-ai>\apps\local-bridge"
node dist/index.js
```
Output:
```
[INFO] Starting Drishti Browser AI Bridge v0.1.0
[INFO] WebSocket port: 7483
[INFO] Auth token: YOUR_64_CHARACTER_BRIDGE_TOKEN
[INFO] WebSocket server listening on ws://localhost:7483
[INFO] Bridge ready. Waiting for Chrome Extension connection...
```

---

## 5. Configure Extension Settings

1. Click the extension icon in Chrome/Brave toolbar → **Settings**.
2. Paste the 64-character token:
   `YOUR_64_CHARACTER_BRIDGE_TOKEN`
3. Click **Test Bridge Ping**.
4. You will see a green banner:
   `Bridge connected & authenticated (10ms) — Ready for Antigravity & OpenCode!`
5. Click **Save Changes**.

---

## 6. How to Live Test the Platform

### Method A: Interactive Live Test Lab (Inside Extension Options)
1. Open Extension **Settings**.
2. Click **`🧪 Interactive Live Test Lab`** in the left catalog.
3. Test 4 live cards:
   - **Test 1 (Run Ping)**: Validates WebSocket handshake and latency.
   - **Test 2 (Capture Viewport)**: Takes live screenshot of your active tab.
   - **Test 3 (Extract DOM)**: Extracts page title, headings, and link count.
   - **Test 4 (Run Live Mission)**: Autonomously opens Google, searches, and inspects listings.

### Method B: CLI 1-Click Automated Live Test
In terminal, run:
```powershell
cd "<path-to-drishti-browser-ai>"
pnpm test:live
```
Captures live telemetry, validates DOM inspection, and saves a real screenshot proof to `docs/assets/live-test-screenshot.png`.

---

## 7. Connect to AI Agents (Antigravity, Claude, OpenCode, Cursor)

Add to your AI agent's MCP settings:
```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN",
        "BRIDGE_WS_URL": "ws://127.0.0.1:7483"
      }
    }
  }
}
```
