import { TaskQueue } from './task-queue.js';
import { TaskExecutor } from './task-executor.js';
import { Task, AutomationMode, TaskResult, BridgeInterface } from './types.js';

export class WorkflowEngine {
  private queue: TaskQueue;
  private executor: TaskExecutor;
  private tasks: Map<string, Task> = new Map();
  private history: TaskResult[] = [];

  constructor(bridge: BridgeInterface) {
    this.queue = new TaskQueue();
    this.executor = new TaskExecutor(bridge);

    this.executor.on('task:complete', (res: TaskResult) => {
      this.history.unshift(res);
      if (this.history.length > 50) this.history.pop();
    });

    this.executor.on('task:failed', (res: TaskResult) => {
      this.history.unshift(res);
      if (this.history.length > 50) this.history.pop();
    });
  }

  public createTask(
    description: string,
    mode: AutomationMode = 'AUTO',
    actions: Array<{ type: string; payload: unknown; description?: string }> = []
  ): Task {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task: Task = {
      id,
      description,
      mode,
      status: 'queued',
      priority: 1,
      actions: actions.map((a, i) => ({
        id: `${id}_act_${i}`,
        type: a.type,
        payload: a.payload,
        description: a.description || a.type,
        status: 'pending',
        retries: 0,
      })),
      currentActionIndex: 0,
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);
    this.queue.enqueue(task);
    return task;
  }

  public async runNext(): Promise<TaskResult | null> {
    const nextTask = this.queue.dequeue();
    if (!nextTask) return null;
    return this.executor.execute(nextTask, nextTask.mode);
  }

  public async pauseCurrent(): Promise<void> {
    await this.executor.pause();
  }

  public async resumeCurrent(): Promise<void> {
    await this.executor.resume();
  }

  public async cancelCurrent(): Promise<void> {
    await this.executor.cancel();
  }

  public getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  public getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  public getHistory(): TaskResult[] {
    return [...this.history];
  }

  public getQueueSize(): number {
    return this.queue.size;
  }

  public isRunning(): boolean {
    return this.executor.isRunning;
  }
}
