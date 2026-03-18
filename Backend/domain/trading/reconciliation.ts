import { ReconCheck, ReconciliationResult, ReconciliationParams, MismatchDetail } from './types';

export function runReconciliationChecks(params: ReconciliationParams): ReconciliationResult {
  const checks: ReconCheck[] = [];
  const mismatchDetails: MismatchDetail[] = [];
  let positionOk = true;
  let cashOk = true;
  let pnlOk = true;
  /** True when equity matches cash + position marks (status is internally consistent). */
  let equityReconciles = false;

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

  const hasOpenPosition = Object.values(params.reportedQty).some((q) => Math.abs(Number(q) || 0) > 1e-6);

  if (Object.keys(params.markPrices).length > 0) {
    let marketValue = 0;
    for (const [symbol, qty] of Object.entries(params.reportedQty)) {
      marketValue += qty * (params.markPrices[symbol] || 0);
    }
    const expectedEquity = params.cash + marketValue;
    const equityDiff = Math.abs(params.equity - expectedEquity);
    const equityOk = equityDiff <= params.valueToleranceUsd;
    equityReconciles = equityOk;
    checks.push({
      name: 'equity_consistency',
      ok: equityOk,
      detail: `Equity: ${params.equity}, Expected: ${expectedEquity}, Diff: ${equityDiff}`
    });
    if (!equityOk) pnlOk = false;
  } else if (!hasOpenPosition) {
    /**
     * Paper agents often omit `prices` when flat. Without marks we cannot rebuild equity from marks,
     * but equity should equal cash — enough to allow PnL-split waiver for fee-basis mismatch.
     */
    const equityDiff = Math.abs(params.equity - params.cash);
    const flatOk = equityDiff <= params.valueToleranceUsd;
    equityReconciles = flatOk;
    checks.push({
      name: 'equity_flat_cash',
      ok: flatOk,
      detail: `Flat book (no marks): equity ${params.equity}, cash ${params.cash}, diff ${equityDiff}`
    });
    if (!flatOk) pnlOk = false;
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

  /**
   * Paper agents (e.g. Cryptocoiner) often compute avgCost without buy-side fees in the basis,
   * while fees reduce cash. Then realizedPnl + unrealizedPnl != equity - initial_budget even when
   * positions match the trade tape and equity equals cash + mark value. If shadow positions and
   * equity consistency pass, treat PnL split as non-blocking.
   */
  if (positionOk && cashOk && equityReconciles && !pnlOk) {
    pnlOk = true;
    checks.push({
      name: 'pnl_split_waiver',
      ok: true,
      detail:
        'Equity ties to cash+marks and positions match fills; PnL ledger split may omit buy-fee basis (expected for some paper bots).'
    });
  }

  return {
    positionOk,
    cashOk,
    pnlOk,
    checks,
    mismatchDetails: mismatchDetails.length > 0 ? mismatchDetails : undefined
  };
}
