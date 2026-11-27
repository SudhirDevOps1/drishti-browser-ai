# Windows Installation & Setup Guide — Drishti Browser AI

Complete, step-by-step setup guide for running **Drishti Browser AI** on Windows 10/11 (64-bit) with Google Chrome, Brave, or any Chromium browser.

---

## 1. System Requirements

- **Operating System:** Windows 10 or Windows 11 (64-bit)
- **Browser:** Google Chrome, Brave, Microsoft Edge, or Chromium (Manifest V3)
- **Node.js:** v20.x, v22.x, or v26.x LTS ([Download from nodejs.org](https://nodejs.org))
- **Package Manager:** `pnpm` (v9 or v10+)
- **Primary Transport:** OS Native Messaging (`com.drishti.bridge`) + Named Pipe (`\\.\pipe\drishti-bridge`) — Zero Token
- **Fallback Transport:** Localhost WebSocket (`ws://127.0.0.1:7483`, optional)

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

# Compile all 11 workspace packages & Vite extensions
pnpm -r run build

# Run unit tests (46 passed)
pnpm test

# Register Native Messaging for Chrome, Brave, Edge & Chromium
pnpm native:install
```

For automatic multi-client MCP + skill setup, run:
```powershell
pnpm setup:agent -- --client auto
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
4. Select `<path-to-drishti-browser-ai>\extension-ready-to-install` (or `apps\chrome-extension\dist`).
5. The extension card **"Drishti Browser AI"** (`v0.1.3`) will appear.
6. Pin the extension to your toolbar.

> [!NOTE]
> In Chrome/Brave/Edge, `Inspect views: service worker (Inactive)` is normal Chromium MV3 behavior. When an MCP command arrives over Native Messaging, Chromium wakes the worker automatically.

---

## 4. Zero-Token Native Connection (Default)

Once `pnpm native:install` has been run, **no manual `pnpm bridge:start` or token copy-paste is required**:
1. Open the extension icon → **Options** → **Connection & Bridge**.
2. Click **Test Bridge Ping** to verify green `ONLINE` status over Native Pipe (`\\.\pipe\drishti-bridge`).

### Optional Fallback: Manual WebSocket Bridge (`ws://127.0.0.1:7483`)
Only needed if you intentionally skip `pnpm native:install`:
```powershell
$env:BRIDGE_AUTH_TOKEN = (Get-Content ".drishti-token" -Raw).Trim()
node apps/local-bridge/dist/index.js
```
Then paste the token under **Options → Connection & Bridge → Advanced / WebSocket Fallback Settings**.

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
Captures live telemetry, validates DOM inspection, and verifies the active session.

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
