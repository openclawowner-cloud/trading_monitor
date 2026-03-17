export interface TradeLike {
  id?: string;
  timestamp?: string | number;
  side: 'buy' | 'sell';
  pair: string;
  qty?: number;
  price?: number;
}

export interface ClosedTrade {
  id: string;
  timestamp: string | number;
  pair: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnl: number;
}

export interface OpenPosition {
  pair: string;
  pairKey: string;
  qty: number;
  costBasis: number;
}

export interface ReconCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface MismatchDetail {
  symbol: string;
  fills_qty: number;
  reported_qty: number;
  diff_usd?: number;
  last_fill_id?: string;
  last_fill_timestamp?: string | number;
}

export interface ReconciliationResult {
  positionOk: boolean;
  cashOk: boolean;
  pnlOk: boolean;
  checks: ReconCheck[];
  stateTimestamp?: string | number;
  marketPriceTimestamp?: string | number;
  mismatchDetails?: MismatchDetail[];
}

export interface ReconciliationParams {
  shadowQty: Record<string, number>;
  reportedQty: Record<string, number>;
  cash: number;
  equity: number;
  initialBudget: number;
  realizedPnl: number;
  unrealizedPnl?: number;
  riskExposureUsdt: number;
  riskExposureLimit: number;
  killSwitchActive: boolean;
  qtyTolerance: number;
  valueToleranceUsd: number;
  pnlTolerance: number;
  markPrices: Record<string, number>;
  reportedPositionsWithAvg: Record<string, { qty: number; avgCost: number }>;
}
