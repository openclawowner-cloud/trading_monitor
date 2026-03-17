import React, { useMemo, useState } from 'react';
import type { AgentDetailResponse } from '../../types/api';
import { formatTimestamp, formatCurrency, formatNumber, formatPrice } from '../../utils/format';

interface TabTradesProps {
  detail: AgentDetailResponse;
}

type TradeRecord = {
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
  event_type?: string;
  reason?: string;
  strategy?: string;
};

const PLACEHOLDER = '—';

function getTrades(detail: AgentDetailResponse): TradeRecord[] {
  const state = detail.state as Record<string, unknown> | null;
  const status = detail.status as Record<string, unknown> | null;
  return (state?.trades ?? status?.trades ?? []) as TradeRecord[];
}

type SortOrder = 'newest' | 'oldest';
type ViewFilter = 'all' | 'completed';

export function TabTrades({ detail }: TabTradesProps) {
  const [search, setSearch] = useState('');
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [sideFilter, setSideFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

  const rawTrades = useMemo(() => getTrades(detail), [detail]);
  const symbols = useMemo(() => {
    const set = new Set<string>();
    rawTrades.forEach((t) => {
      const s = t.symbol ?? t.pair;
      if (s) set.add(String(s));
    });
    return Array.from(set).sort();
  }, [rawTrades]);

  const filteredAndSorted = useMemo(() => {
    let list = [...rawTrades];
    if (viewFilter === 'completed') {
      list = list.filter((t) => t.pnl != null && Number.isFinite(t.pnl));
    }
    const ta = (t: TradeRecord) => (t.timestamp ? new Date(t.timestamp).getTime() : 0);
    list.sort((a, b) => (sortOrder === 'newest' ? ta(b) - ta(a) : ta(a) - ta(b)));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.symbol ?? '').toLowerCase().includes(q) ||
          (t.pair ?? '').toLowerCase().includes(q) ||
          (t.side ?? '').toLowerCase().includes(q) ||
          (t.fill_id ?? '').toLowerCase().includes(q) ||
          (t.order_id ?? '').toLowerCase().includes(q)
      );
    }
    if (symbolFilter !== 'all') {
      list = list.filter((t) => (t.symbol ?? t.pair) === symbolFilter);
    }
    if (sideFilter !== 'all') {
      list = list.filter((t) => (t.side ?? '').toLowerCase() === sideFilter.toLowerCase());
    }
    return list;
  }, [rawTrades, search, symbolFilter, sideFilter, sortOrder, viewFilter]);

  const displayTrades = filteredAndSorted.slice(0, 100);
  const totalFiltered = filteredAndSorted.length;

  if (rawTrades.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6 text-center">
        <p className="text-zinc-500 text-sm">No trades.</p>
      </div>
    );
  }

  const cellNum = 'py-2 pl-2 pr-3 font-mono text-zinc-200 text-right';
  const cellPnl = (v: number) =>
    `py-2 pl-2 pr-3 font-mono text-right ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
        <input
          type="search"
          placeholder="Search symbol, side, fill ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 min-w-[180px] focus:outline-none focus:ring-1 focus:ring-zinc-600"
        />
        <select
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
        >
          <option value="all">All symbols</option>
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={sideFilter}
          onChange={(e) => setSideFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
        >
          <option value="all">All sides</option>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <select
          value={viewFilter}
          onChange={(e) => setViewFilter(e.target.value as ViewFilter)}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
          title="All trades or only completed (with realized PnL)"
        >
          <option value="all">All trades</option>
          <option value="completed">Completed</option>
        </select>
        <span className="text-xs text-zinc-500 ml-auto">
          {totalFiltered} trade{totalFiltered !== 1 ? 's' : ''}
          {totalFiltered > 100 && ` (showing 100)`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="sticky top-0 z-[1] bg-zinc-900 border-b border-zinc-800">
            <tr className="text-zinc-500 text-xs font-medium uppercase tracking-wider">
              <th className="py-3 pl-3 pr-2 text-left">Time</th>
              <th className="py-3 pl-2 pr-3 text-left">Symbol</th>
              <th className="py-3 pl-2 pr-3 text-right">Side</th>
              <th className="py-3 pl-2 pr-3 text-right">Qty</th>
              <th className="py-3 pl-2 pr-3 text-right">Price</th>
              <th className="py-3 pl-2 pr-3 text-right">Notional</th>
              <th className="py-3 pl-2 pr-3 text-right">Fee</th>
              <th className="py-3 pl-2 pr-3 text-right">PnL</th>
              <th className="py-3 pl-2 pr-3 text-left">Strategy / Reason</th>
              <th className="py-3 pl-2 pr-3 text-left text-zinc-600">Order ID</th>
            </tr>
          </thead>
          <tbody>
            {displayTrades.map((t, i) => {
              const symbol = t.symbol ?? t.pair ?? PLACEHOLDER;
              const qty = t.qty ?? 0;
              const price = t.price ?? 0;
              const notional = qty * price;
              const pnl = t.pnl ?? 0;
              const reason = t.reason ?? t.strategy ?? PLACEHOLDER;
              return (
                <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 pl-3 pr-2 text-zinc-400 text-left" title={t.timestamp ? new Date(t.timestamp).toISOString() : undefined}>
                    {formatTimestamp(t.timestamp)}
                  </td>
                  <td className="py-2 pl-2 pr-3 font-mono text-zinc-200">{symbol}</td>
                  <td className="py-2 pl-2 pr-3 text-right text-zinc-300">{t.side ?? PLACEHOLDER}</td>
                  <td className={cellNum}>{formatNumber(qty, 4)}</td>
                  <td className={cellNum} title={String(price)}>
                    {formatPrice(price)}
                  </td>
                  <td className={cellNum}>{formatCurrency(notional)}</td>
                  <td className={cellNum}>{t.fee != null && Number.isFinite(t.fee) ? formatCurrency(t.fee) : PLACEHOLDER}</td>
                  <td className={cellPnl(pnl)}>{t.pnl != null && Number.isFinite(t.pnl) ? formatCurrency(t.pnl) : PLACEHOLDER}</td>
                  <td className="py-2 pl-2 pr-3 text-zinc-400 text-left text-xs max-w-[120px] truncate" title={String(reason)}>
                    {reason}
                  </td>
                  <td className="py-2 pl-2 pr-3 font-mono text-zinc-500 text-xs">{t.order_id ?? PLACEHOLDER}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalFiltered > 100 && (
        <p className="text-zinc-500 text-xs">
          Showing latest 100 of {totalFiltered} trades.
        </p>
      )}
    </div>
  );
}
