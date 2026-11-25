import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';
import { ToolResponse } from './browser.tools.js';

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const ListTabsSchema = z.object({});

const NewTabSchema = z.object({
  url: z.string().optional().describe('URL to open in the new tab. Defaults to the browser\'s new-tab page.'),
});

const SwitchTabSchema = z.object({
  tabId: z.number().int().describe('ID of the tab to activate.'),
});

const CloseTabSchema = z.object({
  tabId: z.number().int().describe('ID of the tab to close.'),
});

const GroupTabsSchema = z.object({
  tabIds: z.array(z.number().int()).min(1).describe('Array of tab IDs to group.'),
  groupName: z.string().optional().describe('Optional label for the tab group.'),
});

const UseTabSchema = z.object({
  tabId: z.number().int().nullable().describe('Tab ID to bind automation to, or null to unlock and follow active tab.'),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

export const TAB_TOOLS = [
  {
    name: 'browser_list_tabs',
    description: 'Returns an array of TabInfo objects for all currently open tabs: id, url, title, active state, audible, loading state.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'browser_new_tab',
    description: 'Opens a new browser tab, optionally navigating to a URL. Returns the new TabInfo.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: "URL to open. Defaults to the browser's new-tab page." },
      },
      required: [],
    },
  },
  {
    name: 'browser_switch_tab',
    description: 'Activates (focuses) the tab with the given ID, bringing it to the foreground.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'ID of the tab to activate.' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_close_tab',
    description: 'Closes the tab with the given ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'ID of the tab to close.' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_group_tabs',
    description: 'Groups the specified tabs together (Chrome tab groups). Optionally assigns a label to the group.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of tab IDs to group.',
        },
        groupName: { type: 'string', description: 'Optional label for the tab group.' },
      },
      required: ['tabIds'],
    },
  },
  {
    name: 'browser_use_tab',
    description: 'Bind automation to a specific tabId, or pass null to unlock and follow whichever tab is active.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: ['number', 'null'], description: 'Tab ID to lock, or null to unlock.' },
      },
      required: ['tabId'],
    },
  },
];

// ─── Registration ────────────────────────────────────────────────────────────

export async function handleTabTool(name: string, args: unknown, bridge: BridgeClient): Promise<ToolResponse | undefined> {
  switch (name) {
    case 'browser_list_tabs': {
      ListTabsSchema.parse(args ?? {});
      const result = await bridge.sendCommand('GET_TABS', {});
      return ok(result);
    }

    case 'browser_new_tab': {
      const params = NewTabSchema.parse(args ?? {});
      const result = await bridge.sendCommand('NEW_TAB', params);
      return ok(result);
    }

    case 'browser_switch_tab': {
      const params = SwitchTabSchema.parse(args ?? {});
      const result = await bridge.sendCommand('SWITCH_TAB', params);
      return ok(result);
    }

    case 'browser_close_tab': {
      const params = CloseTabSchema.parse(args ?? {});
      const result = await bridge.sendCommand('CLOSE_TAB', params);
      return ok(result);
    }

    case 'browser_group_tabs': {
      const params = GroupTabsSchema.parse(args ?? {});
      const result = await bridge.sendCommand('GROUP_TABS', params);
      return ok(result);
    }

    case 'browser_use_tab': {
      const params = UseTabSchema.parse(args ?? {});
      const result = await bridge.sendCommand('USE_TAB', params);
      return ok(result);
    }

    default:
      return undefined;
  }
}
