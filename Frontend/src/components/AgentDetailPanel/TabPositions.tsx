import React from 'react';
import type { AgentDetailResponse } from '../../types/api';

interface TabPositionsProps {
  detail: AgentDetailResponse;
}

function formatNum(n: number): string {
  return Number.isFinite(n) ? n.toFixed(4) : '—';
}

export function TabPositions({ detail }: TabPositionsProps) {
  const status = detail.status as Record<string, unknown> | null;
  const state = detail.state as Record<string, unknown> | null;
  const positions = (status?.positions ?? state?.positions ?? {}) as Record<string, unknown>;
  const prices = (status?.prices ?? {}) as Record<string, number>;
  const scoreboard = (status?.scoreboard ?? state) as Record<string, unknown> | undefined;
  const equity = Number(scoreboard?.equity ?? 0);

  const rows: { pair: string; qty: number; entry: number; price: number; value: number; pnl: number; pnlPct: number; portfolioPct: number }[] = [];

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
    const portfolioPct = equity > 0 ? (value / equity) * 100 : 0;
    rows.push({ pair, qty, entry: avgCost, price, value, pnl, pnlPct, portfolioPct });
  }

  if (rows.length === 0) {
    return <p className="text-zinc-500 text-sm">No open positions.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500 border-b border-zinc-800">
            <th className="py-2 pr-2">Pair</th>
            <th className="py-2 pr-2">Qty</th>
            <th className="py-2 pr-2">Entry</th>
            <th className="py-2 pr-2">Price</th>
            <th className="py-2 pr-2">Value</th>
            <th className="py-2 pr-2">PnL $</th>
            <th className="py-2 pr-2">PnL %</th>
            <th className="py-2 pr-2">Portfolio %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pair} className="border-b border-zinc-800/50">
              <td className="py-2 pr-2 font-mono text-zinc-200">{r.pair}</td>
              <td className="py-2 pr-2 font-mono text-zinc-200">{formatNum(r.qty)}</td>
              <td className="py-2 pr-2 font-mono text-zinc-200">{formatNum(r.entry)}</td>
              <td className="py-2 pr-2 font-mono text-zinc-200">{formatNum(r.price)}</td>
              <td className="py-2 pr-2 font-mono text-zinc-200">${formatNum(r.value)}</td>
              <td className={`py-2 pr-2 font-mono ${r.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${formatNum(r.pnl)}</td>
              <td className={`py-2 pr-2 font-mono ${r.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatNum(r.pnlPct)}%</td>
              <td className="py-2 pr-2 font-mono text-zinc-400">{formatNum(r.portfolioPct)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
