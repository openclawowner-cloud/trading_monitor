/**
 * Read-only public WOO X V3 REST. No signed headers.
 * Endpoint shape verified against production: GET /v3/public/instruments[?symbol=SPOT_*]
 */
import { WOOX_API_BASE } from '../config';
import type { WooInstrument } from '../types';

const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = 'TradingMonitor-WooXRestClient/1.0';

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function parseInstrumentsPayload(data: unknown): WooInstrument[] {
  if (data === null || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const inner = root.data;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return [];
  const rows = (inner as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) return [];
  const out: WooInstrument[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const symbol = o.symbol;
    if (typeof symbol !== 'string' || !symbol.trim()) continue;
    out.push(o as unknown as WooInstrument);
  }
  return out;
}

export interface WooXGetInstrumentsResult {
  ok: boolean;
  rows: WooInstrument[];
  timestamp?: number;
  error?: string;
}

export class WooXRestClient {
  constructor(
    private readonly baseUrl: string = WOOX_API_BASE,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  /**
   * GET /v3/public/instruments — optional symbol filter (WOO symbol e.g. SPOT_BTC_USDT).
   */
  async getInstruments(params?: { symbol?: string }): Promise<WooXGetInstrumentsResult> {
    const q = new URLSearchParams();
    if (params?.symbol?.trim()) q.set('symbol', params.symbol.trim());
    const query = q.toString();
    const path = `/v3/public/instruments${query ? `?${query}` : ''}`;
    const url = joinUrl(this.baseUrl, path);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
      });
      if (!res.ok) {
        return { ok: false, rows: [], error: `HTTP ${res.status}` };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, rows: [], error: 'Invalid JSON' };
      }
      if (body === null || typeof body !== 'object') {
        return { ok: false, rows: [], error: 'Unexpected body' };
      }
      const b = body as Record<string, unknown>;
      if (b.success === false) {
        return { ok: false, rows: [], error: 'API success=false' };
      }
      const ts = b.timestamp;
      const rows = parseInstrumentsPayload(body);
      return {
        ok: true,
        rows,
        timestamp: typeof ts === 'number' ? ts : undefined
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'fetch failed';
      return { ok: false, rows: [], error: msg };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Shared instance for woox routes (stateless). */
export const defaultWooXRestClient = new WooXRestClient();
