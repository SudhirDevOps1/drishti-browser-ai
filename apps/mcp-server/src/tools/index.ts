import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BridgeClient } from '../bridge-client.js';
import { BROWSER_TOOLS, handleBrowserTool } from './browser.tools.js';
import { NAVIGATION_TOOLS, handleNavigationTool } from './navigation.tools.js';
import { TAB_TOOLS, handleTabTool } from './tab.tools.js';
import { INTERACTION_TOOLS, handleInteractionTool } from './interaction.tools.js';
import { CONTENT_TOOLS, handleContentTool } from './content.tools.js';
import { AUTOMATION_TOOLS, handleAutomationTool } from './automation.tools.js';
import { DEBUGGING_TOOLS, handleDebuggingTool } from './debugging.tools.js';

export const ALL_TOOLS = [
  ...BROWSER_TOOLS,
  ...NAVIGATION_TOOLS,
  ...TAB_TOOLS,
  ...INTERACTION_TOOLS,
  ...CONTENT_TOOLS,
  ...AUTOMATION_TOOLS,
  ...DEBUGGING_TOOLS,
];

export function registerAllTools(server: Server, bridge: BridgeClient): void {
  // 1. Centralized Tools Listing (Exposes all 36 MCP tools)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS,
  }));

  // 2. Centralized Tools Execution Dispatcher
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Dispatch in order
      const browserRes = await handleBrowserTool(name, args, bridge);
      if (browserRes !== undefined) return browserRes;

      const navRes = await handleNavigationTool(name, args, bridge);
      if (navRes !== undefined) return navRes;

      const tabRes = await handleTabTool(name, args, bridge);
      if (tabRes !== undefined) return tabRes;

      const interRes = await handleInteractionTool(name, args, bridge);
      if (interRes !== undefined) return interRes;

      const contRes = await handleContentTool(name, args, bridge);
      if (contRes !== undefined) return contRes;

      const autoRes = await handleAutomationTool(name, args, bridge);
      if (autoRes !== undefined) return autoRes;

      const debugRes = await handleDebuggingTool(name, args, bridge);
      if (debugRes !== undefined) return debugRes;

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }],
        isError: true,
      };
    }
  });
}
