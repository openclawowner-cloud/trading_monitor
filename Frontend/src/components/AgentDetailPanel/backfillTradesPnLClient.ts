/**
 * Mirrors Backend/utils/backfillTradesPnL.ts so Trades tab shows PnL even when
 * the API body omits pnl (stale cache, proxy) or backfill failed server-side.
 */
function parseTimestamp(ts: unknown): number | null {
  if (ts === undefined || ts === null) return null;
  const n = Number(ts);
  return Number.isFinite(n) ? n : null;
}

export function backfillTradesPnLClient<T extends Record<string, unknown>>(trades: T[]): T[] {
  if (!Array.isArray(trades) || trades.length === 0) return [...trades];

  const copies = trades.map((t) => ({ ...t })) as Record<string, unknown>[];

  try {
    const order = copies.map((_, i) => i).sort((i, j) => {
      const ta = parseTimestamp(copies[i].timestamp);
      const tb = parseTimestamp(copies[j].timestamp);
      const aHas = ta !== null;
      const bHas = tb !== null;
      if (aHas && bHas) {
        if (ta !== tb) return ta - tb;
        return i - j;
      }
      if (aHas !== bHas) return aHas ? -1 : 1;
      return i - j;
    });

    const books = new Map<string, { qty: number; avgCost: number }>();

    for (const idx of order) {
      const o = copies[idx];
      const pair = String(o.pair ?? o.symbol ?? '');
      if (!pair) continue;

      const side = String(o.side ?? '').toLowerCase();
      const qty = Number(o.qty);
      const price = Number(o.price);
      const fee = o.fee != null && Number.isFinite(Number(o.fee)) ? Number(o.fee) : 0;

      if (!Number.isFinite(qty) || !Number.isFinite(price)) continue;

      let b = books.get(pair);
      if (!b) {
        b = { qty: 0, avgCost: 0 };
        books.set(pair, b);
      }

      if (side === 'buy') {
        if (o.pnl === undefined || o.pnl === null) {
          o.pnl = 0;
        }
        if (qty > 0) {
          if (b.qty <= 1e-12) {
            b.avgCost = price;
          } else {
            b.avgCost = (b.qty * b.avgCost + qty * price) / (b.qty + qty);
          }
          b.qty += qty;
        }
      } else if (side === 'sell') {
        if ((o.pnl === undefined || o.pnl === null) && qty > 0) {
          const avg = b.qty > 1e-12 ? b.avgCost : price;
          const pnl = (price - avg) * qty - fee;
          o.pnl = Math.round(pnl * 10000) / 10000;
        }
        if (qty > 0) {
          b.qty = Math.max(0, b.qty - qty);
          if (b.qty <= 1e-8) {
            b.qty = 0;
            b.avgCost = 0;
          }
        }
      }
    }
  } catch {
    return trades.map((t) => ({ ...t } as T));
  }

  return copies as T[];
}
