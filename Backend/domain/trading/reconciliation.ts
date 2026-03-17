import { ReconCheck, ReconciliationResult, ReconciliationParams, MismatchDetail } from './types';

export function runReconciliationChecks(params: ReconciliationParams): ReconciliationResult {
  const checks: ReconCheck[] = [];
  const mismatchDetails: MismatchDetail[] = [];
  let positionOk = true;
  let cashOk = true;
  let pnlOk = true;

  const allSymbols = new Set([...Object.keys(params.shadowQty), ...Object.keys(params.reportedQty)]);
  for (const symbol of allSymbols) {
    const shadow = params.shadowQty[symbol] || 0;
    const reported = params.reportedQty[symbol] || 0;
    const diff = Math.abs(shadow - reported);

    let ok = diff <= params.qtyTolerance;
    let diffUsd = 0;

    if (!ok && params.markPrices[symbol]) {
      diffUsd = diff * params.markPrices[symbol];
      if (diffUsd < params.valueToleranceUsd) {
        ok = true;
      }
    }

    if (!ok) {
      positionOk = false;
      mismatchDetails.push({
        symbol,
        fills_qty: shadow,
        reported_qty: reported,
        diff_usd: diffUsd
      });
    }

    checks.push({
      name: `position_qty_${symbol}`,
      ok,
      detail: `Shadow: ${shadow}, Reported: ${reported}, Diff: ${diff}`
    });

    if (reported === 0) {
      const avgCost = params.reportedPositionsWithAvg[symbol]?.avgCost || 0;
      const closeOk = avgCost === 0;
      checks.push({
        name: `symbol_close_invariant_${symbol}`,
        ok: closeOk,
        detail: `Reported qty 0, avgCost: ${avgCost}`
      });
      if (!closeOk) positionOk = false;
    }
  }

  const expectedTotalPnl = params.equity - params.initialBudget;
  const totalPnl = params.realizedPnl + (params.unrealizedPnl ?? 0);
  const pnlDiff = Math.abs(totalPnl - expectedTotalPnl);
  const pnlTotalOk = pnlDiff <= params.pnlTolerance && params.equity > 0;
  checks.push({
    name: 'pnl_total',
    ok: pnlTotalOk,
    detail: `Total PnL: ${totalPnl}, Expected: ${expectedTotalPnl}, Diff: ${pnlDiff}`
  });
  if (!pnlTotalOk) pnlOk = false;

  if (Object.keys(params.markPrices).length > 0) {
    let marketValue = 0;
    for (const [symbol, qty] of Object.entries(params.reportedQty)) {
      marketValue += qty * (params.markPrices[symbol] || 0);
    }
    const expectedEquity = params.cash + marketValue;
    const equityDiff = Math.abs(params.equity - expectedEquity);
    const equityOk = equityDiff <= params.valueToleranceUsd;
    checks.push({
      name: 'equity_consistency',
      ok: equityOk,
      detail: `Equity: ${params.equity}, Expected: ${expectedEquity}, Diff: ${equityDiff}`
    });
    if (!equityOk) pnlOk = false;
  }

  if (params.unrealizedPnl !== undefined) {
    const totalPnl = params.realizedPnl + params.unrealizedPnl;
    const expectedTotal = params.equity - params.initialBudget;
    const splitDiff = Math.abs(totalPnl - expectedTotal);
    const splitOk = splitDiff <= params.pnlTolerance;
    checks.push({
      name: 'pnl_split_consistency',
      ok: splitOk,
      detail: `Total PnL: ${totalPnl}, Expected: ${expectedTotal}, Diff: ${splitDiff}`
    });
    if (!splitOk) pnlOk = false;
  }

  const cashCheckOk = params.cash >= -0.01;
  checks.push({
    name: 'cash',
    ok: cashCheckOk,
    detail: `Cash: ${params.cash}`
  });
  if (!cashCheckOk) cashOk = false;

  const riskOk = params.riskExposureUsdt <= params.riskExposureLimit;
  checks.push({
    name: 'risk_exposure',
    ok: riskOk,
    detail: `Exposure: ${params.riskExposureUsdt}, Limit: ${params.riskExposureLimit}`
  });
  if (!riskOk) positionOk = false;

  if (params.killSwitchActive) {
    checks.push({
      name: 'kill_switch',
      ok: false,
      detail: 'Kill switch is active'
    });
    positionOk = false;
  }

  return {
    positionOk,
    cashOk,
    pnlOk,
    checks,
    mismatchDetails: mismatchDetails.length > 0 ? mismatchDetails : undefined
  };
}
