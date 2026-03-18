import React, { useMemo, useState } from 'react';
import type { AgentDetailResponse } from '../../types/api';
import { formatTimestamp, formatCurrency, formatNumber, formatPrice } from '../../utils/format';
import {
  TRADES_PANEL_PLACEHOLDER,
  type TradeRecord,
  finiteNum,
  getTradePnl,
  getTradesFromDetail,
  matchesTradeSearch,
  sortTradesByTimestamp,
  tradeRowKey,
  tradeSignalDisplay,
  trimStr
} from './tradesPanelUtils';

interface TabTradesProps {
  detail: AgentDetailResponse;
}

const PLACEHOLDER = TRADES_PANEL_PLACEHOLDER;

function formatTradeFeeCell(t: TradeRecord): string {
  const feeN = finiteNum(t.fee);
  if (feeN == null) return PLACEHOLDER;
  const asset = trimStr((t as Record<string, unknown>).fee_asset);
  return asset ? `${formatCurrency(feeN)} ${asset}` : formatCurrency(feeN);
}

function pnlCellDisplay(pnlValue: number | null): {
  className: string;
  title: string | undefined;
  content: string;
} {
  if (pnlValue == null) {
    return {
      className: 'text-zinc-600',
      title: 'No PnL on this trade record',
      content: PLACEHOLDER
    };
  }
  if (pnlValue === 0) {
    return {
      className: 'text-zinc-500',
      title: 'Explicit zero (e.g. buy leg)',
      content: formatCurrency(0)
    };
  }
  return {
    className: pnlValue >= 0 ? 'text-emerald-400' : 'text-red-400',
    title: undefined,
    content: formatCurrency(pnlValue)
  };
}

function sideClassForTrade(side: string): string {
  const s = (side ?? '').toLowerCase();
  return s === 'buy' ? 'text-zinc-300' : s === 'sell' ? 'text-zinc-400' : 'text-zinc-400';
}

type SortOrder = 'newest' | 'oldest';
type ViewFilter = 'all' | 'completed';
type RowCap = 100 | 250 | 'all';

