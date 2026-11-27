# Project Memory — Drishti Browser AI (दृष्टि)

## Project Identity
- **Name:** drishti-browser-ai
- **Current version:** 0.1.0
- **Type:** Monorepo (pnpm workspaces)
- **Purpose:** Universal AI Browser Automation Platform via MCP
- **Target:** Windows 10/11, Chrome MV3, Node.js ≥ 20

## Architecture Decisions

### ADR-001: WebSocket Bridge (not Native Messaging)
- **Decision:** Use WebSocket on `ws://127.0.0.1:7483` for extension↔bridge communication
- **Reason:** Simpler setup, TypeScript-native, easier to debug, no native host manifest required
- **Trade-off:** Requires the bridge process to be running (acceptable — it starts with the MCP server)

### ADR-002: Co-located MCP Server + Bridge Client
- **Decision:** MCP server and bridge client live in `apps/mcp-server`, bridge server in `apps/local-bridge`
- **Reason:** For simple stdio MCP use, one `node dist/index.js` command starts everything

### ADR-003: DOM-First, Visual Second
- **Decision:** Try DOM extraction first, fall back to screenshot-based observation
- **Reason:** More token-efficient, more precise interaction with DOM elements

### ADR-004: Content-Script-Based Interaction
- **Decision:** All click/type/scroll/etc. via `chrome.scripting.executeScript` injected functions
- **Reason:** Works in MV3, no CDP dependency, secure, sandboxed

### ADR-005: Auth Token Security
- **Decision:** 32-byte random hex token, constant-time comparison, stored in chrome.storage.local
- **Reason:** Prevents unauthorized local connections, timing attack safe

## Current Status
- [x] shared-types package — COMPLETE & COMPILED
- [x] local-bridge — COMPLETE & TESTED (ws:7483 + auth verified)
- [x] mcp-server — COMPLETE & COMPILED (62 tools registered)
- [x] chrome-extension — COMPLETE & BUILT (Manifest V3 + React + Tailwind + background SW + content + sidepanel + popup + options)
- [x] permission-engine — COMPLETE & COMPILED & TESTED
- [x] workflow-engine — COMPLETE & COMPILED
- [x] dom-engine package — COMPLETE & COMPILED
- [x] visual-engine package — COMPLETE & COMPILED
- [x] browser-core package — COMPLETE & COMPILED
- [x] mcp-tools package — COMPLETE & COMPILED
- [x] unit tests — COMPLETE (19/19 passing via vitest)
- [x] version sync — VERIFIED (0.1.0 stable)
- [x] documentation — COMPLETE (Windows install, MCP tools ref, architecture, troubleshooting, dev setup, agent integrations)

## Package Dependency Graph
```
chrome-extension → (no internal deps, Chrome APIs only)
mcp-server → shared-types
local-bridge → shared-types
permission-engine → shared-types
workflow-engine → shared-types, permission-engine
browser-core → shared-types, dom-engine, visual-engine, permission-engine
mcp-tools → shared-types
```

## Known Limitations (Honest)
1. `chrome.tabs.captureVisibleTab` only captures visible viewport (not full page scroll)
2. iframes with cross-origin src cannot be fully inspected (browser security)
3. Shadow DOM elements require special selector handling (prefix: `>>`)  
4. Chrome may not allow scripting on `chrome://`, `chrome-extension://`, or `edge://` pages
5. Auto-reconnect adds ~3s delay when bridge restarts

## Files That Must Stay Current
- `MEMORY.md` (this file)
- `HANDOFF.md` — session state
- `TASKS.md` — task list
- All `package.json` versions must match root `package.json`
