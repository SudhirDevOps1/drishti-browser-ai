import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export type ToolResponse = {
  content: ToolContent[];
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
  path: z.string().optional().describe('Optional file path to save the PNG/JPEG screenshot to disk.'),
  inline: z.boolean().optional().describe('Include inline base64 image block even when path is provided. Default: false when path is set.'),
});

const BrowserPrintPdfSchema = z.object({
  path: z.string().min(1).describe('File path to write the rendered PDF document.'),
  format: z.enum(['A4', 'Letter']).optional().describe('Paper format (A4 or Letter). Default: A4.'),
  landscape: z.boolean().optional().describe('Landscape orientation. Default: false.'),
  printBackground: z.boolean().optional().describe('Include background graphics. Default: true.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const BrowserInspectSchema = z.object({
  selector: z.string().optional().describe('CSS selector of the element to inspect.'),
  ref: z.string().optional().describe('Semantic @eN ref from browser_snapshot.'),
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
      'Returns a full page observation for the specified (or active) tab: URL, title, accessibility tree summary, and a visible-text summary. Use this to understand what the page shows without taking a screenshot.',
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
      'Returns a structured DOM snapshot with semantic @e1/@e2 ref IDs, full accessible labels, bounding boxes, and CSS selectors.',
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
      'Captures a screenshot of the specified (or active) tab, optionally saving it to `path`, and returns it inline as an image plus metadata.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
        format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format. Default: png.' },
        quality: { type: 'number', description: 'JPEG quality 1-100. Ignored for PNG.' },
        path: { type: 'string', description: 'Optional file path to save the screenshot on disk.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_print_pdf',
    description:
      'Render the specified (or active) tab to a PDF file via CDP Page.printToPDF and save it directly to `path` (no OS Save As dialog required).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Output PDF file path.' },
        format: { type: 'string', enum: ['A4', 'Letter'], description: 'Paper format. Default: A4.' },
        landscape: { type: 'boolean', description: 'Landscape orientation. Default: false.' },
        printBackground: { type: 'boolean', description: 'Include background graphics. Default: true.' },
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'browser_inspect',
    description:
      'Returns full ElementInfo (computed styles, attributes, bounding box, inner text, ARIA properties) for the element matching the selector or @eN ref.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to inspect.' },
        ref: { type: 'string', description: 'Semantic @eN ref from browser_snapshot.' },
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
      },
      required: [],
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
      const result = await bridge.sendCommand('OBSERVE', params);
      return ok(result);
    }

    case 'browser_snapshot': {
      const params = BrowserSnapshotSchema.parse(args ?? {});
      const result = await bridge.sendCommand('GET_DOM_SNAPSHOT', params);
      return ok(result);
    }

    case 'browser_screenshot': {
      const params = BrowserScreenshotSchema.parse(args ?? {});
      const result = (await bridge.sendCommand('SCREENSHOT', params)) as {
        base64?: string;
        format?: 'png' | 'jpeg';
        size?: number;
      };
      if (result?.base64) {
        const buf = Buffer.from(result.base64, 'base64');
        let savedPath: string | undefined;
        if (params.path) {
          savedPath = path.resolve(params.path);
          mkdirSync(path.dirname(savedPath), { recursive: true });
          writeFileSync(savedPath, buf);
          if (params.inline !== true) {
            return ok({
              ok: true,
              path: savedPath,
              format: result.format ?? 'png',
              sizeBytes: buf.length,
            });
          }
        }
        const mimeType = result.format === 'jpeg' ? 'image/jpeg' : 'image/png';
        return {
          content: [
            { type: 'image' as const, data: result.base64, mimeType },
            {
              type: 'text' as const,
              text: JSON.stringify({
                format: result.format ?? 'png',
                size: result.size ?? result.base64.length,
                ...(savedPath ? { path: savedPath } : {}),
                note: 'Inline image attached above. Tip: use browser_observe or post-action DOM summary instead of screenshots after every click.',
              }),
            },
          ],
        };
      }
      return ok(result);
    }

    case 'browser_print_pdf': {
      const params = BrowserPrintPdfSchema.parse(args ?? {});
      const result = (await bridge.sendCommand('PRINT_PDF', {
        tabId: params.tabId,
        format: params.format ?? 'A4',
        landscape: params.landscape ?? false,
        printBackground: params.printBackground ?? true,
      })) as { base64?: string; format?: string };
      if (!result?.base64) {
        throw new Error('PRINT_PDF returned empty PDF data');
      }
      const outPath = path.resolve(params.path);
      mkdirSync(path.dirname(outPath), { recursive: true });
      const buf = Buffer.from(result.base64, 'base64');
      writeFileSync(outPath, buf);
      return ok({ ok: true, path: outPath, format: result.format || params.format || 'A4', sizeBytes: buf.length });
    }

    case 'browser_inspect': {
      const params = BrowserInspectSchema.parse(args ?? {});
      const result = await bridge.sendCommand('INSPECT', params);
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