export function TabTrades({ detail }: TabTradesProps) {
  const [search, setSearch] = useState('');
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [sideFilter, setSideFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [rowCap, setRowCap] = useState<RowCap>(100);

  const rawTrades = useMemo(() => getTradesFromDetail(detail), [detail]);
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
      list = list.filter((t) => getTradePnl(t) != null);
    }
    list = sortTradesByTimestamp(list, sortOrder);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => matchesTradeSearch(t, q));
    }
    if (symbolFilter !== 'all') {
      list = list.filter((t) => (t.symbol ?? t.pair) === symbolFilter);
    }
    if (sideFilter !== 'all') {
      list = list.filter((t) => (t.side ?? '').toLowerCase() === sideFilter.toLowerCase());
    }
    return list;
  }, [rawTrades, search, symbolFilter, sideFilter, sortOrder, viewFilter]);

  const totalFiltered = filteredAndSorted.length;
  const effectiveCap = rowCap === 'all' ? totalFiltered : rowCap;
  const shownCount = Math.min(effectiveCap, totalFiltered);
  const displayTrades = filteredAndSorted.slice(0, effectiveCap);

  const cellNum = 'py-1.5 pl-1 pr-2 font-mono text-zinc-200 text-right text-xs';

  if (rawTrades.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6 text-center space-y-2">
        <p className="text-zinc-400 text-sm font-medium">No trades in agent state</p>
        <p className="text-zinc-500 text-xs max-w-md mx-auto">
          Trades come from telemetry (<span className="font-mono">state.trades</span>). If you expected rows
          here, confirm the agent writes <span className="font-mono">paper_state.json</span> and reopen this
          panel to refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
        <input
          type="search"
          placeholder="Search symbol, side, id, fill…"
          aria-label="Search trades by symbol, side, id, order, reason"
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
          {totalFiltered} match{totalFiltered !== 1 ? 'es' : ''}
          {totalFiltered > shownCount ? ` · showing ${shownCount}` : ''}
        </span>
      </div>

      {totalFiltered === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6 text-center">
          <p className="text-zinc-500 text-sm">No trades match the current filters.</p>
          <p className="text-zinc-600 text-xs mt-1">Clear search or reset filters to see rows.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 px-1">
            <span>
              Showing <span className="text-zinc-400 font-mono">{shownCount}</span> of{' '}
              <span className="text-zinc-400 font-mono">{totalFiltered}</span> trades
              {rowCap !== 'all' && totalFiltered > rowCap ? ' (limit active)' : ''}
            </span>
            <span className="flex flex-wrap gap-2">
              {totalFiltered > 100 && rowCap === 100 && (
                <button
                  type="button"
                  onClick={() => setRowCap(250)}
                  className="px-2 py-1 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Show 250
                </button>
              )}
              {totalFiltered > 250 && rowCap === 250 && (
                <button
                  type="button"
                  onClick={() => setRowCap('all')}
                  className="px-2 py-1 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Show all
                </button>
              )}
              {totalFiltered > 100 && rowCap === 100 && totalFiltered <= 250 && (
                <button
                  type="button"
                  onClick={() => setRowCap('all')}
                  className="px-2 py-1 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Show all
                </button>
              )}
              {rowCap !== 100 && (
                <button
                  type="button"
                  onClick={() => setRowCap(100)}
                  className="px-2 py-1 rounded border border-zinc-700 bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                >
                  Show 100
                </button>
              )}
            </span>
          </div>

          <div className="min-w-0 overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm table-fixed" style={{ minWidth: '580px' }}>
              <thead className="sticky top-0 z-[1] bg-zinc-900 border-b border-zinc-800">
                <tr className="text-zinc-500 text-xs font-medium uppercase tracking-wider">
                  <th scope="col" className="py-2 pl-2 pr-1 text-left w-12">
                    Time
                  </th>
                  <th scope="col" className="py-2 pl-1 pr-1 text-left w-14 text-zinc-600">
                    ID
                  </th>
                  <th scope="col" className="py-2 pl-1 pr-2 text-left w-16">
                    Symbol
                  </th>
                  <th scope="col" className="py-2 pl-1 pr-2 text-right w-10">
                    Side
                  </th>
                  <th scope="col" className="py-2 pl-1 pr-2 text-right w-12">
                    Qty
                  </th>
                  <th scope="col" className="py-2 pl-1 pr-2 text-right w-12">
                    Price
                  </th>
                  <th
                    scope="col"
                    className="py-2 pl-1 pr-2 text-right w-14"
                    title="Qty × price when both are valid numbers"
                  >
                    Notional
                  </th>
                  <th scope="col" className="py-2 pl-1 pr-2 text-right w-11" title="Trading fee when present">
                    Fee
                  </th>
                  <th
                    scope="col"
                    className="py-2 pl-1 pr-2 text-right w-[3.25rem]"
                    title="Resolved PnL per fill when on record. Em dash means unknown; zero dollars means explicit zero (e.g. buy)"
                  >
                    PnL
                  </th>
                  <th
                    scope="col"
                    className="py-2 pl-1 pr-2 text-left w-[5.5rem]"
                    title="reason, else strategy, else event type in brackets if present"
                  >
                    Reason
                  </th>
                  <th scope="col" className="py-2 pl-1 pr-2 text-left w-14 text-zinc-600">
                    Order ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayTrades.map((t, i) => {
                  const symbol = t.symbol ?? t.pair ?? PLACEHOLDER;
                  const qtyN = finiteNum(t.qty);
                  const priceN = finiteNum(t.price);
                  const notional = qtyN != null && priceN != null ? qtyN * priceN : null;
                  const showNotional = notional != null && Number.isFinite(notional);
                  const pnlValue = getTradePnl(t);
                  const pnlUi = pnlCellDisplay(pnlValue);
                  const signal = tradeSignalDisplay(t);
                  const side = t.side ?? PLACEHOLDER;
                  const tid = t.id != null && String(t.id).trim() !== '' ? String(t.id) : '';
                  const idShort = tid.length > 10 ? `${tid.slice(0, 8)}…` : tid;
                  const reasonTitle =
                    signal.text === PLACEHOLDER ? undefined : signal.title;
                  const feeDisplay = formatTradeFeeCell(t);
                  return (
                    <tr
                      key={tid ? `id:${tid}:r${i}` : tradeRowKey(t, i)}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                    >
                      <td
                        className="py-1.5 pl-2 pr-1 text-zinc-400 text-left text-xs"
                        title={t.timestamp != null ? String(new Date(t.timestamp as string | number).toISOString()) : undefined}
                      >
                        {formatTimestamp(t.timestamp as string | number | undefined, 'time')}
                      </td>
                      <td
                        className="py-1.5 pl-1 pr-1 font-mono text-zinc-500 text-[10px] truncate max-w-[56px] min-w-0"
                        title={tid || undefined}
                        {...(tid ? { 'aria-label': `Trade id ${tid}` } : {})}
                      >
                        {tid ? idShort : PLACEHOLDER}
                      </td>
                      <td className="py-1.5 pl-1 pr-2 font-mono text-zinc-200 text-xs truncate min-w-0" title={symbol}>
                        {symbol}
                      </td>
                      <td className={`py-1.5 pl-1 pr-2 text-right text-xs capitalize ${sideClassForTrade(side)}`}>{side}</td>
                      <td className={cellNum}>{qtyN != null ? formatNumber(qtyN, 2) : PLACEHOLDER}</td>
                      <td className={cellNum} title={priceN != null ? String(priceN) : undefined}>
                        {priceN != null ? formatPrice(priceN, 2) : PLACEHOLDER}
                      </td>
                      <td
                        className={cellNum}
                        title={showNotional && notional != null ? `Notional: ${formatCurrency(notional)}` : undefined}
                      >
                        {showNotional ? formatCurrency(notional) : PLACEHOLDER}
                      </td>
                      <td
                        className={`${cellNum} text-zinc-500`}
                        title={feeDisplay !== PLACEHOLDER ? feeDisplay : undefined}
                      >
                        {feeDisplay}
                      </td>
                      <td
                        className={`py-1.5 pl-1 pr-2 font-mono text-right text-xs ${pnlUi.className}`}
                        title={pnlUi.title}
                      >
                        {pnlUi.content}
                      </td>
                      <td
                        className="py-1.5 pl-1 pr-2 text-zinc-500 text-left text-xs truncate max-w-[120px] min-w-0"
                        title={reasonTitle}
                      >
                        {signal.text === PLACEHOLDER ? (
                          PLACEHOLDER
                        ) : signal.isEventFallback ? (
                          <span className="text-zinc-600">{signal.text}</span>
                        ) : (
                          signal.text
                        )}
                      </td>
                      <td className="py-1.5 pl-1 pr-2 font-mono text-zinc-500 text-xs truncate min-w-0" title={t.order_id ? String(t.order_id) : undefined}>
                        {t.order_id != null && String(t.order_id) !== '' ? String(t.order_id) : PLACEHOLDER}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
