export type BybitAgentMode = 'paper_local' | 'paper_exchange';
export type BybitAgentRuntimeStatus = 'running' | 'stale' | 'offline' | 'unknown';

export interface BybitRegistryAgent {
  id: string;
  mode: BybitAgentMode;
  enabled: boolean;
  extra: Record<string, unknown>;
}

export interface BybitLatestStatus extends Record<string, unknown> {
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
}

export interface BybitPaperState extends Record<string, unknown> {
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
}

export interface BybitAgentTelemetryRead {
  latestStatus: BybitLatestStatus | null;
  paperState: BybitPaperState | null;
}
