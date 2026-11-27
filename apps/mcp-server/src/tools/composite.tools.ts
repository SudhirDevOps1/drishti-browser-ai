import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';
import { MemoryStore } from '../db/memory-store.js';
import { ToolResponse } from './browser.tools.js';

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

const StepSchema = z.object({
  action: z.enum([
    'navigate',
    'click',
    'type',
    'fill',
    'observe',
    'snapshot',
    'extract',
    'tables',
    'links',
    'wait',
    'wait_for',
    'screenshot',
    'verify',
  ]),
  params: z.record(z.string(), z.unknown()).optional(),
});

const RunSchema = z.object({
  steps: z.array(StepSchema).min(1).max(20).describe('Ordered sequence of actions. Max 20 steps, 30s total.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  stopOnError: z.boolean().optional().describe('Stop sequence on first error. Default: true.'),
  goal: z.string().optional().describe('Optional goal label; when set and all steps succeed, auto-saves workflow to SQLite cache.'),
});

const DiscoverToolsSchema = z.object({
  query: z.string().optional().describe('Optional keyword filter (e.g. "download", "tab", "network", "workflow").'),
  category: z.string().optional().describe('Optional category filter.'),
});

const ACTION_MAP: Record<string, string> = {
  navigate: 'NAVIGATE',
  click: 'CLICK',
  type: 'TYPE',
  fill: 'TYPE',
  observe: 'OBSERVE',
  snapshot: 'GET_DOM_SNAPSHOT',
  extract: 'GET_TEXT',
  tables: 'GET_TABLES',
  links: 'GET_LINKS',
  wait: 'WAIT',
  wait_for: 'WAIT_FOR',
  screenshot: 'SCREENSHOT',
  verify: 'VERIFY_ACTION',
};

export const COMPOSITE_TOOLS = [
  {
    name: 'browser_run',
    description:
      'Execute a bounded sequence of browser actions (navigate, click, type, fill, observe, snapshot, extract, tables, links, wait, wait_for, verify) in a SINGLE call. ' +
      'Returns compact diffs (never full DOM dumps or screenshots after every click) within a 30s budget. Prefer this over separate round-trips.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        steps: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: [
                  'navigate',
                  'click',
                  'type',
                  'fill',
                  'observe',
                  'snapshot',
                  'extract',
                  'tables',
                  'links',
                  'wait',
                  'wait_for',
                  'screenshot',
                  'verify',
                ],
              },
              params: { type: 'object', description: 'Action parameters (url, selector, ref, text, ms, etc.).' },
            },
            required: ['action'],
          },
        },
        tabId: { type: 'number', description: 'Target tab ID.' },
        stopOnError: { type: 'boolean', description: 'Stop on first error. Default: true.' },
        goal: { type: 'string', description: 'Optional goal name to auto-cache this flow in SQLite on success.' },
      },
      required: ['steps'],
    },
  },
  {
    name: 'browser_tools',
    description:
      'Discover available Drishti MCP tools on demand by keyword or category (use when lazy tool discovery is enabled or to inspect full capabilities).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Filter tools by name or description.' },
        category: { type: 'string', description: 'Filter by category.' },
      },
      required: [],
    },
  },
];

export async function handleCompositeTool(
  name: string,
  args: unknown,
  bridge: BridgeClient,
  store?: MemoryStore,
  allTools?: Array<{ name: string; description: string }>,
): Promise<ToolResponse | undefined> {
  if (name === 'browser_tools') {
    const { query = '' } = DiscoverToolsSchema.parse(args ?? {});
    const q = query.trim().toLowerCase();
    const list = (allTools ?? [])
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
      .map((t) => ({ name: t.name, description: t.description.slice(0, 140) }));
    return ok({ count: list.length, tools: list });
  }

  if (name !== 'browser_run') return undefined;

  const { steps, tabId, stopOnError = true, goal } = RunSchema.parse(args ?? {});
  const deadline = Date.now() + 30_000;
  const results: Array<{ step: number; action: string; ok: boolean; diff?: unknown; error?: string; ms: number }> = [];
  let prevUrl = '';
  let prevTitle = '';

  for (let i = 0; i < steps.length; i++) {
    if (Date.now() > deadline) {
      results.push({ step: i + 1, action: steps[i].action, ok: false, error: 'browser_run: 30s deadline exceeded', ms: 0 });
      break;
    }
    const { action, params = {} } = steps[i];
    const bridgeAction = ACTION_MAP[action] ?? action.toUpperCase();
    const resolvedParams = { ...params };
    if (
      store &&
      prevUrl &&
      (action === 'click' || action === 'type' || action === 'fill') &&
      typeof resolvedParams.selector === 'string'
    ) {
      try {
        const domain = new URL(prevUrl).hostname;
        const cached = store.lookupSelector(domain, resolvedParams.selector);
        if (cached?.selector && !resolvedParams.cachedSelector) {
          resolvedParams.cachedSelector = cached.selector;
        }
      } catch {}
    }
    const payload = tabId ? { ...resolvedParams, tabId } : resolvedParams;
    const t0 = Date.now();
    try {
      const result = await bridge.sendCommand(bridgeAction, payload);
      const ms = Date.now() - t0;
      const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
      if (
        store &&
        prevUrl &&
        (action === 'click' || action === 'type' || action === 'fill') &&
        typeof resolvedParams.selector === 'string'
      ) {
        try {
          const domain = new URL(prevUrl).hostname;
          const verifiedSel = typeof r.resolvedSelector === 'string' ? r.resolvedSelector : resolvedParams.selector;
          store.cacheSelector({ domain, intent: resolvedParams.selector, selector: verifiedSel });
        } catch {}
      }
      const diff: Record<string, unknown> = { ok: true };
      if (r.url && r.url !== prevUrl) {
        diff.urlChanged = { from: prevUrl || null, to: r.url };
        prevUrl = String(r.url);
      }
      if (r.title && r.title !== prevTitle) {
        diff.titleChanged = { from: prevTitle || null, to: r.title };
        prevTitle = String(r.title);
      }
      if (r.summary) diff.summary = String(r.summary).slice(0, 600);
      if (r.text) diff.text = String(r.text).slice(0, 1000);
      if (Array.isArray(r.tables)) diff.tables = r.tables.slice(0, 5);
      if (Array.isArray(r.links)) diff.links = r.links.slice(0, 25);
      if (Array.isArray(r.elements)) diff.elementCount = r.elements.length;
      if (r.clicked) diff.clicked = r.clicked;
      if (r.verified !== undefined) diff.verified = r.verified;
      if (r.waited) diff.waited = r.waited;
      results.push({ step: i + 1, action, ok: true, diff, ms });
    } catch (err) {
      const ms = Date.now() - t0;
      const error = err instanceof Error ? err.message : String(err);
      results.push({ step: i + 1, action, ok: false, error, ms });
      if (stopOnError) break;
    }
  }

  const allOk = results.every((r) => r.ok);
  if (allOk && goal && store) {
    try {
      const domain = prevUrl ? new URL(prevUrl).hostname : '*';
      store.saveWorkflow({
        name: goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48),
        queryPattern: goal,
        domain,
        steps: steps.map((s) => ({
          action: ACTION_MAP[s.action] ?? s.action.toUpperCase(),
          payload: s.params ?? {},
          durationMs: 0,
          timestamp: Date.now(),
        })),
      });
    } catch {
      // non-fatal cache save
    }
  }

  const totalMs = results.reduce((s, r) => s + r.ms, 0);
  return ok({ ok: allOk, steps: results.length, totalMs, cached: Boolean(allOk && goal && store), results });
}
