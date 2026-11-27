import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

const EvaluateSchema = z.object({
  fn: z.string().min(1).describe('JavaScript function or expression to run in the page MAIN world, e.g. "() => ({ title: document.title })".'),
  arg: z.unknown().optional().describe('Optional JSON-serializable argument passed to fn(arg).'),
  timeout: z.number().int().min(100).max(15000).optional().describe('Execution timeout in ms (default 5000).'),
  maxChars: z.number().int().min(200).max(50000).optional().describe('Max inline output chars before spilling to file (default 16000).'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const ReadPageSchema = z.object({
  selector: z.string().optional().describe('Optional CSS selector to scope markdown extraction.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const GrepPageSchema = z.object({
  pattern: z.string().min(1).describe('Substring or regex pattern to match against page lines.'),
  limit: z.number().int().min(1).max(200).optional().describe('Max matching lines to return (default 50).'),
  over: z.enum(['text', 'html']).optional().describe('Search visible text (default) or HTML lines.'),
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
  {
    name: 'browser_evaluate',
    description:
      'Execute a JavaScript function or expression in the page MAIN world and return { changed, value }. Large outputs (> maxChars, default 16000) spill to a temp JSON file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fn: { type: 'string', description: 'JS function or expression, e.g. "() => document.title".' },
        arg: { description: 'Optional argument passed to fn(arg).' },
        timeout: { type: 'number', description: 'Timeout in ms (default 5000).' },
        maxChars: { type: 'number', description: 'Inline output cap (default 16000).' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: ['fn'],
    },
  },
  {
    name: 'browser_read',
    description:
      'Read the page as clean markdown wrapped in [UNTRUSTED_PAGE_CONTENT nonce=... origin=...] delimiters so untrusted web text is isolated from agent instructions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'Optional CSS selector to scope extraction.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_grep',
    description:
      'Search page text (or HTML) for lines matching a pattern and return matching lines ONLY (never a full page dump).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', description: 'Substring or regex pattern.' },
        limit: { type: 'number', description: 'Max matching lines (default 50, max 200).' },
        over: { type: 'string', enum: ['text', 'html'], description: 'Target text (default) or html.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: ['pattern'],
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
    case 'browser_evaluate': {
      const params = EvaluateSchema.parse(args ?? {});
      const maxChars = params.maxChars ?? 16000;
      const res = (await bridge.sendCommand('EVALUATE', {
        fn: params.fn,
        arg: params.arg,
        timeout: params.timeout ?? 5000,
        tabId: params.tabId,
      })) as { changed?: boolean; value?: unknown };
      const serialized = JSON.stringify(res?.value ?? null, null, 2);
      if (serialized.length > maxChars) {
        const spillPath = path.join(os.tmpdir(), `drishti-eval-${Date.now()}.json`);
        writeFileSync(spillPath, serialized, 'utf8');
        return ok({
          changed: Boolean(res?.changed),
          truncated: true,
          totalChars: serialized.length,
          spilledTo: spillPath,
          preview: serialized.slice(0, Math.min(2000, maxChars)),
        });
      }
      return ok({ changed: Boolean(res?.changed), value: res?.value ?? null });
    }
    case 'browser_read': {
      const params = ReadPageSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('READ_PAGE', params));
    }
    case 'browser_grep': {
      const params = GrepPageSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('GREP_PAGE', params));
    }
    default:
      return undefined;
  }
}
