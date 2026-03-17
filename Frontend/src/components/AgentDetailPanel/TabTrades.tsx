import React from 'react';
import type { AgentDetailResponse } from '../../types/api';

interface TabTradesProps {
  detail: AgentDetailResponse;
}

export function TabTrades({ detail }: TabTradesProps) {
  const state = detail.state as Record<string, unknown> | null;
  const status = detail.status as Record<string, unknown> | null;
  const trades = (state?.trades ?? status?.trades ?? []) as Array<{
    timestamp?: string | number;
    symbol?: string;
    pair?: string;
    side?: string;
    qty?: number;
    price?: number;
    fill_id?: string;
    order_id?: string;
    fee?: number;
    pnl?: number;
  }>;

  if (trades.length === 0) {
    return <p className="text-zinc-500 text-sm">No trades.</p>;
  }

  const sorted = [...trades].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500 border-b border-zinc-800">
            <th className="py-2 pr-2">Time</th>
            <th className="py-2 pr-2">Symbol</th>
            <th className="py-2 pr-2">Side</th>
            <th className="py-2 pr-2">Qty</th>
            <th className="py-2 pr-2">Price</th>
            <th className="py-2 pr-2">Notional</th>
            <th className="py-2 pr-2">Fee</th>
            <th className="py-2 pr-2">Fill ID</th>
            <th className="py-2 pr-2">PnL</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 100).map((t, i) => {
            const ts = t.timestamp ? new Date(t.timestamp).toLocaleString() : '—';
            const symbol = t.symbol ?? t.pair ?? '—';
            const qty = t.qty ?? 0;
            const price = t.price ?? 0;
            const notional = qty * price;
            return (
              <tr key={i} className="border-b border-zinc-800/50">
                <td className="py-2 pr-2 text-zinc-400">{ts}</td>
                <td className="py-2 pr-2 font-mono text-zinc-200">{symbol}</td>
                <td className="py-2 pr-2 text-zinc-200">{t.side ?? '—'}</td>
                <td className="py-2 pr-2 font-mono text-zinc-200">{qty}</td>
                <td className="py-2 pr-2 font-mono text-zinc-200">{price}</td>
                <td className="py-2 pr-2 font-mono text-zinc-200">${notional.toFixed(2)}</td>
                <td className="py-2 pr-2 font-mono text-zinc-400">{t.fee ?? '—'}</td>
                <td className="py-2 pr-2 font-mono text-zinc-500 text-xs">{t.fill_id ?? '—'}</td>
                <td className={`py-2 pr-2 font-mono ${Number(t.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.pnl != null ? t.pnl.toFixed(2) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > 100 && <p className="text-zinc-500 text-xs mt-2">Showing latest 100 of {sorted.length}</p>}
    </div>
  );
}
