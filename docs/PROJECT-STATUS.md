# Project Status — Drishti Browser AI

- **Version:** `0.1.3` (SSOT verified via `node scripts/version.mjs verify`)
- **Build:** `pnpm -r run build` (all workspace projects including `apps/chrome-extension`, `apps/mcp-server`, `apps/local-bridge`, `apps/web-showcase`)
- **Unit Tests:** `pnpm test` (`46/46` passing across 9 files via Vitest)
- **E2E Smoke Tests:** `pnpm test:e2e` (`4/4` Playwright Chromium checks: `popup.html`, `sidepanel.html`, `options.html`, live HTTP fixture)
- **Core Capabilities:**
  - **Native Messaging + Named Pipe** (`com.drishti.bridge` / `\\.\pipe\drishti-bridge`) across Chrome, Brave, Edge & Chromium with automatic `ws://127.0.0.1:7483` fallback
  - **Persistent `chrome.debugger` sessions** (`CdpSessionManager`, 2s attach timeout, 60s idle auto-detach) for low-latency clicks, `evaluate`, and `printToPDF`
  - **Popup Bridge Power Switch (`Turn OFF` / `Turn ON`):** Persists `bridgeEnabled`, cleanly closes Native Host / WebSocket, stops reconnect loops, and detaches debugger sessions
  - **63 MCP Tools** including `browser_evaluate`, `browser_read`, `browser_grep`, `browser_print_pdf`, compact `browser_screenshot({ path })` (~50 tokens), and `browser_audit` filters
  - **Extreme 3-Tab Live Benchmark (NPM + GitHub + Wikipedia):** `97.4%` pass rate (`38/39`), `3,144 ms` p95 latency, `19.15 s` total
  - Persistent SQLite (`node:sqlite`, `schema.sql`) workflow cache, selector cache, TTL task memory, and 5-min undo snapshots
  - Zero-clone `pnpm native:install && pnpm setup:agent` supporting Antigravity, Gemini CLI, OpenCode, Claude Code, Cursor, and OpenAI Codex
- **Known Security/CSP Status:** No `eval()` / `new Function()` or `dangerouslySetInnerHTML` in extension UI/background; auth tokens masked in bridge logs.
