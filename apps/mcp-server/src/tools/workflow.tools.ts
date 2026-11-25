import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';
import { MemoryStore, RecordedStep } from '../db/memory-store.js';
import { ToolResponse } from './browser.tools.js';

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── Recording session state ────────────────────────────────────────────────

interface ActiveRecording {
  name: string;
  queryPattern: string;
  domain: string;
  steps: RecordedStep[];
  unsubscribe: () => void;
}

let activeRecording: ActiveRecording | null = null;
const DESTRUCTIVE_RE = /\b(delete|remove|trash|bin|destroy|purge|drop|pay|checkout|purchase|submit)\b/i;

function substituteVars(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (k in vars ? vars[k] : `{{${k}}}`));
  }
  if (Array.isArray(value)) {
    return value.map((v) => substituteVars(v, vars));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = substituteVars(v, vars);
    }
    return out;
  }
  return value;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const WorkflowStartSchema = z.object({
  name: z.string().min(1).describe('Unique workflow name (e.g. "google-flow-download").'),
  queryPattern: z.string().optional().describe('Keywords/intent phrase for matching future requests.'),
  domain: z.string().optional().describe('Optional target domain scope (e.g. "labs.google").'),
});

const WorkflowStopSchema = z.object({});

const WorkflowRunSchema = z.object({
  name: z.string().min(1).describe('Saved workflow name to replay.'),
  vars: z.record(z.string(), z.string()).optional().describe('Variables to substitute for {{var}} placeholders.'),
  confirmDestructive: z.boolean().optional().describe('Set true only after user confirms destructive steps.'),
});

const WorkflowListSchema = z.object({
  query: z.string().optional().describe('Optional keyword filter to match saved workflows.'),
});

const WorkflowMatchSchema = z.object({
  query: z.string().min(1).describe('User intent/query to match against cached SQLite workflows.'),
  domain: z.string().optional().describe('Optional current domain.'),
});

const BrowserMemorySchema = z.object({
  action: z.enum(['remember', 'recall', 'forget']).describe('Memory operation.'),
  key: z.string().optional().describe('Memory key (required for remember/forget).'),
  value: z.unknown().optional().describe('Value to store (for remember).'),
  ttlSeconds: z.number().int().positive().optional().describe('Optional TTL in seconds.'),
});

const BrowserConfirmSchema = z.object({
  message: z.string().min(1).describe('Confirmation prompt shown to the user before destructive action.'),
  action: z.string().describe('Action type (e.g. DELETE, SUBMIT, PAYMENT).'),
  target: z.unknown().optional().describe('Target element/item metadata for 5-min undo snapshot.'),
  domain: z.string().optional().describe('Domain where the destructive action occurs.'),
  approved: z.boolean().optional().describe('Explicit user approval flag.'),
});

const BrowserTaskSchema = z.object({
  goal: z.string().min(1).describe('High-level browser goal.'),
  mode: z.enum(['assisted', 'auto']).optional().describe('Execution mode. Default: assisted.'),
  tabId: z.number().int().optional().describe('Target tab ID.'),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

export const WORKFLOW_TOOLS = [
  {
    name: 'workflow_start',
    description:
      'Start recording all browser bridge commands into the persistent SQLite (.sql) workflow cache for instant future replay.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Unique workflow name.' },
        queryPattern: { type: 'string', description: 'Natural-language keywords for future query matching.' },
        domain: { type: 'string', description: 'Target domain (default "*").' },
      },
      required: ['name'],
    },
  },
  {
    name: 'workflow_stop',
    description: 'Stop active workflow recording and save all recorded steps to the SQLite database.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'workflow_run',
    description:
      'Replay a saved SQLite workflow by name with optional {{var}} substitution. Pauses on destructive steps unless confirmed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Saved workflow name.' },
        vars: { type: 'object', description: 'Key/value variables to substitute.' },
        confirmDestructive: { type: 'boolean', description: 'Explicit confirmation for destructive steps.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'workflow_list',
    description: 'List saved workflows from the local SQLite database, optionally filtered by query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Filter keyword.' },
      },
      required: [],
    },
  },
  {
    name: 'workflow_match',
    description:
      'Match a user query against cached SQLite workflows before planning from scratch (saves tokens & avoids redundant screenshots).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'User goal or query.' },
        domain: { type: 'string', description: 'Optional domain filter.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_memory',
    description:
      'Cross-session persistent SQLite memory (remember / recall / forget) with automatic PII/token filtering and TTL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['remember', 'recall', 'forget'], description: 'Operation.' },
        key: { type: 'string', description: 'Memory key.' },
        value: { description: 'Value to remember.' },
        ttlSeconds: { type: 'number', description: 'Optional TTL in seconds.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'browser_confirm',
    description:
      'Safety gate for destructive actions (delete/trash/submit/payment). Records a 5-minute undo snapshot in SQLite and blocks execution until approved=true.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Clear explanation of the destructive action.' },
        action: { type: 'string', description: 'Destructive action category.' },
        target: { description: 'Target metadata for undo recovery.' },
        domain: { type: 'string', description: 'Domain name.' },
        approved: { type: 'boolean', description: 'Set true only after explicit user approval.' },
      },
      required: ['message', 'action'],
    },
  },
  {
    name: 'browser_task',
    description:
      'Plan-Execute-Verify helper: checks SQLite workflow cache first, observes current tab state without screenshots, and returns matched workflow or structured next-step plan.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        goal: { type: 'string', description: 'Natural-language task goal.' },
        mode: { type: 'string', enum: ['assisted', 'auto'], description: 'Execution mode.' },
        tabId: { type: 'number', description: 'Target tab ID.' },
      },
      required: ['goal'],
    },
  },
];

