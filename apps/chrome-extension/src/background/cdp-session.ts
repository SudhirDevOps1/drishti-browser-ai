/**
 * Persistent chrome.debugger session manager per target tab.
 * Attaches once per tab, reuses the session across clicks/evaluate/PDF,
 * and auto-detaches after an idle timeout (default 60s), on tab close,
 * or when the user cancels the browser debug banner.
 */

export interface CdpAdapter {
  attach(tabId: number, version: string): Promise<void>;
  detach(tabId: number): Promise<void>;
  sendCommand(tabId: number, method: string, params?: Record<string, unknown>): Promise<unknown>;
}

const DEFAULT_IDLE_MS = 60_000;

function createChromeAdapter(): CdpAdapter {
  return {
    attach: (tabId, version) => chrome.debugger.attach({ tabId }, version),
    detach: (tabId) => chrome.debugger.detach({ tabId }),
    sendCommand: (tabId, method, params) => chrome.debugger.sendCommand({ tabId }, method, params),
  };
}

export class CdpSessionManager {
  private readonly attached = new Map<number, { timer: ReturnType<typeof setTimeout> | null }>();
  private readonly inflightAttach = new Map<number, Promise<void>>();
  private readonly idleMs: number;
  private readonly adapter: CdpAdapter;
  private listenersInstalled = false;

  constructor(options?: { idleMs?: number; adapter?: CdpAdapter }) {
    this.idleMs = options?.idleMs ?? DEFAULT_IDLE_MS;
    this.adapter = options?.adapter ?? createChromeAdapter();
  }

  installListeners(): void {
    if (this.listenersInstalled) return;
    this.listenersInstalled = true;

    if (typeof chrome !== 'undefined' && chrome.debugger?.onDetach) {
      chrome.debugger.onDetach.addListener((source) => {
        if (typeof source.tabId === 'number') {
          this.clearState(source.tabId);
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        this.clearState(tabId);
      });
    }
  }

  isAttached(tabId: number): boolean {
    return this.attached.has(tabId);
  }

  getAttachedTabs(): number[] {
    return Array.from(this.attached.keys());
  }

  private clearState(tabId: number): void {
    const entry = this.attached.get(tabId);
    if (entry?.timer) clearTimeout(entry.timer);
    this.attached.delete(tabId);
  }

  private touchIdleTimer(tabId: number): void {
    const entry = this.attached.get(tabId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    if (this.idleMs <= 0) return;
    entry.timer = setTimeout(() => {
      void this.detach(tabId);
    }, this.idleMs);
  }

  async ensureAttached(tabId: number): Promise<void> {
    this.installListeners();
    if (this.attached.has(tabId)) {
      this.touchIdleTimer(tabId);
      return;
    }

    const existing = this.inflightAttach.get(tabId);
    if (existing) {
      await existing;
      return;
    }

    const attachWithTimeout = (id: number) => {
      let timerId: ReturnType<typeof setTimeout> | null = null;
      return Promise.race([
        this.adapter.attach(id, '1.3'),
        new Promise<void>((_, reject) => {
          timerId = setTimeout(() => reject(new Error(`CDP attach timed out after 2000ms (tab=${id})`)), 2000);
        }),
      ]).finally(() => {
        if (timerId !== null) clearTimeout(timerId);
      });
    };

    const promise = (async () => {
      try {
        await attachWithTimeout(tabId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If already attached by an earlier session/devtool check, reuse if ours or rethrow
        if (!/Another debugger is already attached/i.test(msg)) {
          throw err;
        }
        // Detach stale debugger and re-attach cleanly
        await this.adapter.detach(tabId).catch(() => {});
        await attachWithTimeout(tabId);
      }
      this.attached.set(tabId, { timer: null });
      this.touchIdleTimer(tabId);
    })().finally(() => {
      this.inflightAttach.delete(tabId);
    });

    this.inflightAttach.set(tabId, promise);
    await promise;
  }

  async sendCommand<T = unknown>(
    tabId: number,
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    await this.ensureAttached(tabId);
    try {
      const res = await this.adapter.sendCommand(tabId, method, params);
      this.touchIdleTimer(tabId);
      return res as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not attached|Detached|Target closed/i.test(msg)) {
        this.clearState(tabId);
        await this.ensureAttached(tabId);
        const retryRes = await this.adapter.sendCommand(tabId, method, params);
        this.touchIdleTimer(tabId);
        return retryRes as T;
      }
      throw err;
    }
  }

  async detach(tabId: number): Promise<void> {
    const wasAttached = this.attached.has(tabId);
    this.clearState(tabId);
    if (!wasAttached) return;
    await this.adapter.detach(tabId).catch(() => {});
  }

  async detachAll(): Promise<void> {
    const tabs = this.getAttachedTabs();
    await Promise.all(tabs.map((id) => this.detach(id)));
  }
}

export const cdpSession = new CdpSessionManager();
