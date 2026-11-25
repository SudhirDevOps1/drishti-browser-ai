import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';
import { ToolResponse } from './browser.tools.js';

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const ConsoleSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  levels: z
    .array(z.enum(['log', 'info', 'warn', 'error', 'debug']))
    .optional()
    .describe('Console levels to include. Default: all levels.'),
});

const GetErrorsSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const NetworkInspectSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  filter: z.string().optional().describe('Optional URL substring or regex string to filter requests.'),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

export const DEBUGGING_TOOLS = [
  {
    name: 'browser_console',
    description:
      'Returns recent browser console messages (log, info, warn, error, debug) from the specified tab. Useful for diagnosing JavaScript issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID.' },
        levels: {
          type: 'array',
          items: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug'] },
          description: 'Console levels to include.',
        },
      },
      required: [],
    },
  },
  {
    name: 'browser_get_errors',
    description:
      'Returns JavaScript runtime errors and failed network requests from the specified tab. Useful for detecting broken functionality.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_network_inspect',
    description:
      'Returns recent network requests from the specified tab: URL, method, status, response size, timing. Optionally filter by URL pattern.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID.' },
        filter: { type: 'string', description: 'URL substring or regex to filter requests.' },
      },
      required: [],
    },
  },
];

// ─── Registration ────────────────────────────────────────────────────────────

export async function handleDebuggingTool(name: string, args: unknown, bridge: BridgeClient): Promise<ToolResponse | undefined> {
  switch (name) {
    case 'browser_console': {
      const params = ConsoleSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('GET_CONSOLE_LOGS', params));
    }
    case 'browser_get_errors': {
      const params = GetErrorsSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('GET_CONSOLE_LOGS', { ...params, levels: ['error'] }));
    }
    case 'browser_network_inspect': {
      const params = NetworkInspectSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('GET_NETWORK_LOGS', params));
    }
    default:
      return undefined;
  }
}