// ─── Handler ────────────────────────────────────────────────────────────────

export async function handleWorkflowTool(
  name: string,
  args: unknown,
  bridge: BridgeClient,
  store: MemoryStore
): Promise<ToolResponse | undefined> {
  switch (name) {
    case 'workflow_start': {
      const params = WorkflowStartSchema.parse(args ?? {});
      if (activeRecording) {
        activeRecording.unsubscribe();
      }
      const steps: RecordedStep[] = [];
      const unsubscribe = bridge.onCommand((entry) => {
        if (entry.error) return;
        if (['BROWSER_STATUS', 'BROWSER_BRIDGE_HEALTH', 'GET_DOM_SNAPSHOT', 'OBSERVE', 'SCREENSHOT'].includes(entry.action)) {
          return;
        }
        steps.push({
          action: entry.action,
          payload: (entry.payload as Record<string, unknown>) || {},
          durationMs: entry.durationMs,
          timestamp: Date.now(),
        });
      });
      activeRecording = {
        name: params.name,
        queryPattern: params.queryPattern || params.name,
        domain: params.domain || '*',
        steps,
        unsubscribe,
      };
      return ok({ recording: true, name: params.name, dbPath: store.dbPath });
    }

    case 'workflow_stop': {
      WorkflowStopSchema.parse(args ?? {});
      if (!activeRecording) {
        return ok({ recording: false, message: 'No active workflow recording.' });
      }
      activeRecording.unsubscribe();
      const saved = store.saveWorkflow({
        name: activeRecording.name,
        queryPattern: activeRecording.queryPattern,
        domain: activeRecording.domain,
        steps: activeRecording.steps,
      });
      activeRecording = null;
      return ok({ saved: true, workflow: saved });
    }

    case 'workflow_run': {
      const params = WorkflowRunSchema.parse(args ?? {});
      const wf = store.getWorkflow(params.name);
      if (!wf) {
        throw new Error(`Workflow '${params.name}' not found in SQLite store.`);
      }
      const vars = params.vars || {};
      const results: Array<{ step: number; action: string; ok: boolean; result?: unknown }> = [];

      for (let i = 0; i < wf.steps.length; i++) {
        const step = wf.steps[i];
        const resolvedPayload = substituteVars(step.payload, vars) as Record<string, unknown>;
        const payloadText = JSON.stringify(resolvedPayload);
        if (!params.confirmDestructive && DESTRUCTIVE_RE.test(`${step.action} ${payloadText}`)) {
          return ok({
            pausedForConfirmation: true,
            stepIndex: i,
            action: step.action,
            payload: resolvedPayload,
            message: 'Destructive step detected during workflow replay. Re-run with confirmDestructive: true after user approval.',
          });
        }
        const res = await bridge.sendCommand(step.action, resolvedPayload);
        results.push({ step: i + 1, action: step.action, ok: true, result: res });
      }

      store.incrementWorkflowHit(wf.name);
      return ok({ replayed: wf.name, stepsExecuted: results.length, results });
    }

    case 'workflow_list': {
      const params = WorkflowListSchema.parse(args ?? {});
      const workflows = store.listWorkflows(params.query);
      return ok({
        count: workflows.length,
        dbPath: store.dbPath,
        workflows: workflows.map((w) => ({
          name: w.name,
          queryPattern: w.queryPattern,
          domain: w.domain,
          stepsCount: w.steps.length,
          hitCount: w.hitCount,
          updatedAt: w.updatedAt,
        })),
      });
    }

    case 'workflow_match': {
      const params = WorkflowMatchSchema.parse(args ?? {});
      const match = store.matchWorkflow(params.query, params.domain);
      return ok({ matched: Boolean(match), workflow: match });
    }

    case 'browser_memory': {
      const params = BrowserMemorySchema.parse(args ?? {});
      if (params.action === 'remember') {
        if (!params.key) throw new Error('key is required for remember');
        return ok(store.remember(params.key, params.value, params.ttlSeconds));
      }
      if (params.action === 'forget') {
        if (!params.key) throw new Error('key is required for forget');
        return ok({ deleted: store.forget(params.key), key: params.key });
      }
      return ok({ entries: store.recall(params.key) });
    }

    case 'browser_confirm': {
      const params = BrowserConfirmSchema.parse(args ?? {});
      const undoId = randomUUID();
      store.saveUndoSnapshot({
        id: undoId,
        domain: params.domain || '*',
        action: params.action,
        target: params.target ?? {},
      });
      if (!params.approved) {
        return ok({
          approved: false,
          requiresUserApproval: true,
          undoSnapshotId: undoId,
          message: params.message,
        });
      }
      return ok({ approved: true, undoSnapshotId: undoId });
    }

    case 'browser_task': {
      const params = BrowserTaskSchema.parse(args ?? {});
      const matched = store.matchWorkflow(params.goal);
      const observation = await bridge.sendCommand('OBSERVE', { tabId: params.tabId }).catch(() => null);
      const memorySummary = store.recall().slice(0, 10);
      return ok({
        goal: params.goal,
        mode: params.mode || 'assisted',
        cachedWorkflowMatch: matched
          ? { name: matched.name, stepsCount: matched.steps.length, hitCount: matched.hitCount }
          : null,
        observation,
        recalledMemoryCount: memorySummary.length,
        hint: matched
          ? `Matched cached workflow '${matched.name}'. Call workflow_run({ name: '${matched.name}' }) to replay without extra screenshots.`
          : 'No cached workflow matched. Use browser_snapshot (@eN refs) + workflow_start/workflow_stop to cache this task for next time.',
      });
    }

    default:
      return undefined;
  }
}
