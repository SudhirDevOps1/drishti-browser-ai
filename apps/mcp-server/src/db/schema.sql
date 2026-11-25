-- Drishti Browser AI — Persistent Workflow, Selector Cache & Memory Schema

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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

CREATE INDEX IF NOT EXISTS idx_workflows_domain ON workflows(domain);
CREATE INDEX IF NOT EXISTS idx_workflows_hits ON workflows(hit_count DESC, updated_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_selector_domain_intent ON selector_cache(domain, intent);

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

CREATE INDEX IF NOT EXISTS idx_undo_expires ON undo_snapshots(expires_at);
