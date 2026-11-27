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

export function readAuditLog(last = 50): AuditEntry[] {
  const logPath = getAuditLogPath();
  if (!existsSync(logPath)) return [];
  const limit = Math.min(Math.max(1, last), 500);
  const lines = readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try {
      return JSON.parse(line) as AuditEntry;
    } catch {
      return {
        timestamp: '',
        tool: 'unknown',
        outcome: 'error',
        durationMs: 0,
        error: 'Malformed audit line',
      };
    }
  });
}
