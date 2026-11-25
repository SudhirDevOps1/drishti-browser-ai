// ─── Shared Types for workflow-engine ─────────────────────────────────────────

export type AutomationMode = 'MANUAL' | 'ASSISTED' | 'AUTO';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskAction {
  id: string;
  type: string;
  payload: unknown;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  startedAt?: number;
  completedAt?: number;
  retries: number;
}

export interface Task {
  id: string;
  description: string;
  mode: AutomationMode;
  status: TaskStatus;
  priority: number;
  actions: TaskAction[];
  currentActionIndex: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: unknown;
}

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  completedActions: number;
  totalActions: number;
  result?: unknown;
  error?: string;
  duration: number;
}

export interface BridgeInterface {
  sendCommand(action: string, payload: unknown): Promise<unknown>;
  isConnected(): boolean;
}
