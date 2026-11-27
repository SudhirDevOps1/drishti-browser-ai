# Architecture Documentation — Drishti Browser AI

## 1. System Philosophy & Objectives

Drishti Browser AI is engineered around five fundamental architectural tenets:
1. **Universal Multi-Agent Compatibility:** Seamless connection with Antigravity, OpenCode, Claude Code, Cursor, Codex, Windsurf, and custom MCP clients.
2. **Lightweight & High Efficiency:** Runs comfortably on modest hardware (e.g., Windows i5, 8GB RAM). Model reasoning is offloaded to the user's connected AI provider without heavy local LLM overhead.
3. **Dual Browser Operating Modes:**
   - **Mode A (Existing Chrome):** Bridges into user-authorized tabs in their daily browser profile, preserving existing SSO sessions, cookies, and local state.
   - **Mode B (Dedicated Browser):** Spawns or manages an isolated browser profile/window dedicated exclusively to AI exploration.
4. **Hybrid Page Understanding Engine:** Combines structured DOM analysis with visual viewport screenshots and accessibility trees.
5. **Zero-Trust Security Boundaries:** Protected authentication tokens, local-only communication (`127.0.0.1`), absolute prohibition against extracting passwords or automated submission of financial checkouts.

---

## 2. Component Topology

```
+-------------------------------------------------------------------------+
|                              AI Agent Layer                              |
|   (Antigravity / OpenCode / Claude Code / Cursor / Codex / Custom MCP)   |
+------------------------------------+------------------------------------+
                                     | stdio (JSON-RPC)
                                     v
+------------------------------------+------------------------------------+
|                      apps/mcp-server (Node.js)                          |
|  - Official @modelcontextprotocol/sdk Server                            |
|  - 63 Registered & Validated Tools                                      |
|  - Structured Error Handlers & Parameter Validation                     |
+------------------------------------+------------------------------------+
                                     | In-process bridge client
                                     v
+------------------------------------+------------------------------------+
|                     apps/local-bridge (Node.js)                         |
|  - Native Messaging Host (stdin/stdout 4-byte JSON) + Named Pipe        |
|  - Optional Authenticated WebSocket Fallback (127.0.0.1:7483)           |
|  - Command Router & Request-Response Correlator                         |
+------------------------------------+------------------------------------+
                                     | Native Pipe (or ws://127.0.0.1:7483)
                                     v
+------------------------------------+------------------------------------+
|                  apps/chrome-extension (Manifest V3)                   |
|  - Background Service Worker (Native/WS dual-transport + CdpSessionMgr) |
|  - Content Scripts (console interception, DOM queries, Visual HUD)      |
|  - React 18 Popup Dashboard, Sidepanel Control Deck & Options           |
+------------------------------------+------------------------------------+
                                     | Chrome Extension APIs + Persistent CDP
                                     v
+------------------------------------+------------------------------------+
|                Chrome / Brave / Edge / Chromium Browser                 |
|  - Live DOM & Accessibility Tree                                        |
|  - Persistent chrome.debugger Sessions (60s idle auto-detach)           |
|  - Script Injection (chrome.scripting.executeScript)                    |
+-------------------------------------------------------------------------+
```

---

## 3. Communication Protocol

### Primary: Native Messaging + Named Pipe (Zero Token)
1. The extension calls `chrome.runtime.connectNative('com.drishti.bridge')`, and Chromium spawns `apps/local-bridge/dist/index.js --native-host` on demand (verified via `allowed_origins` Extension ID).
2. The Native Host opens `\\.\pipe\drishti-bridge` (Windows) / `/tmp/drishti-bridge.sock` (POSIX) for MCP clients (`BridgeClient`).

### Fallback: WebSocket Handshake (`ws://127.0.0.1:7483`)
1. If Native Messaging is not installed, the extension falls back to `ws://127.0.0.1:7483` and authenticates with `{ "type": "auth", "token": "<64-hex-token>" }`.
2. The bridge performs constant-time comparison against `process.env.BRIDGE_AUTH_TOKEN`, replying `{ "type": "auth_ok" }` or `{ "type": "auth_fail" }` before closing (`4003`).

### Command Execution Cycle
1. The AI Agent calls an MCP tool (e.g. `browser_click({ selector: "button#submit" })`).
2. `apps/mcp-server` validates input against its Zod schema.
3. `apps/mcp-server` formats an internal command:
   ```json
   { "id": "uuid-v4", "action": "CLICK", "payload": { "selector": "button#submit" } }
   ```
4. The bridge forwards the message over the active WebSocket connection to Chrome.
5. Chrome's background service worker handles the action via `chrome.scripting.executeScript`.
6. Chrome sends back the result:
   ```json
   { "id": "uuid-v4", "success": true, "result": { "clicked": "button#submit" } }
   ```
7. The bridge resolves the pending promise and responds to the MCP client.

---

## 4. Package Responsibilities

- **`packages/shared-types`**: Pure TypeScript contracts, enums, constants, and JSON schemas. Zero runtime dependencies.
- **`packages/permission-engine`**: Security enforcement rules, domain allow/block matching, and sensitive field blacklist.
- **`packages/dom-engine`**: Standalone DOM exploration and accessibility tree generators intended for execution inside page contexts.
- **`packages/visual-engine`**: Screenshot metadata structures, viewport metrics, and image comparison algorithms.
- **`packages/browser-core`**: High-level controller abstractions and page observer interfaces.
- **`packages/workflow-engine`**: Task queues, priority management, and execution monitors for multi-step tasks.
- **`packages/mcp-tools`**: Shared tool manifests and metadata definitions.
