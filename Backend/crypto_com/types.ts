export type CryptoComAgentMode = 'paper_local' | 'paper_exchange';
export type CryptoComAgentRuntimeStatus = 'running' | 'stale' | 'offline' | 'unknown';

export interface CryptoComRegistryAgent {
  id: string;
  mode: CryptoComAgentMode;
  enabled: boolean;
  extra: Record<string, unknown>;
}

export interface CryptoComLatestStatus extends Record<string, unknown> {
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
}

export interface CryptoComPaperState extends Record<string, unknown> {
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
}

export interface CryptoComAgentTelemetryRead {
  latestStatus: CryptoComLatestStatus | null;
  paperState: CryptoComPaperState | null;
}
