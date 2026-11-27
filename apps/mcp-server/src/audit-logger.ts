import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AuditEntry {
  timestamp: string;
  tool: string;
  tabId?: number;
  outcome: 'ok' | 'error';
  durationMs: number;
  error?: string;
}

export interface AuditFilter {
  last?: number;
  limit?: number;
  tool?: string;
  outcome?: 'ok' | 'error';
  since?: string;
}

export function getAuditLogPath(): string {
  return process.env.DRISHTI_AUDIT_LOG || join(process.cwd(), 'drishti-audit.jsonl');
}

export function auditLog(entry: AuditEntry): void {
  try {
    appendFileSync(getAuditLogPath(), JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // non-fatal
  }
}

export function readAuditLog(filterOrLast: number | AuditFilter = 50): AuditEntry[] {
  const logPath = getAuditLogPath();
  if (!existsSync(logPath)) return [];
  const opts: AuditFilter = typeof filterOrLast === 'number' ? { limit: filterOrLast } : filterOrLast;
  const limit = Math.min(Math.max(1, opts.limit ?? opts.last ?? 50), 500);
  const lines = readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);

  let entries = lines.map((line) => {
    try {
      return JSON.parse(line) as AuditEntry;
    } catch {
      return {
        timestamp: '',
        tool: 'unknown',
        outcome: 'error' as const,
        durationMs: 0,
        error: 'Malformed audit line',
      };
    }
  });

  if (opts.tool) entries = entries.filter((e) => e.tool === opts.tool);
  if (opts.outcome) entries = entries.filter((e) => e.outcome === opts.outcome);
  if (opts.since) entries = entries.filter((e) => e.timestamp >= opts.since!);

  return entries.slice(-limit);
}
