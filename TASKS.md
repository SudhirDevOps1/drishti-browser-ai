# TASKS.md — Drishti Browser AI

## Completed
- [x] Monorepo architecture (`apps/chrome-extension`, `apps/local-bridge`, `apps/mcp-server`, `packages/*`)
- [x] WebSocket bridge (`127.0.0.1:7483`) with timing-safe 64-char hex token auth & origin/DoS hardening
- [x] Target Tab Locking, Master AI Safety Switch, Self-Healing Selector Memory
- [x] Voice Command Input (`en-IN` / `hi-IN`) + Options MV3 mic permission helper
- [x] Custom Saved Macros (`chrome.storage.local`)
- [x] Auto-attached Live Console & Network Error Drawer (`chrome.storage.session`)
- [x] Persistent Shadow DOM Cubic Bézier Cursor + Fading Trail + `HOVER` + `Cursor: natural/demo/fast` + optional Trusted CDP Mode
- [x] Husky + Commitlint + Release Please + Enterprise Pre-Release Channels (`alpha`/`beta`/`rc`/`stable`) + Version SSOT
- [x] Playwright Chromium E2E Smoke Test (`pnpm test:e2e`) in GitHub Actions CI
- [x] Remove `window.eval()` sink from `executeScript` for MV3 CSP & Web Store compliance

## Next / Optional
- [ ] Trigger first Release Please PR / Chrome Web Store ZIP submission
- [ ] Add multi-tab screenshot comparison & recorded replay tests in `tests/e2e/`
