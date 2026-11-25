# Autonomous Workflows, SQLite Cache & Memory — Drishti Browser AI

Drishti Browser AI includes a built-in **SQLite (`node:sqlite`) persistence layer** (`apps/mcp-server/src/db/schema.sql`) so repeated browser tasks do not waste tokens on re-discovering selectors or taking screenshots after every click.

---

## 1. Zero-Screenshot Workflow Loop

1. **Match cached workflows first:**
   ```json
   workflow_match({ "query": "download clips from flow" })
   ```
   Or call `browser_task({ "goal": "..." })` to check cached workflows + observe the current tab in one call.
2. **Use `@eN` semantic refs instead of fragile coordinates:**
   `browser_snapshot()` stamps `@e1`, `@e2`, ... onto interactive elements. Pass `ref: "@e12"` to `browser_click`, `browser_type`, `browser_fill`, or `browser_hover`.
3. **Record once, replay anywhere:**
   - `workflow_start({ "name": "flow-export", "queryPattern": "export flow video", "domain": "labs.google" })`
   - Perform the browser steps normally.
   - `workflow_stop()` — saves all steps into SQLite (`apps/mcp-server/data/drishti-memory.db`).
   - Next time: `workflow_run({ "name": "flow-export", "vars": { "title": "Scene 2" } })`.

---

## 2. Cross-Session Memory (`browser_memory`)

Store non-sensitive site hints, project IDs, or preferences with optional TTL:
- `browser_memory({ "action": "remember", "key": "flow.projectId", "value": "proj_123", "ttlSeconds": 86400 })`
- `browser_memory({ "action": "recall", "key": "flow.projectId" })`
- `browser_memory({ "action": "forget", "key": "flow.projectId" })`

Sensitive tokens, passwords, and emails are automatically blocked by the PII filter.

---

## 3. Silent Downloads & Destructive Safety Gates

- **Silent Downloads:** `browser_download({ "url": "...", "filename": "clip.mp4", "subfolder": "drishti-downloads" })` routes through `chrome.downloads` with `saveAs: false` and `onDeterminingFilename`, avoiding OS "Save As" dialogs.
- **Destructive Gate:** `browser_confirm({ "message": "Delete scene 3?", "action": "DELETE", "target": { "ref": "@e14" } })` logs a 5-minute undo snapshot in SQLite and blocks execution until `approved: true`.
