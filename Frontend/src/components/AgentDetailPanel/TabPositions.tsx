import React from 'react';
import type { AgentDetailResponse } from '../../types/api';
import { formatNumber, formatPrice, formatCurrency, formatPercent } from '../../utils/format';

interface TabPositionsProps {
  detail: AgentDetailResponse;
}

interface PositionRow {
  pair: string;
  side: string;
  qty: number;
  entry: number;
  price: number;
  value: number;
  pnl: number;
  pnlPct: number;
  exposurePct: number;
}

function buildRows(detail: AgentDetailResponse): PositionRow[] {
  const status = detail.status as Record<string, unknown> | null;
  const state = detail.state as Record<string, unknown> | null;
  const positions = (status?.positions ?? state?.positions ?? {}) as Record<string, unknown>;
  const prices = (status?.prices ?? {}) as Record<string, number>;
  const scoreboard = (status?.scoreboard ?? state) as Record<string, unknown> | undefined;
  const equity = Number(scoreboard?.equity ?? 0);
  const rows: PositionRow[] = [];

  for (const [key, val] of Object.entries(positions)) {
    let qty = 0;
    let avgCost = 0;
    if (key.endsWith('_qty')) {
      qty = Number(val);
      avgCost = 0;
    } else if (typeof val === 'object' && val !== null) {
      const v = val as Record<string, unknown>;
      qty = Number(v.qty ?? 0);
      avgCost = Number(v.avgCost ?? 0);
    }
    if (qty === 0) continue;
    const symbol = key.endsWith('_qty') ? key.replace('_qty', '') : key;
    const pair = symbol.endsWith('USDT') ? symbol.replace('USDT', '/USDT') : symbol;
    const price = prices[symbol] ?? prices[key] ?? 0;
    const value = qty * price;
    const pnl = price > 0 ? (price - avgCost) * qty : 0;
    const costBasis = avgCost * qty;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    const exposurePct = equity > 0 ? (value / equity) * 100 : 0;
    const side = qty > 0 ? 'Long' : qty < 0 ? 'Short' : '—';
    rows.push({ pair, side, qty, entry: avgCost, price, value, pnl, pnlPct, exposurePct });
  }

  return rows;
}

export function TabPositions({ detail }: TabPositionsProps) {
  const rows = buildRows(detail);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6 text-center">
        <p className="text-zinc-500 text-sm">No open positions.</p>
      </div>
    );
  }

  const cellNum = 'py-2 pl-2 pr-3 font-mono text-zinc-200 text-right';
  const cellPnl = (v: number) =>
    `py-2 pl-2 pr-3 font-mono text-right ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="sticky top-0 z-[1] bg-zinc-900 border-b border-zinc-800">
          <tr className="text-zinc-500 text-xs font-medium uppercase tracking-wider">
            <th className="py-3 pl-3 pr-2 text-left">Symbol</th>
            <th className="py-3 pl-2 pr-3 text-right">Side</th>
            <th className="py-3 pl-2 pr-3 text-right">Qty</th>
            <th className="py-3 pl-2 pr-3 text-right">Entry</th>
            <th className="py-3 pl-2 pr-3 text-right">Mark</th>
            <th className="py-3 pl-2 pr-3 text-right">Value</th>
            <th className="py-3 pl-2 pr-3 text-right">Unrealized PnL</th>
            <th className="py-3 pl-2 pr-3 text-right">PnL %</th>
            <th className="py-3 pl-2 pr-3 text-right">Exposure %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pair} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              <td className="py-2 pl-3 pr-2 font-mono text-zinc-200" title={r.pair}>
                {r.pair}
              </td>
              <td className={`py-2 pl-2 pr-3 text-right text-zinc-300`}>{r.side}</td>
              <td className={cellNum} title={String(r.qty)}>
                {formatNumber(r.qty, 4)}
              </td>
              <td className={cellNum} title={String(r.entry)}>
                {formatPrice(r.entry)}
              </td>
              <td className={cellNum} title={String(r.price)}>
                {formatPrice(r.price)}
              </td>
              <td className={cellNum} title={String(r.value)}>
                {formatCurrency(r.value)}
              </td>
              <td className={cellPnl(r.pnl)} title={String(r.pnl)}>
                {formatCurrency(r.pnl)}
              </td>
              <td className={cellPnl(r.pnlPct)} title={`${r.pnlPct}%`}>
                {formatPercent(r.pnlPct, 2)}
              </td>
              <td className={`${cellNum} text-zinc-400`} title={`${r.exposurePct}%`}>
                {formatPercent(r.exposurePct, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
