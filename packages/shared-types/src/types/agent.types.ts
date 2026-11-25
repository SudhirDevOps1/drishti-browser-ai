// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AgentType {
  ANTIGRAVITY = 'ANTIGRAVITY',
  OPENCODE = 'OPENCODE',
  CODEX = 'CODEX',
  CLAUDE_CODE = 'CLAUDE_CODE',
  CURSOR = 'CURSOR',
  WINDSURF = 'WINDSURF',
  CUSTOM = 'CUSTOM',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AgentMCPConfig {
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  mcpConfig: AgentMCPConfig;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface AgentConnection {
  agentId: string;
  connected: boolean;
  connectedAt?: number;
  lastActivity?: number;
  toolCallCount: number;
}
