import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';
import { ToolResponse } from './browser.tools.js';

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const NavigateSchema = z.object({
  url: z.string().url().describe('The URL to navigate to.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  waitForLoad: z.boolean().optional().describe('Wait for page load event before returning. Default: true.'),
});

const BackSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const ForwardSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const ReloadSchema = z.object({
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  hardReload: z.boolean().optional().describe('Bypass cache (hard reload). Default: false.'),
});

const WaitSchema = z.object({
  ms: z.number().int().min(0).optional().describe('Milliseconds to wait. Default: 1000.'),
  selector: z.string().optional().describe('CSS selector to wait for (waits until the element appears in the DOM).'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

export const NAVIGATION_TOOLS = [
  {
    name: 'browser_navigate',
    description: 'Navigate the specified (or active) tab to a URL. Optionally waits for the page to fully load.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to navigate to.' },
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
        waitForLoad: { type: 'boolean', description: 'Wait for page load event before returning.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_back',
    description: 'Navigate the specified (or active) tab back in its browser history.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_forward',
    description: 'Navigate the specified (or active) tab forward in its browser history.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_reload',
    description: 'Reload the specified (or active) tab. Use hardReload to bypass the cache.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
        hardReload: { type: 'boolean', description: 'Bypass cache (hard reload).' },
      },
      required: [],
    },
  },
  {
    name: 'browser_wait',
    description:
      'Wait for a fixed duration (ms) and/or until a CSS selector appears in the DOM. Useful for letting animations settle or dynamic content load.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ms: { type: 'number', description: 'Milliseconds to wait. Default: 1000.' },
        selector: { type: 'string', description: 'CSS selector to wait for.' },
        tabId: { type: 'number', description: 'Target tab ID. Defaults to active tab.' },
      },
      required: [],
    },
  },
];

// ─── Registration ────────────────────────────────────────────────────────────

export async function handleNavigationTool(name: string, args: unknown, bridge: BridgeClient): Promise<ToolResponse | undefined> {
  switch (name) {
    case 'browser_navigate': {
      const params = NavigateSchema.parse(args ?? {});
      const result = await bridge.sendCommand('NAVIGATE', params);
      return ok(result);
    }

    case 'browser_back': {
      const params = BackSchema.parse(args ?? {});
      const result = await bridge.sendCommand('GO_BACK', params);
      return ok(result);
    }

    case 'browser_forward': {
      const params = ForwardSchema.parse(args ?? {});
      const result = await bridge.sendCommand('GO_FORWARD', params);
      return ok(result);
    }

    case 'browser_reload': {
      const params = ReloadSchema.parse(args ?? {});
      const result = await bridge.sendCommand('RELOAD', params);
      return ok(result);
    }

    case 'browser_wait': {
      const params = WaitSchema.parse(args ?? {});
      const result = await bridge.sendCommand('WAIT', params);
      return ok(result);
    }

    default:
      return undefined;
  }
}
