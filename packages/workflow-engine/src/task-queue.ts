import type { Task } from './types.js';

/**
 * FIFO task queue with priority support.
 * Higher priority number = higher priority (processed first).
 */
export class TaskQueue {
  private tasks: Task[] = [];

  /**
   * Add a task to the queue. Tasks are sorted by priority (descending),
   * and within the same priority, by insertion order (FIFO).
   */
  enqueue(task: Task): void {
    this.tasks.push(task);
    // Stable sort: higher priority first; equal priority preserves insertion order.
    this.tasks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove and return the highest-priority task from the front of the queue.
   * Returns undefined if the queue is empty.
   */
  dequeue(): Task | undefined {
    return this.tasks.shift();
  }

  /**
   * Return the highest-priority task without removing it.
   * Returns undefined if the queue is empty.
   */
  peek(): Task | undefined {
    return this.tasks[0];
  }

  /**
   * Number of tasks currently in the queue.
   */
  get size(): number {
    return this.tasks.length;
  }

  /**
   * Return a shallow copy of all tasks currently in the queue.
   */
  getAll(): Task[] {
    return [...this.tasks];
  }

  /**
   * Remove a task by ID.
   * Returns true if the task was found and removed, false otherwise.
   */
  remove(taskId: string): boolean {
    const index = this.tasks.findIndex((t) => t.id === taskId);
    if (index === -1) return false;
    this.tasks.splice(index, 1);
    return true;
  }

  /**
   * Remove all tasks from the queue.
   */
  clear(): void {
    this.tasks = [];
  }
}
