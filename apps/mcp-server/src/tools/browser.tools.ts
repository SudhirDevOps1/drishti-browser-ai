import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';

export type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const BrowserStatusSchema = z.object({});

const BrowserObserveSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const BrowserSnapshotSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  includeHtml: z.boolean().optional().describe('Include raw HTML in the snapshot.'),
});

const BrowserScreenshotSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  format: z.enum(['png', 'jpeg']).optional().describe('Image format. Default: png.'),
  quality: z.number().int().min(1).max(100).optional().describe('JPEG quality (1-100). Ignored for PNG.'),
});

const BrowserInspectSchema = z.object({
  selector: z.string().describe('CSS selector of the element to inspect.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const BrowserGetPageInfoSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const BrowserBridgeHealthSchema = z.object({
  includeTabsSummary: z.boolean().optional().describe('Include compact list of all open tabs.'),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

export const BROWSER_TOOLS = [
  {
    name: 'browser_status',
    description:
      'Returns the current status of the browser AI bridge: connection state, active tab info, extension version, and operating mode.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'browser_observe',
    description:
      'Returns a full page observation for the specified (or active) tab: URL, title, accessibility tree summary, and a visible-text summary. Use this to understand what the page shows without reading raw HTML.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_snapshot',
    description:
      'Returns a structured DOM snapshot with an element list (tag, text, attributes, bounding box). Optionally includes raw HTML.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
        includeHtml: { type: 'boolean', description: 'Include raw HTML in the response.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_screenshot',
    description:
      'Captures a screenshot of the specified (or active) tab and returns it as a base64-encoded image string.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
        format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format. Default: png.' },
        quality: { type: 'number', description: 'JPEG quality 1-100. Ignored for PNG.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_inspect',
    description:
      'Returns full ElementInfo (computed styles, attributes, bounding box, inner text, ARIA properties) for the first element matching the given CSS selector.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to inspect.' },
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_get_page_info',
    description:
      'Returns high-level page metadata: URL, title, meta description, canonical URL, language, number of links, and number of images.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_bridge_health',
    description:
      'Performs a real-time health and diagnostic check across the local WebSocket bridge, returning connection status, latency, tab count, active tab details, and formatted summary string.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeTabsSummary: {
          type: 'boolean',
          description: 'Whether to include a compact list of all open tabs.',
        },
      },
      required: [],
    },
  },
];

// ─── Registration ────────────────────────────────────────────────────────────

export async function handleBrowserTool(name: string, args: unknown, bridge: BridgeClient): Promise<ToolResponse | undefined> {
  switch (name) {
    case 'browser_status': {
      BrowserStatusSchema.parse(args ?? {});
      const result = await bridge.sendCommand('BROWSER_STATUS', {});
      return ok(result);
    }

    case 'browser_bridge_health': {
      BrowserBridgeHealthSchema.parse(args ?? {});
      const start = Date.now();
      const status = (await bridge.sendCommand('BROWSER_BRIDGE_HEALTH', {})) as Record<string, unknown>;
      const latency = Date.now() - start;
      const tabCount = Number(status?.tabCount ?? 0);
      const activeTab = (status?.activeTab as Record<string, unknown>) || {};
      const activeUrl = String(activeTab?.url || 'about:blank');
      return ok({
        ...status,
        latencyMs: Math.max(1, latency),
        summary: `Bridge: CONNECTED | Port: 7483 | Tabs: ${tabCount} | Active: ${activeUrl}`,
      });
    }

    case 'browser_observe': {
      const params = BrowserObserveSchema.parse(args ?? {});
      const result = await bridge.sendCommand('browser_observe', params);
      return ok(result);
    }

    case 'browser_snapshot': {
      const params = BrowserSnapshotSchema.parse(args ?? {});
      const result = await bridge.sendCommand('GET_DOM_SNAPSHOT', params);
      return ok(result);
    }

    case 'browser_screenshot': {
      const params = BrowserScreenshotSchema.parse(args ?? {});
      const result = await bridge.sendCommand('SCREENSHOT', params);
      return ok(result);
    }

    case 'browser_inspect': {
      const params = BrowserInspectSchema.parse(args ?? {});
      const result = await bridge.sendCommand('EXECUTE_SCRIPT', params);
      return ok(result);
    }

    case 'browser_get_page_info': {
      const params = BrowserGetPageInfoSchema.parse(args ?? {});
      const result = await bridge.sendCommand('GET_PAGE_INFO', params);
      return ok(result);
    }

    default:
      return undefined;
  }
}
