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
|  - 35 Registered & Validated Tools                                      |
|  - Structured Error Handlers & Parameter Validation                     |
+------------------------------------+------------------------------------+
                                     | In-process bridge client
                                     v
+------------------------------------+------------------------------------+
|                     apps/local-bridge (Node.js)                         |
|  - Authenticated WebSocket Server (127.0.0.1:7483)                      |
|  - Constant-time 256-bit Token Verification                             |
|  - Command Router & Request-Response Correlator                         |
+------------------------------------+------------------------------------+
                                     | ws://127.0.0.1:7483
                                     v
+------------------------------------+------------------------------------+
|                  apps/chrome-extension (Manifest V3)                   |
|  - Background Service Worker (manages WebSocket connection & APIs)      |
|  - Content Scripts (console interception, DOM queries)                  |
|  - React 18 Popup Dashboard & Full Side Panel View                      |
+------------------------------------+------------------------------------+
                                     | Chrome Extension APIs
                                     v
+------------------------------------+------------------------------------+
|                        Google Chrome Browser                            |
|  - Live DOM & Accessibility Tree                                        |
|  - Viewport Screen Capture (captureVisibleTab)                          |
|  - Script Injection (chrome.scripting.executeScript)                    |
+-------------------------------------------------------------------------+
```

---

## 3. Communication Protocol

### WebSocket Handshake
1. The local bridge listens on `ws://127.0.0.1:7483`.
2. When Chrome starts or the extension reloads, the Background Service Worker initiates an outbound WebSocket connection to the bridge.
3. The extension immediately sends an authentication payload:
   ```json
   { "type": "auth", "token": "<64-hex-token>" }
   ```
4. The bridge performs constant-time comparison against `process.env.BRIDGE_AUTH_TOKEN`.
5. If valid, the bridge replies with `{ "type": "auth_ok" }`. If invalid, `{ "type": "auth_fail" }` is returned and the socket is closed immediately.

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
