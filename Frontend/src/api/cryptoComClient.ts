const API_ORIGIN = (() => {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN != null
      ? String(import.meta.env.VITE_API_ORIGIN).replace(/\/$/, '')
      : '';
  if (raw) return raw;
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return 'http://localhost:3000';
  return '';
})();
const BASE = API_ORIGIN ? `${API_ORIGIN}/api/crypto-com` : '/api/crypto-com';

function fullUrl(path: string): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(fullUrl(path), init);
  if (!res.ok) throw new Error(`Crypto.com API ${res.status}`);
  return (await res.json()) as T;
}

export interface CryptoComAgent {
  id: string;
  mode: 'paper_local' | 'paper_exchange';
  enabled: boolean;
  extra?: Record<string, unknown>;
}
export interface CryptoComAgentDetail {
  agent: CryptoComAgent;
  latestStatus: Record<string, unknown> | null;
  paperState: Record<string, unknown> | null;
  runtimeStatus: 'running' | 'stale' | 'offline' | 'unknown';
  modeAllowed: boolean;
}
export type CryptoComCandleResponse = import('../types/api').CandleResponse & { venue?: string };

export const cryptoComClient = {
  getAgent: (id: string) => request<CryptoComAgentDetail>(`/agent/${encodeURIComponent(id)}`),
  restartAgent: (id: string) =>
    request<{ ok: boolean; message?: string }>(`/supervisor/restart/${encodeURIComponent(id)}`, {
      method: 'POST'
    }),
  setPaused: (id: string, paused: boolean) =>
    request<{ ok: boolean; paused: boolean }>(`/agent/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused })
    }),
  manualSell: (id: string) =>
    request<{ ok: boolean; manualSellQueued: boolean }>(
      `/agent/${encodeURIComponent(id)}/manual-sell`,
      { method: 'POST' }
    ),
  getCandles: (symbol: string, interval: string, limit: number) => {
    const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
    return request<CryptoComCandleResponse>(`/candles?${q.toString()}`);
  }
};
