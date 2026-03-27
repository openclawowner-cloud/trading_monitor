import crypto from 'crypto';
import { WOO_REAL_API_BASE } from '../config';

const USER_AGENT = 'TradingMonitor-WooRealSignedClient/1.0';

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function buildSignature(
  secret: string,
  ts: string,
  method: string,
  pathWithQuery: string,
  body: string
): string {
  const payload = `${ts}${method.toUpperCase()}${pathWithQuery}${body}`;
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export interface WooRealBalanceRow {
  token: string;
  holding: string;
  frozenHolding: string;
  availableBalance: string;
  averageOpenPrice?: string;
  markPrice?: string;
}

export class WooRealSignedClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly apiBase: string = WOO_REAL_API_BASE
  ) {}

  async getBalances(token?: string): Promise<{ ok: boolean; rows: WooRealBalanceRow[]; error?: string }> {
    const query = token && token.trim() ? `?token=${encodeURIComponent(token.trim().toUpperCase())}` : '';
    const pathWithQuery = `/v3/asset/balances${query}`;
    const ts = String(Date.now());
    const sig = buildSignature(this.apiSecret, ts, 'GET', pathWithQuery, '');
    const url = joinUrl(this.apiBase, pathWithQuery);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          'x-api-key': this.apiKey,
          'x-api-timestamp': ts,
          'x-api-signature': sig
        }
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !body || body.success !== true) {
        return { ok: false, rows: [], error: `WOO signed balances failed (${res.status})` };
      }
      const data = body.data;
      const holding = data && typeof data === 'object' ? (data as Record<string, unknown>).holding : null;
      if (!Array.isArray(holding)) return { ok: true, rows: [] };
      const rows: WooRealBalanceRow[] = [];
      for (const row of holding) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const r = row as Record<string, unknown>;
        const tokenVal = typeof r.token === 'string' ? r.token : '';
        if (!tokenVal) continue;
        rows.push({
          token: tokenVal,
          holding: String(r.holding ?? '0'),
          frozenHolding: String(r.frozenHolding ?? '0'),
          availableBalance: String(r.availableBalance ?? '0'),
          averageOpenPrice: r.averageOpenPrice != null ? String(r.averageOpenPrice) : undefined,
          markPrice: r.markPrice != null ? String(r.markPrice) : undefined
        });
      }
      return { ok: true, rows };
    } catch (e) {
      return { ok: false, rows: [], error: e instanceof Error ? e.message : 'request_failed' };
    }
  }
}

export function loadWooRealSignedClientFromEnv(): WooRealSignedClient | null {
  const key = (process.env.WOO_REAL_API_KEY || '').trim();
  const secret = (process.env.WOO_REAL_API_SECRET || '').trim();
  if (!key || !secret) return null;
  return new WooRealSignedClient(key, secret);
}
