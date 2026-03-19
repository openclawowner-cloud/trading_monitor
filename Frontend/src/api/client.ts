/** API base URL: same-origin /api, or absolute origin when VITE_API_ORIGIN is set. In dev we default to 3000 so Chart works when frontend runs on another port. */
const API_ORIGIN = (() => {
  const raw = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN != null
    ? String(import.meta.env.VITE_API_ORIGIN).replace(/\/$/, '')
    : '';
  if (raw) return raw;
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return 'http://localhost:3000';
  return '';
})();
const BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

function fullUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}

async function get<T>(path: string): Promise<T> {
  const url = fullUrl(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

/** Agent detail must not use a stale HTTP cache body (trades PnL is computed per request). */
async function getAgentDetail<T>(path: string): Promise<T> {
  const url = fullUrl(path);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const url = fullUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const msg = res.status === 404
      ? `API 404: ${url}. Start de app met "npm run dev" op dezelfde poort.`
      : `API ${res.status}: ${url}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getConfig: () => get<import('../types/api').ConfigResponse>('/config'),
  getAgents: () => get<import('../types/api').AgentListItem[]>('/trading/live/agents'),
  getAgent: (agentId: string) =>
    getAgentDetail<import('../types/api').AgentDetailResponse>(`/trading/live/agent/${agentId}`),
  getReconciliation: (agentId: string) => get<import('../types/api').ReconciliationResult>(`/trading/live/agent/${agentId}/reconciliation`),
  postHeartbeat: (agentId: string, payload?: Record<string, unknown>) => post<{ ok: boolean }>(`/trading/live/agent/${agentId}/heartbeat`, payload),
  postEnable: (agentId: string) => post<{ ok: boolean }>(`/trading/live/agent/${agentId}/enable`),
  postDisable: (agentId: string) => post<{ ok: boolean }>(`/trading/live/agent/${agentId}/disable`),
  postReset: (agentId: string) => post<{ ok: boolean }>(`/trading/live/agent/${agentId}/reset`),
  postValidate: (agentId: string) => post<{ ok: boolean; validation: { reconciliation: import('../types/api').ReconciliationResult } }>(`/trading/live/agent/${agentId}/validate`),
  postArchive: (agentId: string) => post<{ ok: boolean }>(`/trading/live/agent/${agentId}/archive`),
  getSupervisorStatus: () => get<import('../types/api').SupervisorStatus>('/trading/live/supervisor/status'),
  postSupervisorStart: () => post<{ ok: boolean; message?: string }>('/trading/live/supervisor/start'),
  postSupervisorStop: () => post<{ ok: boolean }>('/trading/live/supervisor/stop'),
  postSupervisorRestart: (agentId: string) => post<{ ok: boolean; agentId: string }>(`/trading/live/supervisor/restart/${agentId}`),
  getAgentCandles: (agentId: string, symbol: string, interval: string, limit: number) => {
    const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
    return get<import('../types/api').CandleResponse>(
      `/trading/live/agent/${encodeURIComponent(agentId)}/candles?${q.toString()}`
    );
  }
};
