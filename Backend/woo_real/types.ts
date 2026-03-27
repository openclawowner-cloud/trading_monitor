export type WooRealAgentMode = 'paper_local' | 'paper_exchange';
export type WooRealAgentRuntimeStatus = 'running' | 'stale' | 'offline' | 'unknown';

export interface WooRealRegistryAgent {
  id: string;
  mode: WooRealAgentMode;
  enabled: boolean;
  extra: Record<string, unknown>;
}

export interface WooRealLatestStatus extends Record<string, unknown> {
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
}

export interface WooRealPaperState extends Record<string, unknown> {
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
}

export interface WooRealAgentTelemetryRead {
  latestStatus: WooRealLatestStatus | null;
  paperState: WooRealPaperState | null;
}
