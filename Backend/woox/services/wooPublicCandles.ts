/**
 * Public WOO X klines for chart UI (same endpoint as Python agents).
 * GET /v3/public/kline?symbol=SPOT_*&type=1m|5m|...&limit=n
 */
import { WOOX_API_BASE } from '../config';
import type { CandleDto } from '../../services/candlesService';

const USER_AGENT = 'TradingMonitor-WooPublicCandles/1.0';

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export async function fetchWooPublicCandles(
  wooSymbol: string,
  interval: string,
  limit: number
): Promise<CandleDto[]> {
  const q = new URLSearchParams({
    symbol: wooSymbol.trim(),
    type: interval.trim(),
    limit: String(limit)
  });
  const url = joinUrl(WOOX_API_BASE, `/v3/public/kline?${q.toString()}`);
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WOO ${res.status}: ${text.slice(0, 200)}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('WOO kline: invalid JSON');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('WOO kline: unexpected body');
  }
  const root = body as Record<string, unknown>;
  if (root.success !== true) {
    throw new Error('WOO kline: success=false');
  }
  const data = root.data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return [];
  }
  const rows = (data as Record<string, unknown>).rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const ordered = [...rows].reverse();
  const candles: CandleDto[] = [];
  for (const r of ordered) {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) continue;
    const row = r as Record<string, unknown>;
    const tsRaw = Number(row.startTimestamp);
    if (!Number.isFinite(tsRaw)) continue;
    const timeSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : Math.floor(tsRaw);
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    const volume = Number(row.volume ?? 0);
    if (![open, high, low, close].every((x) => Number.isFinite(x))) continue;
    candles.push({
      time: timeSec,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0
    });
  }
  return candles;
}
