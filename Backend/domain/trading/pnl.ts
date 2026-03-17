import { OpenPosition } from './types';

export function computeMarketValue(positions: OpenPosition[], markPrices: Record<string, number>): number {
  let total = 0;
  for (const pos of positions) {
    const price = markPrices[pos.pairKey] || 0;
    total += pos.qty * price;
  }
  return total;
}

export function computeUnrealizedPnl(positions: OpenPosition[], markPrices: Record<string, number>): number {
  let totalPnl = 0;
  for (const pos of positions) {
    const price = markPrices[pos.pairKey] || 0;
    if (price > 0) {
      totalPnl += (price - pos.costBasis) * pos.qty;
    }
  }
  return totalPnl;
}
