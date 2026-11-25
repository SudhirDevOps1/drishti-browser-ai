import { EventEmitter } from 'events';
import type { AutomationMode, BridgeInterface, Task, TaskAction, TaskResult } from './types.js';

const ACTION_TIMEOUT_MS = 30_000;      // 30 seconds per action
const MAX_RETRIES = 2;

// Action types that always require confirmation in ASSISTED mode
const CONSEQUENTIAL_ACTIONS = new Set([
  'submit',
  'click',
  'navigate',
  'type',
  'select',
  'download',
  'delete',
  'purchase',
  'pay',
]);

function isConsequential(actionType: string): boolean {
  return CONSEQUENTIAL_ACTIONS.has(actionType.toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes tasks step by step, tracking progress.
 *
 * Events emitted:
 *  - 'action:start'     (action: TaskAction)
 *  - 'action:complete'  (action: TaskAction, result: unknown)
 *  - 'action:failed'    (action: TaskAction, error: Error)
 *  - 'action:pending'   (action: TaskAction)   — MANUAL / ASSISTED awaiting confirmation
 *  - 'task:complete'    (result: TaskResult)
 *  - 'task:failed'      (result: TaskResult)
 *  - 'task:cancelled'   (result: TaskResult)
 */
export class TaskExecutor extends EventEmitter {
  private _currentTask: Task | null = null;
  private _running = false;
  private _paused = false;
  private _cancelled = false;

  // Resolvers for pause/resume flow
  private _resumeResolver: (() => void) | null = null;

  // Per-action confirmation resolver (for MANUAL / ASSISTED modes)
  private _confirmResolver: ((confirmed: boolean) => void) | null = null;

  constructor(private bridge: BridgeInterface) {
    super();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Execute a task in the given automation mode.
   * Returns a TaskResult when the task completes, fails, or is cancelled.
   */
  async execute(task: Task, mode: AutomationMode): Promise<TaskResult> {
    this._currentTask = task;
    this._running = true;
    this._paused = false;
    this._cancelled = false;

    task.status = 'running';
    task.startedAt = Date.now();

    let completedActions = 0;

    try {
      for (let i = task.currentActionIndex; i < task.actions.length; i++) {
        if (this._cancelled) {
          task.status = 'cancelled';
          break;
        }

        // Wait while paused
        if (this._paused) {
          task.status = 'paused';
          await this._waitForResume();
          task.status = 'running';
        }

        const action = task.actions[i];
        task.currentActionIndex = i;

        // Determine if this action needs confirmation before execution
        const needsConfirm = this._needsConfirmation(mode, action);

        if (needsConfirm) {
          action.status = 'pending';
          this.emit('action:pending', action);
          const confirmed = await this._waitForConfirmation();
          if (!confirmed) {
            action.status = 'skipped';
            continue;
          }
        }

        // Execute with retry logic
        const success = await this._executeActionWithRetry(action);

        if (success) {
          completedActions++;
        } else {
          // A failed action after retries terminates the task
          task.status = 'failed';
          task.error = `Action '${action.type}' failed after ${MAX_RETRIES} retries: ${action.error}`;
          task.completedAt = Date.now();
          this._running = false;

          const result: TaskResult = {
            taskId: task.id,
            status: 'failed',
            completedActions,
            totalActions: task.actions.length,
            error: task.error,
            duration: task.completedAt - (task.startedAt ?? task.completedAt),
          };

          this.emit('task:failed', result);
          this._currentTask = null;
          return result;
        }
      }

      // ── Determine final status ──────────────────────────────────────────────
      if (this._cancelled) {
        task.status = 'cancelled';
      } else {
        task.status = 'completed';
      }

      task.completedAt = Date.now();
      this._running = false;

      const result: TaskResult = {
        taskId: task.id,
        status: task.status,
        completedActions,
        totalActions: task.actions.length,
        result: task.result,
        duration: task.completedAt - (task.startedAt ?? task.completedAt),
      };

      if (task.status === 'cancelled') {
        this.emit('task:cancelled', result);
      } else {
        this.emit('task:complete', result);
      }

      this._currentTask = null;
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = Date.now();
      this._running = false;

      const result: TaskResult = {
        taskId: task.id,
        status: 'failed',
        completedActions,
        totalActions: task.actions.length,
        error: error.message,
        duration: task.completedAt - (task.startedAt ?? task.completedAt),
      };

      this.emit('task:failed', result);
      this._currentTask = null;
      return result;
    }
  }

  /**
   * Pause execution after the current action completes.
   */
  async pause(): Promise<void> {
    if (!this._running) return;
    this._paused = true;
  }

  /**
   * Resume a paused execution.
   */
  async resume(): Promise<void> {
    if (!this._paused) return;
    this._paused = false;
    if (this._resumeResolver) {
      this._resumeResolver();
      this._resumeResolver = null;
    }
  }

  /**
   * Cancel the currently running task.
   */
  async cancel(): Promise<void> {
    this._cancelled = true;
    // Unblock any waiting pause or confirmation
    if (this._resumeResolver) {
      this._resumeResolver();
      this._resumeResolver = null;
    }
    if (this._confirmResolver) {
      this._confirmResolver(false);
      this._confirmResolver = null;
    }
  }

  /**
   * Confirm or deny the pending action (called externally in MANUAL / ASSISTED mode).
   */
  confirmAction(confirmed: boolean): void {
    if (this._confirmResolver) {
      this._confirmResolver(confirmed);
      this._confirmResolver = null;
    }
  }

  get currentTask(): Task | null {
    return this._currentTask;
  }

  get isRunning(): boolean {
    return this._running;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private _needsConfirmation(mode: AutomationMode, action: TaskAction): boolean {
    if (mode === 'MANUAL') return true;
    if (mode === 'ASSISTED') return isConsequential(action.type);
    return false; // AUTO: no confirmation
  }

  private async _waitForResume(): Promise<void> {
    return new Promise<void>((resolve) => {
      this._resumeResolver = resolve;
    });
  }

  private async _waitForConfirmation(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this._confirmResolver = resolve;
    });
  }

  private async _executeActionWithRetry(action: TaskAction): Promise<boolean> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (this._cancelled) return false;

      action.status = 'running';
      action.startedAt = Date.now();
      this.emit('action:start', action);

      try {
        const result = await this._executeWithTimeout(action);
        action.status = 'completed';
        action.completedAt = Date.now();
        this.emit('action:complete', action, result);
        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        action.retries = attempt;
        action.error = error.message;

        if (attempt < MAX_RETRIES) {
          // Exponential back-off: 500ms, 1000ms
          await sleep(500 * (attempt + 1));
          continue;
        }

        // Final failure
        action.status = 'failed';
        action.completedAt = Date.now();
        this.emit('action:failed', action, error);
        return false;
      }
    }

    return false;
  }

  private async _executeWithTimeout(action: TaskAction): Promise<unknown> {
    if (!this.bridge.isConnected()) {
      throw new Error('Bridge is not connected');
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`Action '${action.type}' timed out after ${ACTION_TIMEOUT_MS}ms`));
      }, ACTION_TIMEOUT_MS);
    });

    return Promise.race([
      this.bridge.sendCommand(action.type, action.payload),
      timeoutPromise,
    ]);
  }
}
