import { TradeLike } from './types';
import { normPairKey } from './normalize';

const MIN_VALID_PRICE = 1e-8;

export function derivePositionFromTrades(trades: TradeLike[]): Record<string, number> {
  const positions: Record<string, number> = {};

  const sortedTrades = [...trades].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp as string | number).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp as string | number).getTime() : 0;
    return timeA - timeB;
  });

  for (const trade of sortedTrades) {
    if (trade.price === undefined || trade.price <= MIN_VALID_PRICE) continue;
    if (trade.qty === undefined || trade.qty <= 0) continue;

    const pairKey = normPairKey(trade.pair);
    if (!positions[pairKey]) {
      positions[pairKey] = 0;
    }

    if (trade.side === 'buy') {
      positions[pairKey] += trade.qty;
    } else if (trade.side === 'sell') {
      positions[pairKey] -= trade.qty;
    }
  }

  return positions;
}
