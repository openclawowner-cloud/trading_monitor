const API_ORIGIN = (() => {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN != null
      ? String(import.meta.env.VITE_API_ORIGIN).replace(/\/$/, '')
      : '';
  if (raw) return raw;
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return 'http://localhost:3000';
  return '';
})();

const BASE = API_ORIGIN ? `${API_ORIGIN}/api/woo-real` : '/api/woo-real';

function fullUrl(path: string): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function wooRealRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(fullUrl(path), init);
  if (!res.ok) {
    throw new Error(`WOO Real API ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface WooRealCapabilities {
  enabled: boolean;
  paper_local: boolean;
  paper_exchange: boolean;
  spot: boolean;
  perps: boolean;
  signed_api_configured: boolean;
}

export interface WooRealSupervisorStatus {
  running: boolean;
  supervisorPid: number | null;
  updatedAt: number | null;
  lastError?: string | null;
}

export interface WooRealAgent {
  id: string;
  mode: 'paper_local' | 'paper_exchange';
  enabled: boolean;
  extra?: Record<string, unknown>;
}

export interface WooRealAgentListItem {
  agent: WooRealAgent;
  runtimeStatus: 'running' | 'stale' | 'offline' | 'unknown';
  modeAllowed: boolean;
}

export interface WooRealDashboardAgentRow {
  agentId: string;
  name: string;
  status: string;
  mode: string;
  enabled: boolean;
  pnl: number;
  equity: number;
  cash: number;
  openPositions: number;
  lastUpdate: string | null;
}

export interface WooRealBalanceRow {
  token: string;
  holding: string;
  frozenHolding: string;
  availableBalance: string;
  averageOpenPrice?: string;
  markPrice?: string;
}

export interface WooRealAgentDetail {
  agent: WooRealAgent;
  latestStatus: Record<string, unknown> | null;
  paperState: Record<string, unknown> | null;
  runtimeStatus: 'running' | 'stale' | 'offline' | 'unknown';
  modeAllowed: boolean;
}

export type WooRealCandleResponse = import('../types/api').CandleResponse & {
  venue?: string;
  wooSymbol?: string;
};

export const wooRealClient = {
  getCapabilities: () => wooRealRequest<WooRealCapabilities>('/capabilities'),
  getSupervisor: () => wooRealRequest<WooRealSupervisorStatus>('/supervisor'),
  startSupervisor: () => wooRealRequest<{ ok: boolean; message?: string }>('/supervisor/start', { method: 'POST' }),
  stopSupervisor: () => wooRealRequest<{ ok: boolean; message?: string }>('/supervisor/stop', { method: 'POST' }),
  getAgents: () => wooRealRequest<{ agents: WooRealAgentListItem[] }>('/agents'),
  restartAgent: (id: string) =>
    wooRealRequest<{ ok: boolean; message?: string }>(`/supervisor/restart/${encodeURIComponent(id)}`, {
      method: 'POST'
    }),
  setPaused: (id: string, paused: boolean) =>
    wooRealRequest<{ ok: boolean; paused: boolean }>(`/agent/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused })
    }),
  manualSell: (id: string) =>
    wooRealRequest<{ ok: boolean; manualSellQueued: boolean }>(`/agent/${encodeURIComponent(id)}/manual-sell`, {
      method: 'POST'
    }),
  getDashboardAgents: () => wooRealRequest<WooRealDashboardAgentRow[]>('/dashboard-agents'),
  getAgent: (id: string) => wooRealRequest<WooRealAgentDetail>(`/agent/${encodeURIComponent(id)}`),
  getBalances: (token?: string) =>
    wooRealRequest<{ ok: boolean; rows: WooRealBalanceRow[]; error?: string }>(
      token ? `/account/balances?token=${encodeURIComponent(token)}` : '/account/balances'
    ),
  getCandles: (symbol: string, interval: string, limit: number) => {
    const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
    return wooRealRequest<WooRealCandleResponse>(`/candles?${q.toString()}`);
  }
};
