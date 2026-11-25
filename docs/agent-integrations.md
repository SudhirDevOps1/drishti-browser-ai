# Agent Integrations Guide — Drishti Browser AI

Comprehensive connection instructions for every major AI coding agent and MCP application.

---

## 1. Antigravity (AGY)

In your workspace or global Antigravity MCP settings (`mcp_config.json`):

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": [
        "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"
      ],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_TOKEN_HERE",
        "BRIDGE_WS_URL": "ws://127.0.0.1:7483"
      }
    }
  }
}
```

---

## 2. OpenCode

Add to `~/.opencode/config.json`:

```json
{
  "mcp": {
    "servers": {
      "drishti-browser-ai": {
        "type": "stdio",
        "command": "node",
        "args": [
          "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"
        ],
        "env": {
          "BRIDGE_AUTH_TOKEN": "YOUR_TOKEN_HERE"
        }
      }
    }
  }
}
```

---

## 3. Claude Code

Run directly from your terminal:

```bash
claude mcp add drishti-browser-ai node "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"
```

Or configure via `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": [
        "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"
      ],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

---

## 4. Cursor

1. Open **Cursor Settings** (`Ctrl + ,` / `Cmd + ,`).
2. Navigate to **Features** → **MCP**.
3. Click **Add New MCP Server**.
4. Configure:
   - **Name:** `drishti-browser-ai`
   - **Type:** `command`
   - **Command:** `node "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"`
   - **Environment Variables:** `BRIDGE_AUTH_TOKEN=YOUR_TOKEN_HERE`

---

## 5. Windsurf / Codeium Cascade

In `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": [
        "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"
      ],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

---

## 6. Testing with MCP Inspector

To verify tools interactively using the official Model Context Protocol Inspector:

```powershell
npx @modelcontextprotocol/inspector node "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"
```
