const API_ORIGIN = (() => {
  const raw = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN != null
    ? String(import.meta.env.VITE_API_ORIGIN).replace(/\/$/, '')
    : '';
  if (raw) return raw;
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return 'http://localhost:3000';
  return '';
})();
const BASE = API_ORIGIN ? `${API_ORIGIN}/api/woox` : '/api/woox';

function fullUrl(path: string): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export class WooxApiError extends Error {
  status: number;
  url: string;
  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'WooxApiError';
    this.status = status;
    this.url = url;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = fullUrl(path);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    throw new WooxApiError(`WOO API network error: ${msg}`, 0, url);
  }
  if (!res.ok) {
    throw new WooxApiError(`WOO API ${res.status}: ${url}`, res.status, url);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new WooxApiError(`WOO API invalid JSON: ${url}`, res.status, url);
  }
}

export interface WooxCapabilities {
  paper_local: boolean;
  paper_exchange: boolean;
  spot: boolean;
  perps: boolean;
  signed_api_configured: boolean;
}

export interface WooxAgent {
  id: string;
  mode: 'paper_local' | 'paper_exchange';
  enabled: boolean;
  extra?: Record<string, unknown>;
}

export interface WooxAgentListItem {
  agent: WooxAgent;
  runtimeStatus: 'running' | 'stale' | 'offline' | 'unknown';
  modeAllowed: boolean;
}

export interface WooxSupervisorStatus {
  running: boolean;
  supervisorPid: number | null;
  updatedAt: number | null;
  lastError?: string | null;
}

export interface WooxAgentDetail {
  agent: WooxAgent;
  latestStatus: Record<string, unknown> | null;
  paperState: Record<string, unknown> | null;
  runtimeStatus: 'running' | 'stale' | 'offline' | 'unknown';
  modeAllowed: boolean;
}

export interface WooxInstrumentDebug {
  ok: boolean;
  error?: string;
  mapping?: Record<string, unknown>;
  instrument?: Record<string, unknown>;
  rules?: Record<string, unknown>;
}

export type WooxCandleResponse = import('../types/api').CandleResponse & {
  venue?: string;
  wooSymbol?: string;
};

export interface WooxDashboardAgentDetail {
  agent: {
    agentId: string;
    name: string;
    enabled: boolean;
    status: string;
  };
  summary: {
    cash: number;
    equity: number;
    realizedPnl: number;
    unrealizedPnl: number;
    pnl: number;
    openPositions: number;
  };
  metrics: {
    tradeCount: number;
    winCount: number;
    lossCount: number;
    winRate: string;
    avgWin: string;
    avgLoss: string;
  };
  trades: Array<{
    side: 'buy' | 'sell';
    price: string;
    qty: string;
    fee: string;
    timestamp: number;
    realizedPnl?: string;
  }>;
}

export const wooxClient = {
  getCapabilities: () => request<WooxCapabilities>('/capabilities'),
  getAgents: () => request<{ agents: WooxAgentListItem[] }>('/agents'),
  getAgent: (id: string) => request<WooxAgentDetail>(`/agent/${encodeURIComponent(id)}`),
  getSupervisor: () => request<WooxSupervisorStatus>('/supervisor'),
  startSupervisor: () => request<{ ok: boolean; message?: string }>('/supervisor/start', { method: 'POST' }),
  stopSupervisor: () => request<{ ok: boolean; message?: string }>('/supervisor/stop', { method: 'POST' }),
  restartAgent: (id: string) =>
    request<{ ok: boolean; message?: string; agentId?: string }>(`/supervisor/restart/${encodeURIComponent(id)}`, {
      method: 'POST'
    }),
  setPaused: (id: string, paused: boolean) =>
    request<{ ok: boolean; paused: boolean }>(`/agent/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused })
    }),
  manualSell: (id: string) =>
    request<{ ok: boolean; manualSellQueued: boolean }>(`/agent/${encodeURIComponent(id)}/manual-sell`, {
      method: 'POST'
    }),
  getInstrument: (symbol: string) => request<WooxInstrumentDebug>(`/instrument/${encodeURIComponent(symbol)}`),
  getDashboardAgent: (id: string) =>
    request<WooxDashboardAgentDetail>(`/dashboard-agent/${encodeURIComponent(id)}`, { cache: 'no-store' }),
  /** WOO public kline — same CandleResponse shape as Binance chart API. */
  getCandles: async (symbol: string, interval: string, limit: number) => {
    const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
    const url = fullUrl(`/candles?${q.toString()}`);
    let res: Response;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      throw new WooxApiError(`WOO candles network error: ${msg}`, 0, url);
    }
    if (!res.ok) {
      let detail = `WOO API ${res.status}: ${url}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (typeof j?.error === 'string' && j.error.trim()) detail = j.error.trim();
      } catch {
        /* ignore */
      }
      throw new WooxApiError(detail, res.status, url);
    }
    return (await res.json()) as WooxCandleResponse;
  }
};
