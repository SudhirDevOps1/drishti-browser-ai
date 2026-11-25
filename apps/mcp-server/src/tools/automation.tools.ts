import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';
import { ToolResponse } from './browser.tools.js';

function ok(result: unknown): ToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const WorkflowStepSchema = z.object({
  tool: z.string().describe('Tool name to execute in this step.'),
  params: z.record(z.unknown()).describe('Parameters to pass to the tool.'),
});

const ExecuteWorkflowSchema = z.object({
  steps: z.array(WorkflowStepSchema).min(1).describe('Ordered list of steps to execute.'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  mode: z
    .enum(['manual', 'assisted', 'auto'])
    .optional()
    .describe('Execution mode: manual (user confirms each step), assisted (AI suggests, user approves), auto (fully autonomous). Default: auto.'),
});

const VerifyActionSchema = z.object({
  description: z.string().describe('Natural-language description of the action to verify (e.g. "button was clicked and modal appeared").'),
  tabId: z.number().int().optional().describe('Target tab ID. Defaults to active tab.'),
  screenshot: z.boolean().optional().describe('Include a screenshot in the verification result. Default: false.'),
});

const TaskStatusSchema = z.object({
  taskId: z.string().describe('ID of the task to query.'),
});

const StopTaskSchema = z.object({
  taskId: z.string().optional().describe('ID of the task to stop. Stops the currently running task if omitted.'),
});

const BatchCompareSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(3).describe('Up to 3 URLs to open concurrently and compare (e.g. Amazon, Flipkart, Croma).'),
});

const UpdateMissionSchema = z.object({
  missionId: z.string().describe('ID of the Sidepanel mission to update.'),
  status: z.enum(['queued', 'running', 'completed', 'failed']).describe('Updated mission status.'),
  summary: z.string().optional().describe('Short summary of what was accomplished or error reason.'),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

export const AUTOMATION_TOOLS = [
  {
    name: 'browser_execute_workflow',
    description:
      'Execute a multi-step browser workflow defined as an ordered list of tool calls. Steps run sequentially. Use mode="auto" for fully autonomous execution.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string', description: 'Tool name.' },
              params: { type: 'object', description: 'Tool parameters.' },
            },
            required: ['tool', 'params'],
          },
          description: 'Ordered list of steps.',
        },
        tabId: { type: 'number', description: 'Target tab ID.' },
        mode: {
          type: 'string',
          enum: ['manual', 'assisted', 'auto'],
          description: 'Execution mode.',
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'browser_verify_action',
    description:
      'Verify that a previously performed action succeeded by checking the current page state against a natural-language description. Returns a pass/fail verdict with evidence.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string', description: 'What to verify, e.g. "form was submitted and success toast appeared".' },
        tabId: { type: 'number', description: 'Target tab ID.' },
        screenshot: { type: 'boolean', description: 'Include a screenshot in the result.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'browser_task_status',
    description: 'Returns the current status and progress of a running or completed automation task by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: { type: 'string', description: 'ID of the task to query.' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'browser_stop_task',
    description: 'Stop a running automation task. Stops the currently running task if no taskId is provided.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: { type: 'string', description: 'ID of the task to stop. Omit to stop the current task.' },
      },
      required: [],
    },
  },
  {
    name: 'browser_batch_compare',
    description:
      'Open up to 3 URLs concurrently in background tabs (e.g. Amazon, Flipkart, Croma), extract product titles and prices simultaneously, and return a comparison summary table.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Up to 3 URLs to compare concurrently.',
        },
      },
      required: ['urls'],
    },
  },
  {
    name: 'browser_get_missions',
    description:
      'List missions sent by the user from the Drishti Control Deck browser Sidepanel (Natural Language Mission box).',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'browser_update_mission',
    description:
      'Update the status and summary of a Sidepanel mission so the user sees live progress in the browser.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        missionId: { type: 'string', description: 'Mission ID from browser_get_missions.' },
        status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed'] },
        summary: { type: 'string', description: 'Optional result summary.' },
      },
      required: ['missionId', 'status'],
    },
  },
];

// ─── Registration ────────────────────────────────────────────────────────────

export async function handleAutomationTool(name: string, args: unknown, bridge: BridgeClient): Promise<ToolResponse | undefined> {
  switch (name) {
    case 'browser_execute_workflow': {
      const params = ExecuteWorkflowSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('EXECUTE_WORKFLOW', params));
    }
    case 'browser_verify_action': {
      const params = VerifyActionSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('VERIFY_ACTION', params));
    }
    case 'browser_task_status': {
      const params = TaskStatusSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('TASK_STATUS', params));
    }
    case 'browser_stop_task': {
      const params = StopTaskSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('STOP_TASK', params));
    }
    case 'browser_batch_compare': {
      const params = BatchCompareSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('BATCH_COMPARE', params));
    }
    case 'browser_get_missions': {
      return ok(await bridge.sendCommand('GET_MISSIONS', {}));
    }
    case 'browser_update_mission': {
      const params = UpdateMissionSchema.parse(args ?? {});
      return ok(await bridge.sendCommand('UPDATE_MISSION', params));
    }
    default:
      return undefined;
  }
}
