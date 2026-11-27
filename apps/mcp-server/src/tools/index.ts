import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BridgeClient } from '../bridge-client.js';
import { MemoryStore } from '../db/memory-store.js';
import { auditLog } from '../audit-logger.js';
import { BROWSER_TOOLS, handleBrowserTool } from './browser.tools.js';
import { NAVIGATION_TOOLS, handleNavigationTool } from './navigation.tools.js';
import { TAB_TOOLS, handleTabTool } from './tab.tools.js';
import { INTERACTION_TOOLS, handleInteractionTool } from './interaction.tools.js';
import { CONTENT_TOOLS, handleContentTool } from './content.tools.js';
import { AUTOMATION_TOOLS, handleAutomationTool } from './automation.tools.js';
import { DEBUGGING_TOOLS, handleDebuggingTool } from './debugging.tools.js';
import { WORKFLOW_TOOLS, handleWorkflowTool } from './workflow.tools.js';
import { COMPOSITE_TOOLS, handleCompositeTool } from './composite.tools.js';

export const ALL_TOOLS = [
  ...COMPOSITE_TOOLS,
  ...BROWSER_TOOLS,
  ...NAVIGATION_TOOLS,
  ...TAB_TOOLS,
  ...INTERACTION_TOOLS,
  ...CONTENT_TOOLS,
  ...AUTOMATION_TOOLS,
  ...DEBUGGING_TOOLS,
  ...WORKFLOW_TOOLS,
];

const CORE_TOOL_NAMES = new Set([
  'browser_run',
  'browser_tools',
  'browser_status',
  'browser_bridge_health',
  'browser_navigate',
  'browser_observe',
  'browser_snapshot',
  'browser_screenshot',
  'browser_print_pdf',
  'browser_evaluate',
  'browser_read',
  'browser_grep',
  'browser_task',
  'browser_audit',
  'browser_request_human_help',
]);

export function registerAllTools(server: Server, bridge: BridgeClient, store: MemoryStore): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const lazy = process.env.DRISHTI_LAZY_TOOLS === '1' || process.env.DRISHTI_LAZY_TOOLS === 'true';
    return {
      tools: lazy ? ALL_TOOLS.filter((t) => CORE_TOOL_NAMES.has(t.name)) : ALL_TOOLS,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const t0 = Date.now();
    const tabId =
      args && typeof args === 'object' && 'tabId' in args && typeof (args as { tabId?: unknown }).tabId === 'number'
        ? (args as { tabId: number }).tabId
        : undefined;

    const finish = (res: Awaited<ReturnType<typeof handleBrowserTool>>) => {
      auditLog({
        timestamp: new Date().toISOString(),
        tool: name,
        tabId,
        outcome: res?.isError ? 'error' : 'ok',
        durationMs: Date.now() - t0,
      });
      return res!;
    };

    try {
      const compRes = await handleCompositeTool(name, args, bridge, store, ALL_TOOLS);
      if (compRes !== undefined) return finish(compRes);

      const browserRes = await handleBrowserTool(name, args, bridge);
      if (browserRes !== undefined) return finish(browserRes);

      const navRes = await handleNavigationTool(name, args, bridge);
      if (navRes !== undefined) return finish(navRes);

      const tabRes = await handleTabTool(name, args, bridge);
      if (tabRes !== undefined) return finish(tabRes);

      const interRes = await handleInteractionTool(name, args, bridge);
      if (interRes !== undefined) return finish(interRes);

      const contRes = await handleContentTool(name, args, bridge);
      if (contRes !== undefined) return finish(contRes);

      const autoRes = await handleAutomationTool(name, args, bridge);
      if (autoRes !== undefined) return finish(autoRes);

      const debugRes = await handleDebuggingTool(name, args, bridge);
      if (debugRes !== undefined) return finish(debugRes);

      const wfRes = await handleWorkflowTool(name, args, bridge, store);
      if (wfRes !== undefined) return finish(wfRes);

      const errMsg = `Unknown tool: ${name}`;
      auditLog({
        timestamp: new Date().toISOString(),
        tool: name,
        tabId,
        outcome: 'error',
        durationMs: Date.now() - t0,
        error: errMsg,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }],
        isError: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      auditLog({
        timestamp: new Date().toISOString(),
        tool: name,
        tabId,
        outcome: 'error',
        durationMs: Date.now() - t0,
        error: msg,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }],
        isError: true,
      };
    }
  });
}
