# Project Status — Drishti Browser AI

- **Version:** `0.1.1` (SSOT verified via `node scripts/version.mjs verify`)
- **Build:** `pnpm -r run build` (all workspace projects including `apps/chrome-extension`, `apps/mcp-server`, `apps/local-bridge`, `apps/web-showcase`)
- **Unit Tests:** `pnpm test` (`24/24` passing across 5 files via Vitest)
- **E2E Smoke Tests:** `pnpm test:e2e` (`4/4` Playwright Chromium checks: `popup.html`, `sidepanel.html`, `options.html`, live HTTP fixture)
- **Core Capabilities:**
  - Auto-reconnecting `BridgeClient` with configurable `BRIDGE_COMMAND_TIMEOUT_MS`
  - Persistent SQLite (`node:sqlite`, `schema.sql`) workflow cache, selector cache, TTL task memory, and 5-min undo snapshots
  - Semantic `@eN` DOM refs, instant text insertion (`TYPE`/`FILL`), inline image screenshots, silent `chrome.downloads`, and `browser_confirm` safety gate
  - Zero-clone `pnpm setup:agent` supporting Antigravity, Gemini CLI, OpenCode, Claude Code, Cursor, and OpenAI Codex
- **Known Security/CSP Status:** No `eval()` / `new Function()` or `dangerouslySetInnerHTML` in extension UI/background; auth tokens masked in bridge logs.
