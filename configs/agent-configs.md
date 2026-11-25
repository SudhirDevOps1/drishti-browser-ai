# Agent Configuration for Drishti Browser AI

## Antigravity (AGY)

Add to your Antigravity MCP configuration:

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

**OR** using npx after publishing:
```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "npx",
      "args": ["-y", "sudhir-browser-mcp"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN"
      }
    }
  }
}
```

## Claude Code

```bash
claude mcp add drishti-browser-ai node D:/coding\ project/chrome\ extension/drishti-browser-ai/apps/mcp-server/dist/index.js
```

Or via config file `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN"
      }
    }
  }
}
```

## Cursor

In Cursor Settings → MCP → Add Server:
```json
{
  "drishti-browser-ai": {
    "command": "node",
    "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
    "env": {
      "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN"
    }
  }
}
```

## OpenCode

In `~/.opencode/config.json`:
```json
{
  "mcp": {
    "servers": {
      "drishti-browser-ai": {
        "type": "stdio",
        "command": "node",
        "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
        "env": {
          "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN"
        }
      }
    }
  }
}
```

## Windsurf / Codeium

In Windsurf MCP settings:
```json
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "YOUR_64_CHARACTER_BRIDGE_TOKEN"
      }
    }
  }
}
```

## Finding Your Auth Token

1. Start the bridge: `cd apps/local-bridge && node dist/index.js`
2. The token is printed to stdout on startup
3. Copy it and paste it into the extension Options page AND the env config above

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `browser_status` | Get bridge and browser connection status |
| `browser_observe` | Observe current page (accessibility tree, text summary) |
| `browser_snapshot` | Full DOM snapshot with interactive elements |
| `browser_screenshot` | Capture screenshot of current tab |
| `browser_inspect` | Inspect specific element by CSS selector |
| `browser_get_page_info` | Get page metadata, headings, body text |
| `browser_navigate` | Navigate to a URL |
| `browser_back` | Go back in history |
| `browser_forward` | Go forward in history |
| `browser_reload` | Reload current page |
| `browser_wait` | Wait for time or element |
| `browser_list_tabs` | List all open tabs |
| `browser_new_tab` | Open a new tab |
| `browser_switch_tab` | Switch to a tab by ID |
| `browser_close_tab` | Close a tab |
| `browser_group_tabs` | Group tabs |
| `browser_click` | Click an element or coordinate |
| `browser_double_click` | Double-click an element |
| `browser_hover` | Hover over an element |
| `browser_type` | Type text |
| `browser_fill` | Fill a form field |
| `browser_press_key` | Press a keyboard key |
| `browser_scroll` | Scroll the page |
| `browser_select` | Select a dropdown option |
| `browser_get_text` | Get visible text |
| `browser_get_links` | Get all links on page |
| `browser_find_element` | Find element by text/role/selector |
| `browser_get_tables` | Get all tables as structured data |
| `browser_get_forms` | Get all form fields |
| `browser_execute_workflow` | Execute a multi-step workflow |
| `browser_verify_action` | Verify an action succeeded |
| `browser_task_status` | Get task progress |
| `browser_stop_task` | Stop current task |
| `browser_console` | Get console messages |
| `browser_get_errors` | Get JS and network errors |
| `browser_network_inspect` | Inspect network requests |
