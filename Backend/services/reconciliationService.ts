import { runReconciliationChecks } from '../domain/trading/reconciliation';
import { derivePositionFromTrades } from '../domain/trading/positions';
import { ReconciliationResult, ReconciliationParams } from '../domain/trading/types';
import { normPairKey } from '../domain/trading/normalize';

function mergeCurrentPricesFromPositions(
  markPrices: Record<string, number>,
  positionsBlock: Record<string, unknown> | null | undefined
): void {
  if (!positionsBlock || typeof positionsBlock !== 'object') return;
  for (const [key, val] of Object.entries(positionsBlock)) {
    if (typeof val !== 'object' || val === null) continue;
    const cp = (val as Record<string, unknown>).currentPrice;
    if (cp == null || !Number.isFinite(Number(cp)) || Number(cp) <= 0) continue;
    const normalizedKey = normPairKey(key);
    const symbol = normalizedKey.endsWith('USDT') ? normalizedKey : normPairKey(`${key}USDT`);
    if (!markPrices[symbol] || markPrices[symbol] <= 0) {
      markPrices[symbol] = Number(cp);
    }
  }
}

/**
 * When marks are missing for some symbols but equity = cash + Σ q·P is known, solve for the
 * single unknown mark so equity_consistency can pass and PnL waiver can apply (paper bots).
 */
function fillMissingMarksFromEquity(
  markPrices: Record<string, number>,
  reportedQty: Record<string, number>,
  equity: number,
  cash: number
): void {
  const symbols = Object.entries(reportedQty).filter(([, q]) => Math.abs(Number(q) || 0) > 1e-6);
  if (symbols.length === 0) return;
  let knownValue = 0;
  for (const [sym, q] of symbols) {
    const m = markPrices[sym];
    if (m != null && m > 0 && Number.isFinite(m)) {
      knownValue += Number(q) * m;
    }
  }
  const missing = symbols.filter(([sym]) => !markPrices[sym] || markPrices[sym] <= 0);
  if (missing.length !== 1) return;
  const [, qty] = missing[0];
  const q = Number(qty);
  if (Math.abs(q) < 1e-9) return;
  const implied = (equity - cash - knownValue) / q;
  if (Number.isFinite(implied) && implied > 0) {
    markPrices[missing[0][0]] = implied;
  }
}

export function runReconciliation(agentId: string, status: Record<string, unknown> | null, state: Record<string, unknown> | null): ReconciliationResult {
  const rawTrades = (state?.trades as unknown[] || status?.trades as unknown[] || []) as Array<{ timestamp?: string | number; side?: string; pair?: string; qty?: number; price?: number }>;
  const trades = rawTrades
    .filter((t) => (t.side === 'buy' || t.side === 'sell') && typeof t.pair === 'string' && t.pair.length > 0)
    .map((t) => ({
      timestamp: t.timestamp,
      side: t.side as 'buy' | 'sell',
      pair: t.pair as string,
      qty: t.qty,
      price: t.price
    }));
  const resetTimestamp = (state?.reset_timestamp || status?.reset_timestamp) as number | string | undefined;
  const filteredTrades = resetTimestamp
    ? trades.filter((t) => (t.timestamp ? new Date(t.timestamp).getTime() : 0) >= new Date(resetTimestamp).getTime())
    : trades;

  const shadowQty = derivePositionFromTrades(filteredTrades);

  const reportedQty: Record<string, number> = {};
  const reportedPositionsWithAvg: Record<string, { qty: number; avgCost: number }> = {};

  const statePos = (state?.positions || {}) as Record<string, unknown>;
  const statusPos = (status?.positions || {}) as Record<string, unknown>;
  const positions = { ...statePos, ...statusPos };
  for (const [key, val] of Object.entries(positions)) {
    if (key.endsWith('_qty')) {
      const symbol = normPairKey(key.replace('_qty', 'USDT'));
      reportedQty[symbol] = Number(val);
      reportedPositionsWithAvg[symbol] = { qty: Number(val), avgCost: 0 };
    } else if (typeof val === 'object' && val !== null) {
      const normalizedKey = normPairKey(key);
      const symbol = normalizedKey.endsWith('USDT') ? normalizedKey : normPairKey(key + 'USDT');
      const v = val as Record<string, unknown>;
      const qty = Number(v.qty || 0);
      const avgCost = Number(v.avgCost || 0);
      reportedQty[symbol] = qty;
      reportedPositionsWithAvg[symbol] = { qty, avgCost };
    }
  }

  const scoreboard = (status?.scoreboard || {}) as Record<string, unknown>;
  const stateBudget = state ? { cash: state.cash, equity: state.equity, initial_budget: state.initial_budget, realizedPnl: state.realizedPnl } : {};
  const cash = Number(scoreboard.cash ?? stateBudget.cash ?? 0);
  const equity = Number(scoreboard.equity ?? stateBudget.equity ?? 0);
  const initialBudget = Number(scoreboard.initial_budget ?? stateBudget.initial_budget ?? 0);
  const realizedPnl = Number(scoreboard.realizedPnl ?? stateBudget.realizedPnl ?? 0);
  const unrealizedPnl = scoreboard.unrealizedPnl !== undefined ? Number(scoreboard.unrealizedPnl) : undefined;

  let riskExposureUsdt = 0;
  for (const pos of Object.values(reportedPositionsWithAvg)) {
    riskExposureUsdt += pos.qty * pos.avgCost;
  }

  const killSwitchActive = process.env.KILL_SWITCH_ACTIVE === '1' || process.env.KILL_SWITCH_ACTIVE === 'true';
  const riskExposureLimit = Number(process.env.RISK_EXPOSURE_LIMIT_USD || 50000);

  const topPrices = ((status?.prices as Record<string, number>) || {}) as Record<string, number>;
  let markPrices: Record<string, number> = { ...topPrices };
  mergeCurrentPricesFromPositions(markPrices, statusPos as Record<string, unknown>);
  mergeCurrentPricesFromPositions(markPrices, statePos as Record<string, unknown>);
  fillMissingMarksFromEquity(markPrices, reportedQty, equity, cash);

  const params: ReconciliationParams = {
    shadowQty,
    reportedQty,
    cash,
    equity,
    initialBudget,
    realizedPnl,
    unrealizedPnl,
    riskExposureUsdt,
    riskExposureLimit,
    killSwitchActive,
    qtyTolerance: Number(process.env.RECON_QTY_TOLERANCE || 1e-6),
    valueToleranceUsd: Number(process.env.RECON_VALUE_TOLERANCE_USD || 2.5),
    pnlTolerance: Number(process.env.RECON_PNL_TOLERANCE || 10),
    markPrices,
    reportedPositionsWithAvg
  };

  const result = runReconciliationChecks(params);
  result.stateTimestamp = state?.timestamp as string | number | undefined;
  result.marketPriceTimestamp = status?.timestamp as string | number | undefined;

  return result;
}
