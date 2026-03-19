/** Allowed Binance spot kline intervals for the chart API. */
export const CHART_INTERVALS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d'] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

const SYMBOL_RE = /^[A-Z0-9]{6,24}$/;
const BINANCE_KLINES = 'https://api.binance.com/api/v3/klines';

/** Bollinger: period 20, 2σ on close (matches common SMA20 band). */
const BB_PERIOD = 20;
const BB_STDDEV_MULT = 2;

export interface CandleDto {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPointDto {
  time: number;
  value: number;
}

export interface ChartIndicatorsDto {
  sma20: IndicatorPointDto[];
  ma50: IndicatorPointDto[];
  ma100: IndicatorPointDto[];
  bbUpper: IndicatorPointDto[];
  bbLower: IndicatorPointDto[];
}

/** Simple moving average at index `i` (inclusive window of `period` closes ending at i). */
export function smaAt(closes: readonly number[], i: number, period: number): number | null {
  if (i < period - 1 || period < 1) return null;
  let s = 0;
  for (let j = 0; j < period; j++) {
    const v = closes[i - j];
    if (!Number.isFinite(v)) return null;
    s += v!;
  }
  return s / period;
}

/** Population standard deviation of `period` closes ending at i, given precomputed mean. */
export function stdDevPopAt(closes: readonly number[], i: number, period: number, mean: number): number {
  let v = 0;
  for (let j = 0; j < period; j++) {
    const d = closes[i - j]! - mean;
    v += d * d;
  }
  return Math.sqrt(v / period);
}

export function computeChartIndicators(candles: CandleDto[]): ChartIndicatorsDto {
  const empty: ChartIndicatorsDto = {
    sma20: [],
    ma50: [],
    ma100: [],
    bbUpper: [],
    bbLower: []
  };
  if (!candles.length) return empty;

  const closes = candles.map((c) => c.close);
  const times = candles.map((c) => c.time);
  const n = candles.length;

  const sma20: IndicatorPointDto[] = [];
  const ma50: IndicatorPointDto[] = [];
  const ma100: IndicatorPointDto[] = [];
  const bbUpper: IndicatorPointDto[] = [];
  const bbLower: IndicatorPointDto[] = [];

  for (let i = 0; i < n; i++) {
    const t = times[i]!;
    const m20 = smaAt(closes, i, 20);
    if (m20 != null) {
      sma20.push({ time: t, value: m20 });
    }
    if (i >= BB_PERIOD - 1 && m20 != null) {
      const sd = stdDevPopAt(closes, i, BB_PERIOD, m20);
      bbUpper.push({ time: t, value: m20 + BB_STDDEV_MULT * sd });
      bbLower.push({ time: t, value: m20 - BB_STDDEV_MULT * sd });
    }
    const m50 = smaAt(closes, i, 50);
    if (m50 != null) ma50.push({ time: t, value: m50 });
    const m100 = smaAt(closes, i, 100);
    if (m100 != null) ma100.push({ time: t, value: m100 });
  }

  return { sma20, ma50, ma100, bbUpper, bbLower };
}

export function validateCandlesQuery(symbol: string, interval: string, limitRaw: string | undefined): {
  ok: true;
  symbol: string;
  interval: ChartInterval;
  limit: number;
} | { ok: false; error: string; status: number } {
  const sym = String(symbol || '')
    .trim()
    .toUpperCase();
  if (!sym || !SYMBOL_RE.test(sym)) {
    return { ok: false, error: 'Invalid symbol (use format like NEARUSDT)', status: 400 };
  }
  const iv = String(interval || '').trim();
  if (!CHART_INTERVALS.includes(iv as ChartInterval)) {
    return {
      ok: false,
      error: `Invalid interval. Allowed: ${CHART_INTERVALS.join(', ')}`,
      status: 400
    };
  }
  let limit = limitRaw != null && limitRaw !== '' ? parseInt(limitRaw, 10) : 300;
  if (!Number.isFinite(limit) || limit < 1) limit = 300;
  if (limit > 1000) limit = 1000;
  return { ok: true, symbol: sym, interval: iv as ChartInterval, limit };
}

export async function fetchBinanceCandles(
  symbol: string,
  interval: ChartInterval,
  limit: number
): Promise<CandleDto[]> {
  const url = `${BINANCE_KLINES}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Binance ${res.status}: ${text.slice(0, 200)}`);
  }
  const raw = (await res.json()) as unknown[];
  if (!Array.isArray(raw)) {
    throw new Error('Unexpected Binance response');
  }
  const candles: CandleDto[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const t = Number(row[0]);
    if (!Number.isFinite(t)) continue;
    candles.push({
      time: Math.floor(t / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5])
    });
  }
  return candles;
}
