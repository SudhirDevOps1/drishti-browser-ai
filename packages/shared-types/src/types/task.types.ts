import type { AutomationMode } from './browser.types';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum TaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum ActionType {
  NAVIGATE = 'NAVIGATE',
  CLICK = 'CLICK',
  TYPE = 'TYPE',
  FILL = 'FILL',
  SCROLL = 'SCROLL',
  SCREENSHOT = 'SCREENSHOT',
  OBSERVE = 'OBSERVE',
  WAIT = 'WAIT',
  PRESS_KEY = 'PRESS_KEY',
  SELECT = 'SELECT',
  HOVER = 'HOVER',
  DOUBLE_CLICK = 'DOUBLE_CLICK',
  GET_TEXT = 'GET_TEXT',
  GET_LINKS = 'GET_LINKS',
  CUSTOM = 'CUSTOM',
}

export enum ActionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Action {
  id: string;
  type: ActionType;
  description: string;
  params: Record<string, unknown>;
  status: ActionStatus;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  requiresApproval: boolean;
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  mode: AutomationMode;
  actions: Action[];
  currentActionIndex: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
  tabId?: number;
  metadata?: Record<string, unknown>;
}

export interface PlannedStep {
  stepIndex: number;
  description: string;
  actions: Partial<Action>[];
  requiresApproval: boolean;
}

export interface TaskPlan {
  taskId: string;
  steps: PlannedStep[];
  estimatedActions: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  tool: string;
  params: Record<string, unknown>;
  condition?: string;
  onError?: 'stop' | 'continue' | 'retry';
  maxRetries?: number;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  timeout?: number;
}
