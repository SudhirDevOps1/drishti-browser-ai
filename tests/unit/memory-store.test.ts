import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStore, containsSensitiveData } from '../../apps/mcp-server/src/db/memory-store.js';

describe('MemoryStore (SQLite .sql workflow & memory cache)', () => {
  const stores: MemoryStore[] = [];

  afterEach(() => {
    while (stores.length > 0) {
      stores.pop()?.close();
    }
  });

  it('saves, lists, and matches cached workflows by query keywords', () => {
    const store = new MemoryStore(':memory:');
    stores.push(store);

    store.saveWorkflow({
      name: 'flow-download',
      queryPattern: 'download generated clips from google flow',
      domain: 'labs.google',
      steps: [
        { action: 'CLICK', payload: { ref: '@e5' }, durationMs: 42, timestamp: Date.now() },
        { action: 'DOWNLOAD_MEDIA', payload: { url: 'https://example.com/clip.mp4' }, durationMs: 120, timestamp: Date.now() },
      ],
    });

    const list = store.listWorkflows('flow');
    expect(list).toHaveLength(1);
    expect(list[0].steps).toHaveLength(2);

    const matched = store.matchWorkflow('download clips from flow', 'labs.google');
    expect(matched?.name).toBe('flow-download');

    store.incrementWorkflowHit('flow-download');
    expect(store.getWorkflow('flow-download')?.hitCount).toBe(1);
  });

  it('caches and increments verified selectors per domain and intent', () => {
    const store = new MemoryStore(':memory:');
    stores.push(store);

    store.cacheSelector({
      domain: 'github.com',
      intent: 'merge pull request button',
      selector: '[data-drishti-ref="@e12"]',
      ariaLabel: 'Merge pull request',
    });
    store.cacheSelector({
      domain: 'github.com',
      intent: 'merge pull request button',
      selector: '[data-drishti-ref="@e12"]',
    });

    const hit = store.lookupSelector('github.com', 'merge pull request button');
    expect(hit).not.toBeNull();
    expect(hit?.hitCount).toBe(2);
    expect(hit?.ariaLabel).toBe('Merge pull request');
  });

  it('filters sensitive tokens/emails from cross-session memory and supports undo snapshots', () => {
    const store = new MemoryStore(':memory:');
    stores.push(store);

    expect(containsSensitiveData('bridgeAuthToken', 'abc')).toBe(true);
    expect(containsSensitiveData('userNote', 'a'.repeat(64))).toBe(true);

    const blocked = store.remember('userEmail', 'test@example.com');
    expect(blocked.saved).toBe(false);

    const ok = store.remember('flow.lastProject', 'proj_42');
    expect(ok.saved).toBe(true);
    expect(store.recall('flow.lastProject')[0]?.value).toBe('proj_42');

    store.saveUndoSnapshot({
      id: 'undo-1',
      domain: 'labs.google',
      action: 'DELETE',
      target: { ref: '@e9' },
    });
    const snapshots = store.getRecentUndoSnapshots('labs.google');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe('undo-1');
  });
});
