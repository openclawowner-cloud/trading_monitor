export type AgentStatus = 'running' | 'stale' | 'offline' | 'error' | 'disabled' | 'archived';

export interface Incident {
  type: string;
  agentId?: string;
  reason: string;
  impact: string;
  recommendedAction: string;
  symbols?: string[];
  lastHealthyTimestamp?: string | number;
  meta?: Record<string, unknown>;
}

export interface AgentListItem {
  agentId: string;
  name: string;
  strategy: string;
  regime: string;
  mode: string;
  enabled: boolean;
  status: AgentStatus;
  telemetryAvailable: boolean;
  lastModifiedMs: number | null;
  activityStatus: AgentStatus;
  category: string;
  openPositions: number;
  unrealizedPnl?: number;
  realizedPnl: number;
  pnl: number;
  cash: number;
  equity: number;
  reconciliationOk: boolean;
  incidents: Incident[];
  lastUpdate: string | null;
}

export interface ConfigResponse {
  killSwitchMode: string;
  killSwitchActive: boolean;
  staleThresholdMinutes: number;
  wsEnabled: boolean;
  version?: string;
  capabilities?: string[];
}

export interface ReconCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface MismatchDetail {
  symbol: string;
  fills_qty: number;
  reported_qty: number;
  diff_usd?: number;
  last_fill_id?: string;
  last_fill_timestamp?: string | number;
}

export interface ReconciliationResult {
  positionOk: boolean;
  cashOk: boolean;
  pnlOk: boolean;
  checks: ReconCheck[];
  stateTimestamp?: string | number;
  marketPriceTimestamp?: string | number;
  mismatchDetails?: MismatchDetail[];
}

export interface AgentDetailResponse {
  status: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
  reconciliation: ReconciliationResult;
  agent: Record<string, unknown>;
}

export interface SupervisorAgentState {
  displayName: string;
  pid: number | null;
  startedAt: number | null;
  lastRestartAt: number | null;
  restartCountInWindow: number;
  rateLimited: boolean;
  isStale: boolean;
  statusMtime: number | null;
}

export interface SupervisorStatus {
  supervisorRunning: boolean;
  supervisorPid: number | null;
  updatedAt: number | null;
  agents: Record<string, SupervisorAgentState>;
}
