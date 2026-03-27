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

/** Per-trade decision snapshot (cryptocoiner v3/v4 telemetry). */
export interface TradeDecisionContext {
  candle_time?: number;
  pair?: string;
  price?: number | null;
  sma20?: number | null;
  ma50?: number | null;
  ma100?: number | null;
  bb_upper?: number | null;
  bb_lower?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_hist?: number | null;
  psar?: number | null;
  trend_bias?: string;
  allow_new_buys?: boolean | null;
  higher_tf_ok?: boolean | null;
  falling_knife_blocked?: boolean | null;
  bb_width_pct?: number | null;
  bb_expansion_blocked?: boolean | null;
  trigger?: string;
  reason_detail?: string;
  [key: string]: unknown;
}

/** Latest cycle decision (also in status.latest_decision). */
export interface LatestDecisionRecord {
  timestamp: number;
  pair: string;
  action: string;
  reason: string;
  context: TradeDecisionContext;
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

/** OHLCV candle (time = Unix seconds, UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface ChartIndicators {
  sma20: IndicatorPoint[];
  ma50: IndicatorPoint[];
  ma100: IndicatorPoint[];
  bbUpper: IndicatorPoint[];
  bbLower: IndicatorPoint[];
}

export interface CandleResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
  indicators?: ChartIndicators;
}

/** Lightweight-charts marker payload (buy below / sell above bar). */
export interface ChartMarker {
  time: number;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

export interface OverviewExchangeSummary {
  exchangeId: string;
  label: string;
  enabled: boolean;
  supervisorRunning: boolean | null;
  counts: {
    total: number;
    running: number;
    stale: number;
    offline: number;
    disabled: number;
    archived: number;
  };
  pnl: { realized: number; unrealized: number; total: number };
  balances: { cash: number; equity: number };
  openPositions: number;
  incidents: Array<Record<string, unknown>>;
  lastUpdate: string | null;
}

export interface OverviewResponse {
  generatedAt: string;
  global: {
    agents: {
      total: number;
      running: number;
      stale: number;
      offline: number;
      disabled: number;
    };
    balances: { cash: number; equity: number };
    pnl: { realized: number; unrealized: number; total: number };
    openPositions: number;
    supervisors: { running: number; total: number };
    incidents: number;
    killSwitchActive: boolean;
    killSwitchMode: string;
  };
  exchanges: OverviewExchangeSummary[];
}
