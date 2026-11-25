# Agent Configuration for Drishti Browser AI

> **Recommended (Zero-Clone Auto-Setup):** Run `pnpm setup:agent -- --client auto` (or pass `--client antigravity|gemini|opencode|claude|cursor|codex`) inside the Drishti repo root. It auto-generates `.drishti-token`, registers MCP, and installs the `drishti-browser-agent` skill automatically.

## Google Antigravity (`~/.gemini/antigravity/mcp_config.json`)

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN",
        "BRIDGE_WS_URL": "ws://127.0.0.1:7483"
      }
    }
  }
}
```

## Gemini CLI (`~/.gemini/settings.json`)

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN",
        "BRIDGE_WS_URL": "ws://127.0.0.1:7483"
      }
    }
  }
}
```

## OpenCode (`~/.config/opencode/opencode.json`)

```json
{
  "mcp": {
    "drishti-browser-ai": {
      "type": "local",
      "command": ["node", "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "enabled": true,
      "environment": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN",
        "BRIDGE_WS_URL": "ws://127.0.0.1:7483"
      }
    }
  }
}
```

## Claude Code (`~/.claude/mcp.json`)

```bash
claude mcp add drishti-browser-ai node "<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"
```

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN",
        "BRIDGE_WS_URL": "ws://127.0.0.1:7483"
      }
    }
  }
}
```

## Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN",
        "BRIDGE_WS_URL": "ws://127.0.0.1:7483"
      }
    }
  }
}
```

## OpenAI Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.drishti-browser-ai]
command = "node"
args = ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"]

[mcp_servers.drishti-browser-ai.env]
BRIDGE_AUTH_TOKEN = "YOUR_64_CHARACTER_BRIDGE_TOKEN"
BRIDGE_WS_URL = "ws://127.0.0.1:7483"
```

## Generating & Syncing Your Auth Token

1. Run `pnpm setup:agent -- --client auto` (auto-creates `.drishti-token` in repo root), **or** click **Generate** inside Extension **Settings -> Connection & Bridge**.
2. Paste the 64-character token into Extension **Settings -> Connection & Bridge** -> **Save Changes** -> **Run Ping**.
3. Start the Local Bridge on-demand: `pnpm bridge:start`.
