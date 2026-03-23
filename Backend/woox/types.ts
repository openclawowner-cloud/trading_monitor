/** Declared execution mode for WOO-side agents (registry). */
export type WooAgentMode = 'paper_local' | 'paper_exchange';

/** Derived from telemetry freshness and file presence. */
export type WooAgentRuntimeStatus = 'running' | 'stale' | 'offline' | 'unknown';

/** GET /api/woox/capabilities */
export interface WooCapabilitiesResponse {
  paper_local: true;
  paper_exchange: boolean;
  spot: true;
  perps: false;
  signed_api_configured: boolean;
}

/** Normalized row from trading-live-woox/agents.json */
export interface WooRegistryAgent {
  id: string;
  mode: WooAgentMode;
  enabled: boolean;
  /** Original registry fields (scriptPath, intervalSec, …) preserved. */
  extra: Record<string, unknown>;
}

/** Root objects in latest_status.json / paper_state.json — extend with strategy fields. */
export interface WooLatestStatus extends Record<string, unknown> {
  schemaVersion?: number;
  venue?: string;
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
}

export interface WooPaperState extends Record<string, unknown> {
  schemaVersion?: number;
  venue?: string;
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
}

export interface WooxAgentTelemetryRead {
  latestStatus: WooLatestStatus | null;
  paperState: WooPaperState | null;
}

/** GET /api/woox/agents item */
export interface WooAgentListItem {
  agent: WooRegistryAgent;
  runtimeStatus: WooAgentRuntimeStatus;
  modeAllowed: boolean;
}

/** GET /api/woox/agent/:id */
export interface WooAgentDetailResponse {
  agent: WooRegistryAgent;
  latestStatus: WooLatestStatus | null;
  paperState: WooPaperState | null;
  runtimeStatus: WooAgentRuntimeStatus;
  modeAllowed: boolean;
}

/** Mirrors supervisor-state.json per-agent entries written by scripts/agent-supervisor.cjs */
export interface WooxSupervisorAgentState {
  displayName: string;
  pid: number | null;
  startedAt: number | null;
  lastRestartAt: number | null;
  restartCountInWindow: number;
  rateLimited: boolean;
  isStale: boolean;
  statusMtime: number | null;
}

/** GET /api/woox/supervisor */
export interface WooxSupervisorStatusResponse {
  running: boolean;
  supervisorPid: number | null;
  telemetryRoot: string;
  paths: {
    pidFile: string;
    stateFile: string;
    restartRequestFile: string;
  };
  updatedAt: number | null;
  agents: Record<string, WooxSupervisorAgentState>;
  lastError: string | null;
}

/** POST /api/woox/supervisor/start|stop|restart */
export interface WooxSupervisorActionResponse {
  ok: boolean;
  message?: string;
  agentId?: string;
}

/** Spot vs perp listing (perp not used for order prep in MVP). */
export type WooListingKind = 'spot' | 'perp';

/** Result of mapping internal / WOO symbol strings. */
export interface WooSymbolMappingResult {
  wooSymbol: string;
  compact: string;
  slash: string;
  base: string;
  quote: string;
  kind: WooListingKind;
}

/**
 * Row from GET /v3/public/instruments. WOO returns many numeric fields as strings.
 * @see https://api.woox.io/v3/public/instruments
 */
export type WooInstrument = Record<string, unknown> & {
  symbol: string;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
  baseTick?: string;
  quoteTick?: string;
  baseMin?: string;
  baseMax?: string;
  quoteMin?: string;
  quoteMax?: string;
  minNotional?: string;
};

/** Subset of instrument fields used for local validation. */
export interface WooInstrumentRules {
  symbol: string;
  baseTick: string | null;
  quoteTick: string | null;
  baseMin: string | null;
  baseMax: string | null;
  minNotional: string | null;
}
