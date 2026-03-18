const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

/** Agent detail must not use a stale HTTP cache body (trades PnL is computed per request). */
async function getAgentDetail<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const msg = res.status === 404
      ? `API 404: ${path}. Start de app met "npm run dev" op dezelfde poort.`
      : `API ${res.status}: ${path}`;
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
  postSupervisorRestart: (agentId: string) => post<{ ok: boolean; agentId: string }>(`/trading/live/supervisor/restart/${agentId}`)
};
