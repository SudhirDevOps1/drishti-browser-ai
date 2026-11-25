# Developer Setup Guide — Drishti Browser AI

A developer's guide to building, extending tools, running live tests, and debugging the monorepo.

---

## 1. Monorepo Structure

```
drishti-browser-ai/
├── apps/
│   ├── chrome-extension/       # Manifest V3 extension (React 18 + Tailwind + Vite)
│   │   └── dist/               # ⚠️ Load Unpacked Extension folder for Chrome/Brave
│   ├── mcp-server/             # Official @modelcontextprotocol/sdk MCP Server (37 tools)
│   └── local-bridge/           # High-speed WebSocket server on port 7483 (SHA-256 Auth)
├── packages/
│   ├── shared-types/           # Shared TypeScript types, enums, constants
│   ├── permission-engine/      # Security policy enforcement & URL allow/blocklists
│   ├── dom-engine/             # In-page element discovery & accessibility extraction
│   ├── visual-engine/          # Screenshot metadata and visual difference utilities
│   ├── browser-core/           # Controller abstractions and page observer
│   ├── workflow-engine/        # Multi-step task queues, priority, execution monitors
│   └── mcp-tools/              # Reusable tool schemas and catalog definitions
├── configs/                    # Multi-agent connection settings
├── docs/                       # Architectural and operational documentation
├── tests/                      # Vitest unit and integration suites
└── scripts/                    # Version synchronization and live test scripts
```

---

## 2. Extension Loading Location (Chrome / Brave)

When loading the extension via **Developer mode → Load unpacked**:

- **Target Path:**
  ```
  <path-to-drishti-browser-ai>\apps\chrome-extension\dist
  ```
  *(Or `<path-to-drishti-browser-ai>/apps/chrome-extension/dist`)*

> **DO NOT** select `apps/chrome-extension/` root because it contains raw uncompiled `.tsx` files. Always select `dist/`.

---

## 3. Common Development & Test Scripts

Run from monorepo root:

```powershell
# Install all workspace dependencies
pnpm install

# Build all packages & apps
pnpm build

# Run unit tests (19 passed)
pnpm test

# Run End-to-End Live Browser Test
pnpm test:live

# Check version synchronization
node scripts/version.mjs verify

# Bump version across all packages
node scripts/version.mjs bump patch
```

---

## 4. Active Environment Constants

- **WebSocket Bridge URL:** `ws://127.0.0.1:7483`
- **Active Auth Token:** `YOUR_64_CHARACTER_BRIDGE_TOKEN`
- **Total Registered Tools:** 37 MCP Tools

---

## 5. Adding a New MCP Browser Tool

1. Add tool name to `ALL_MCP_TOOL_NAMES` in `packages/mcp-tools/src/index.ts`.
2. Define input schema in `apps/mcp-server/src/tools/<category>.tools.ts` using `zod`.
3. Add the handler function in `<category>.tools.ts` and dispatch in `apps/mcp-server/src/tools/index.ts`.
4. Handle the action in `apps/chrome-extension/src/background/background.ts`.
5. Rebuild with `pnpm build`.
