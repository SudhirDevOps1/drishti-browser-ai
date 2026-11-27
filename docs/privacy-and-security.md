# 🛡️ Privacy & Security Architecture — Drishti Browser AI (दृष्टि)

Drishti Browser AI is designed from the ground up as a **100% local-first, zero-telemetry** browser automation platform. Your browsing sessions, cookies, and page data never leave your machine through Drishti.

---

## 1. Local-Only Transport (No Cloud Relay)
- **Native Messaging + Named Pipe (`com.drishti.bridge` / `\\.\pipe\drishti-bridge`)**: Primary transport uses OS-level stdio & user-scoped Named Pipes authenticated by Chromium's `allowed_origins` Extension ID (`odkkfmhjfeajecjabjaliglinfbaaege`) — zero external ports or token copy-paste.
- **WebSocket Fallback (`127.0.0.1:7483`)**: When WebSocket fallback is used, it binds strictly to `localhost` (`127.0.0.1`) with constant-time 64-char hex token verification (`4002`/`4003` on failure).
- **Zero Telemetry / Analytics**: Drishti sends zero usage metrics, crash reports, or DOM snapshots to any external server.

---

## 2. Strict On-Demand Execution (No Background Persistence)
- **No Auto-Start Scripts**: Drishti does **not** install Windows Startup shortcuts, scheduled tasks, or silent background services.
- **Browser-Managed Lifecycle**: With Native Messaging, Chrome/Brave/Edge spawns the host only while the extension connects and shuts it down on browser exit. In WebSocket fallback mode, `pnpm bridge:start` runs only when you start it.

---

## 3. In-Browser Safety & Privacy Guardrails
- **Master AI Toggle (`AI: ON` / `AI: PAUSED`)**: Instantly blocks all MCP and CLI automation commands (except read-only `status` / `health` checks) at the background service worker gatekeeper.
- **Emergency Stop Button**: Immediately halts running tasks from the Control Deck.
- **Target Tab Locking (`Crosshair`)**: Pins AI actions strictly to one selected tab so your other open tabs remain untouched.
- **Password Field Protection**: `typeText` and `extractDomSnapshot` explicitly refuse to read values from or type into `input[type="password"]` fields.
- **Domain Allowlist & Blocklist**: Configure blocked domains (e.g., banking portals, `accounts.google.com`) or restrict automation strictly to an allowlist inside **Settings → Security & Boundaries**.

---

## 4. Chrome Extension Permissions Explained

| Permission | Why It Is Needed |
| :--- | :--- |
| `tabs` / `activeTab` | List open tabs, switch/pin target tabs, and navigate URLs. |
| `scripting` | Run semantic DOM extraction, fuzzy click/type, and visual cyan element highlights. |
| `storage` | Save auth token, locked tab ID, safety mode, and last 10 Mission History items locally. |
| `sidePanel` | Render the **Drishti Control Deck** alongside your active web page. |
| `downloads` | Display your recent browser downloads in the Sidepanel with 1-click Open / Folder actions. |
| `notifications` / `tabGroups` | Notify on task events and organize multi-tab workflows. |
