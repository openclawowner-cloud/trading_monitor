import type { Request, Response } from 'express';
import { computeChartIndicators, validateCandlesQuery } from '../../services/candlesService';
import { toWooSpotSymbol } from '../symbol/mapWooxSymbol';
import { fetchWooPublicCandles } from '../services/wooPublicCandles';

/** GET /api/woox/candles — also mounted on app in server.ts so it cannot be shadowed. */
export async function handleWooxCandlesGet(req: Request, res: Response): Promise<void> {
  const q = validateCandlesQuery(
    String(req.query.symbol ?? ''),
    String(req.query.interval ?? '1m'),
    req.query.limit != null ? String(req.query.limit) : undefined
  );
  if (q.ok === false) {
    res.status(q.status).json({ error: q.error });
    return;
  }
  const mapping = toWooSpotSymbol(q.symbol);
  if (!mapping) {
    res.status(400).json({ error: 'Unrecognized symbol for WOO spot chart (e.g. BTCUSDT)' });
    return;
  }
  try {
    const candles = await fetchWooPublicCandles(mapping.wooSymbol, q.interval, q.limit);
    const indicators = computeChartIndicators(candles);
    res.set('Cache-Control', 'private, max-age=10');
    res.json({
      symbol: q.symbol,
      interval: q.interval,
      candles,
      indicators,
      venue: 'woox',
      wooSymbol: mapping.wooSymbol
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch WOO candles';
    res.status(502).json({ error: msg });
  }
}
