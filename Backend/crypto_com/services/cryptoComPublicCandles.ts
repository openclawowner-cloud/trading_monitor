import { CRYPTO_COM_API_BASE } from '../config';
import type { CandleDto } from '../../services/candlesService';

function intervalToCryptoCom(interval: string): string {
  const iv = interval.trim().toLowerCase();
  if (iv === '1m') return '1m';
  if (iv === '5m') return '5m';
  if (iv === '15m') return '15m';
  if (iv === '30m') return '30m';
  if (iv === '1h') return '1h';
  if (iv === '4h') return '4h';
  if (iv === '1d') return '1D';
  return '5m';
}

function normalizeInstrument(symbol: string): string {
  const raw = symbol.trim().toUpperCase();
  if (raw.includes('_')) return raw;
  const knownQuotes = ['USDT', 'USDC', 'USD', 'EUR', 'BTC', 'ETH'];
  for (const quote of knownQuotes) {
    if (raw.endsWith(quote) && raw.length > quote.length) {
      return `${raw.slice(0, -quote.length)}_${quote}`;
    }
  }
  return raw;
}

export async function fetchCryptoComPublicCandles(
  symbol: string,
  interval: string,
  limit: number
): Promise<CandleDto[]> {
  const q = new URLSearchParams({
    instrument_name: normalizeInstrument(symbol),
    timeframe: intervalToCryptoCom(interval)
  });
  const url = `${CRYPTO_COM_API_BASE}/v2/public/get-candlestick?${q.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Crypto.com ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Number(body.code) !== 0) throw new Error('Crypto.com candlestick: error');
  const result = body.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  const data = (result as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];
  const rows = data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .slice(Math.max(0, data.length - limit));

  const candles: CandleDto[] = [];
  for (const row of rows) {
    const tMs = Number(row.t);
    const open = Number(row.o);
    const high = Number(row.h);
    const low = Number(row.l);
    const close = Number(row.c);
    const volume = Number(row.v);
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
