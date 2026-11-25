import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';
import { ToolResponse } from './browser.tools.js';

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const ClickSchema = z.object({
  selector: z.string().optional().describe('CSS selector of the element to click.'),
  x: z.number().optional().describe('X coordinate to click (used when no selector provided).'),
  y: z.number().optional().describe('Y coordinate to click (used when no selector provided).'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button to use. Default: left.'),
});

const DoubleClickSchema = z.object({
  selector: z.string().optional().describe('CSS selector of the element to double-click.'),
  x: z.number().optional().describe('X coordinate to double-click.'),
  y: z.number().optional().describe('Y coordinate to double-click.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const HoverSchema = z.object({
  selector: z.string().describe('CSS selector of the element to hover over.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const TypeSchema = z.object({
  text: z.string().describe('Text to type.'),
  selector: z.string().optional().describe('CSS selector of the input element. Types into active element if omitted.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  clearFirst: z.boolean().optional().describe('Clear existing content before typing. Default: false.'),
});

const FillSchema = z.object({
  selector: z.string().describe('CSS selector of the form field to fill.'),
  value: z.string().describe('Value to set on the field.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const PressKeySchema = z.object({
  key: z.string().describe('Key name (e.g. "Enter", "Escape", "ArrowDown", "a").'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  modifiers: z
    .array(z.enum(['Alt', 'Control', 'Meta', 'Shift']))
    .optional()
    .describe('Modifier keys to hold while pressing the key.'),
});

const ScrollSchema = z.object({
  direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction. Default: down.'),
  amount: z.number().optional().describe('Scroll amount in pixels. Default: 300.'),
  selector: z.string().optional().describe('CSS selector of the scrollable element. Scrolls the page if omitted.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

const SelectSchema = z.object({
  selector: z.string().describe('CSS selector of the <select> element.'),
  value: z.string().describe('The option value or visible text to select.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

export const INTERACTION_TOOLS = [
  {
    name: 'browser_click',
    description: 'Click on a page element identified by a CSS selector, or at an (x, y) coordinate.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to click.' },
        x: { type: 'number', description: 'X coordinate.' },
        y: { type: 'number', description: 'Y coordinate.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_double_click',
    description: 'Double-click on a page element or at an (x, y) coordinate.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to double-click.' },
        x: { type: 'number', description: 'X coordinate.' },
        y: { type: 'number', description: 'Y coordinate.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_hover',
    description: 'Move the mouse over the element matching the given CSS selector (triggers hover styles and tooltips).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to hover.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_type',
    description:
      'Type text into the focused or selected input element, simulating real key-by-key input. Optionally clears existing content first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text to type.' },
        selector: { type: 'string', description: 'CSS selector to focus before typing.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
        clearFirst: { type: 'boolean', description: 'Clear existing content before typing.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_fill',
    description:
      'Set the value of a form field directly (without key-by-key simulation). Faster than browser_type. Validates that the field is not a password input.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the form field.' },
        value: { type: 'string', description: 'Value to set.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key (e.g. "Enter", "Escape", "ArrowDown") with optional modifier keys.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Key name, e.g. "Enter", "Tab", "ArrowDown".' },
        tabId: { type: 'number', description: 'Target tab ID.' },
        modifiers: {
          type: 'array',
          items: { type: 'string', enum: ['Alt', 'Control', 'Meta', 'Shift'] },
          description: 'Modifier keys to hold.',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page or a scrollable element in a given direction by a pixel amount.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction.' },
        amount: { type: 'number', description: 'Pixels to scroll. Default: 300.' },
        selector: { type: 'string', description: 'CSS selector of the scrollable container.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_select',
    description: 'Select an option in a <select> dropdown by its value or visible text.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the <select> element.' },
        value: { type: 'string', description: 'Option value or visible text.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: ['selector', 'value'],
    },
  },
];

// ─── Registration ────────────────────────────────────────────────────────────

export async function handleInteractionTool(name: string, args: unknown, bridge: BridgeClient): Promise<ToolResponse | undefined> {
  switch (name) {
    case 'browser_click': {
      const params = ClickSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('CLICK', params));
    }
    case 'browser_double_click': {
      const params = DoubleClickSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('CLICK', { ...params, count: 2 }));
    }
    case 'browser_hover': {
      const params = HoverSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('HOVER', params));
    }
    case 'browser_type': {
      const params = TypeSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('TYPE', params));
    }
    case 'browser_fill': {
      const params = FillSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('TYPE', { selector: params.selector, text: params.value, clear: true }));
    }
    case 'browser_press_key': {
      const params = PressKeySchema.parse(args ?? {});
      return ok(await bridge.sendCommand('PRESS_KEY', params));
    }
    case 'browser_scroll': {
      const params = ScrollSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('SCROLL', params));
    }
    case 'browser_select': {
      const params = SelectSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('SELECT_OPTION', params));
    }
    default:
      return undefined;
  }
}
