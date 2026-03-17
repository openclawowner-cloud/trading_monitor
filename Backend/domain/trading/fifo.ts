import { TradeLike, ClosedTrade, OpenPosition } from './types';
import { normPairKey } from './normalize';

export function deriveClosedTrades(trades: TradeLike[]): ClosedTrade[] {
  return [];
}

export function deriveOpenPositions(trades: TradeLike[]): OpenPosition[] {
  return [];
}
