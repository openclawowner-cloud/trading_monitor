import { BYBIT_API_BASE } from '../config';
import type { CandleDto } from '../../services/candlesService';

function intervalToBybit(interval: string): string {
  if (interval === '1m') return '1';
  if (interval === '3m') return '3';
  if (interval === '5m') return '5';
  if (interval === '15m') return '15';
  if (interval === '1h') return '60';
  if (interval === '4h') return '240';
  if (interval === '1d') return 'D';
  return '5';
}

export async function fetchBybitPublicCandles(
  symbol: string,
  interval: string,
  limit: number
): Promise<CandleDto[]> {
  const q = new URLSearchParams({
    category: 'spot',
    symbol: symbol.trim().toUpperCase(),
    interval: intervalToBybit(interval),
    limit: String(limit)
  });
  const url = `${BYBIT_API_BASE}/v5/market/kline?${q.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bybit ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Number(body.retCode) !== 0) throw new Error('Bybit kline: error');
  const result = body.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  const list = (result as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  const rows = [...list].reverse();
  const candles: CandleDto[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const tMs = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    if (![tMs, open, high, low, close].every((v) => Number.isFinite(v))) continue;
    candles.push({
      time: Math.floor(tMs / 1000),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0
    });
  }
  return candles;
}
