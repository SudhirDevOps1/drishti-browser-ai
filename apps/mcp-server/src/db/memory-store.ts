import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const FALLBACK_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS workflows (
  name TEXT PRIMARY KEY,
  query_pattern TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '*',
  steps_json TEXT NOT NULL,
  vars_json TEXT NOT NULL DEFAULT '[]',
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS selector_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  intent TEXT NOT NULL,
  selector TEXT NOT NULL,
  aria_label TEXT,
  text_hint TEXT,
  hit_count INTEGER NOT NULL DEFAULT 1,
  last_verified_at INTEGER NOT NULL,
  UNIQUE(domain, intent)
);
CREATE TABLE IF NOT EXISTS task_memory (
  mem_key TEXT PRIMARY KEY,
  mem_value TEXT NOT NULL,
  ttl_expires_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS undo_snapshots (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  action TEXT NOT NULL,
  target_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

export interface RecordedStep {
  action: string;
  payload: Record<string, unknown>;
  durationMs: number;
  timestamp: number;
}

export interface WorkflowRecord {
  name: string;
  queryPattern: string;
  domain: string;
  steps: RecordedStep[];
  vars: string[];
  hitCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SelectorCacheEntry {
  domain: string;
  intent: string;
  selector: string;
  ariaLabel?: string | null;
  textHint?: string | null;
  hitCount: number;
  lastVerifiedAt: number;
}

const PII_PATTERNS: RegExp[] = [
  /[a-f0-9]{64}/i, // 64-char hex bridge/API tokens
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i, // emails
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i, // Bearer tokens
  /\bsk-[A-Za-z0-9]{16,}\b/, // API keys
];

const SENSITIVE_KEY_RE = /(password|passwd|secret|token|cookie|auth|apikey|api_key)/i;

export function containsSensitiveData(key: string, value: string): boolean {
  if (SENSITIVE_KEY_RE.test(key)) return true;
  return PII_PATTERNS.some((re) => re.test(value));
}

function resolveDefaultDbPath(): string {
  if (process.env.DRISHTI_DB_PATH) {
    return path.resolve(process.env.DRISHTI_DB_PATH);
  }
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, '../../data/drishti-memory.db');
}

export class MemoryStore {
  private db: DatabaseSync;
  public readonly dbPath: string;

  constructor(dbPath: string = resolveDefaultDbPath()) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
    const sql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : FALLBACK_SCHEMA_SQL;
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }

  // ─── Workflows ─────────────────────────────────────────────────────────────

  saveWorkflow(input: {
    name: string;
    queryPattern: string;
    domain?: string;
    steps: RecordedStep[];
    vars?: string[];
  }): WorkflowRecord {
    const now = Date.now();
    const existing = this.getWorkflow(input.name);
    const createdAt = existing?.createdAt ?? now;
    const hitCount = existing?.hitCount ?? 0;

    this.db
      .prepare(
        `INSERT INTO workflows (name, query_pattern, domain, steps_json, vars_json, hit_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           query_pattern = excluded.query_pattern,
           domain = excluded.domain,
           steps_json = excluded.steps_json,
           vars_json = excluded.vars_json,
           updated_at = excluded.updated_at`
      )
      .run(
        input.name,
        input.queryPattern,
        input.domain || '*',
        JSON.stringify(input.steps),
        JSON.stringify(input.vars || []),
        hitCount,
        createdAt,
        now
      );

    return this.getWorkflow(input.name)!;
  }

  getWorkflow(name: string): WorkflowRecord | null {
    const row = this.db
      .prepare('SELECT * FROM workflows WHERE name = ?')
      .get(name) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapWorkflowRow(row);
  }

  listWorkflows(query?: string): WorkflowRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM workflows ORDER BY hit_count DESC, updated_at DESC')
      .all() as Record<string, unknown>[];
    const all = rows.map((r) => this.mapWorkflowRow(r));
    if (!query || !query.trim()) return all;
    const q = query.trim().toLowerCase();
    return all.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.queryPattern.toLowerCase().includes(q) ||
        w.domain.toLowerCase().includes(q)
    );
  }

  matchWorkflow(query: string, domain?: string): WorkflowRecord | null {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    if (tokens.length === 0) return null;

    const all = this.listWorkflows();
    let best: { wf: WorkflowRecord; score: number } | null = null;

    for (const wf of all) {
      if (domain && wf.domain !== '*' && !domain.includes(wf.domain)) continue;
      const haystack = `${wf.name} ${wf.queryPattern}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (haystack.includes(tok)) score += 1;
      }
      if (score > 0 && (!best || score > best.score || (score === best.score && wf.hitCount > best.wf.hitCount))) {
        best = { wf, score };
      }
    }

    return best ? best.wf : null;
  }

  incrementWorkflowHit(name: string): void {
    this.db
      .prepare('UPDATE workflows SET hit_count = hit_count + 1, updated_at = ? WHERE name = ?')
      .run(Date.now(), name);
  }

  private mapWorkflowRow(row: Record<string, unknown>): WorkflowRecord {
    return {
      name: String(row['name']),
      queryPattern: String(row['query_pattern']),
      domain: String(row['domain']),
      steps: JSON.parse(String(row['steps_json'])) as RecordedStep[],
      vars: JSON.parse(String(row['vars_json'])) as string[],
      hitCount: Number(row['hit_count'] ?? 0),
      createdAt: Number(row['created_at']),
      updatedAt: Number(row['updated_at']),
    };
  }

  // ─── Selector Cache ────────────────────────────────────────────────────────

  cacheSelector(entry: {
    domain: string;
    intent: string;
    selector: string;
    ariaLabel?: string;
    textHint?: string;
  }): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO selector_cache (domain, intent, selector, aria_label, text_hint, hit_count, last_verified_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(domain, intent) DO UPDATE SET
           selector = excluded.selector,
           aria_label = COALESCE(excluded.aria_label, selector_cache.aria_label),
           text_hint = COALESCE(excluded.text_hint, selector_cache.text_hint),
           hit_count = selector_cache.hit_count + 1,
           last_verified_at = excluded.last_verified_at`
      )
      .run(entry.domain, entry.intent, entry.selector, entry.ariaLabel ?? null, entry.textHint ?? null, now);
  }

  lookupSelector(domain: string, intent: string): SelectorCacheEntry | null {
    const row = this.db
      .prepare('SELECT * FROM selector_cache WHERE domain = ? AND intent = ?')
      .get(domain, intent) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      domain: String(row['domain']),
      intent: String(row['intent']),
      selector: String(row['selector']),
      ariaLabel: row['aria_label'] ? String(row['aria_label']) : null,
      textHint: row['text_hint'] ? String(row['text_hint']) : null,
      hitCount: Number(row['hit_count'] ?? 1),
      lastVerifiedAt: Number(row['last_verified_at']),
    };
  }

  // ─── Cross-Session Task Memory ─────────────────────────────────────────────

  remember(key: string, value: unknown, ttlSeconds?: number): { saved: boolean; reason?: string } {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (containsSensitiveData(key, serialized)) {
      return { saved: false, reason: 'Blocked by PII/secret filter (sensitive token, password, or email detected).' };
    }
    const now = Date.now();
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? now + ttlSeconds * 1000 : null;
    this.db
      .prepare(
        `INSERT INTO task_memory (mem_key, mem_value, ttl_expires_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(mem_key) DO UPDATE SET
           mem_value = excluded.mem_value,
           ttl_expires_at = excluded.ttl_expires_at,
           updated_at = excluded.updated_at`
      )
      .run(key, serialized, expiresAt, now);
    return { saved: true };
  }

  recall(key?: string): Array<{ key: string; value: string; updatedAt: number }> {
    const now = Date.now();
    this.db.prepare('DELETE FROM task_memory WHERE ttl_expires_at IS NOT NULL AND ttl_expires_at <= ?').run(now);
    const rows = (
      key
        ? this.db.prepare('SELECT * FROM task_memory WHERE mem_key = ?').all(key)
        : this.db.prepare('SELECT * FROM task_memory ORDER BY updated_at DESC LIMIT 50').all()
    ) as Record<string, unknown>[];

    return rows.map((r) => ({
      key: String(r['mem_key']),
      value: String(r['mem_value']),
      updatedAt: Number(r['updated_at']),
    }));
  }

  forget(key: string): boolean {
    const res = this.db.prepare('DELETE FROM task_memory WHERE mem_key = ?').run(key);
    return Number(res.changes ?? 0) > 0;
  }

  // ─── Destructive Action Undo Snapshots (5-min retention) ───────────────────

  saveUndoSnapshot(input: { id: string; domain: string; action: string; target: unknown; ttlMs?: number }): void {
    const now = Date.now();
    const expiresAt = now + (input.ttlMs ?? 5 * 60 * 1000);
    this.db.prepare('DELETE FROM undo_snapshots WHERE expires_at <= ?').run(now);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO undo_snapshots (id, domain, action, target_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.id, input.domain, input.action, JSON.stringify(input.target), now, expiresAt);
  }

  getRecentUndoSnapshots(domain?: string): Array<{ id: string; domain: string; action: string; target: unknown; createdAt: number }> {
    const now = Date.now();
    this.db.prepare('DELETE FROM undo_snapshots WHERE expires_at <= ?').run(now);
    const rows = (
      domain
        ? this.db.prepare('SELECT * FROM undo_snapshots WHERE domain = ? ORDER BY created_at DESC LIMIT 10').all(domain)
        : this.db.prepare('SELECT * FROM undo_snapshots ORDER BY created_at DESC LIMIT 10').all()
    ) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r['id']),
      domain: String(r['domain']),
      action: String(r['action']),
      target: JSON.parse(String(r['target_json'])),
      createdAt: Number(r['created_at']),
    }));
  }
}
