import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';
import { ToolResponse } from './browser.tools.js';

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const GetTextSchema = z.object({
  selector: z.string().optional().describe('CSS selector to scope text extraction. Extracts from entire page if omitted.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const GetLinksSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  filter: z.string().optional().describe('Optional text or regex string to filter link text or href.'),
});

const FindElementSchema = z.object({
  query: z.string().describe('Search query: element text content, ARIA role/label, or CSS selector.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const GetTablesSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const GetFormsSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

export const CONTENT_TOOLS = [
  {
    name: 'browser_get_text',
    description:
      'Returns the visible text content of the page or a scoped element. Strips HTML tags and invisible content.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector to scope extraction.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_get_links',
    description:
      'Returns all hyperlinks on the page as an array of {text, href, type} objects. Optionally filter by text or URL pattern.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID.' },
        filter: { type: 'string', description: 'Text or regex string to filter link text or href.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_find_element',
    description:
      'Find a page element by its visible text, ARIA role/label, or CSS selector. Returns matching elements with selector, role, text, and bounding box.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Text, ARIA role/label, or CSS selector.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_get_tables',
    description:
      'Returns all <table> elements on the page as structured data: headers and rows as arrays of strings.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_get_forms',
    description:
      'Returns all form fields on the page with metadata: name, type, label, placeholder, current value, required state.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: [],
    },
  },
];

// ─── Registration ────────────────────────────────────────────────────────────

export async function handleContentTool(name: string, args: unknown, bridge: BridgeClient): Promise<ToolResponse | undefined> {
  switch (name) {
    case 'browser_get_text': {
      const params = GetTextSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('GET_TEXT', params));
    }
    case 'browser_get_links': {
      const params = GetLinksSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('GET_LINKS', params));
    }
    case 'browser_find_element': {
      const params = FindElementSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('FIND_ELEMENT', params));
    }
    case 'browser_get_tables': {
      const params = GetTablesSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('GET_TABLES', params));
    }
    case 'browser_get_forms': {
      const params = GetFormsSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('GET_FORMS', params));
    }
    default:
      return undefined;
  }
}
