# Agent Integrations Guide — Drishti Browser AI

Comprehensive connection instructions for every major AI coding agent and MCP application.

> **1-Command Zero-Token Setup:** Run `pnpm native:install && pnpm setup:agent -- --client auto` (or pass `--client antigravity|gemini|opencode|claude|cursor|codex`) inside the Drishti repo root to register Native Messaging (Chrome, Brave, Edge, Chromium), configure MCP, and install the `drishti-browser-agent` skill automatically.
>
> With Native Messaging installed, MCP clients connect over `\\.\pipe\drishti-bridge` without needing `BRIDGE_AUTH_TOKEN` or manual `pnpm bridge:start`. (WebSocket `ws://127.0.0.1:7483` + `BRIDGE_AUTH_TOKEN` remains supported as an optional fallback.)

---

## 1. Google Antigravity (`~/.gemini/antigravity/mcp_config.json`)

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"]
    }
  }
}
```

---

## 2. Gemini CLI (`~/.gemini/settings.json`)

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"]
    }
  }
}
```

---

## 3. OpenCode (`~/.config/opencode/opencode.json`)

```json
{
  "mcp": {
    "drishti-browser-ai": {
      "type": "local",
      "command": ["node", "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "enabled": true
    }
  }
}
```

Verify discovery with `opencode mcp list`.

---

## 4. Claude Code (`~/.claude/mcp.json`)

```bash
claude mcp add drishti-browser-ai node "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"
```

Or configure `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"]
    }
  }
}
```

---

## 5. Cursor (`~/.cursor/mcp.json`)

1. Open **Cursor Settings** (`Ctrl + ,` / `Cmd + ,`) -> **Features** -> **MCP**.
2. Add server `drishti-browser-ai` (`command`: `node "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"`).

---

## 6. OpenAI Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.drishti-browser-ai]
command = "node"
args = ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"]

[mcp_servers.drishti-browser-ai.env]
BRIDGE_AUTH_TOKEN = "YOUR_64_CHARACTER_BRIDGE_TOKEN"
BRIDGE_WS_URL = "ws://127.0.0.1:7483"
```

---

## 7. Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node apps/mcp-server/dist/index.js
```
