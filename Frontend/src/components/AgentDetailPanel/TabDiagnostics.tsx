import React, { useMemo, useState } from 'react';
import type { AgentDetailResponse } from '../../types/api';
import { formatTimestamp } from '../../utils/format';
import { CheckStatusBadge } from '../CheckStatusBadge';

/** Mirrors TabOverview / TabTrades getTradePnl (read-only debug). */
function debugGetTradePnl(t: Record<string, unknown>): number | null {
  const raw =
    t.pnl ??
    t.realizedPnl ??
    t.realized_pnl ??
    t.realized_pnl_impact;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function debugPnlSource(t: Record<string, unknown>, resolved: number | null): 'direct' | 'fallback' | 'missing' {
  if (resolved == null) return 'missing';
  const p = t.pnl;
  if (p != null && Number.isFinite(Number(p))) return 'direct';
  return 'fallback';
}

function fmtRaw(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  return String(v);
}

interface TabDiagnosticsProps {
  detail: AgentDetailResponse;
}

function Section({
  title,
  children,
  className = ''
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 ${className}`}>
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors"
      >
        {title}
        <span className="text-zinc-500">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-0 border-t border-zinc-800">{children}</div>}
    </div>
  );
}

function PnlFlowDebug({ detail }: { detail: AgentDetailResponse }) {
  const [scope, setScope] = useState<'all' | 'today'>('all');
  const [pnlFilter, setPnlFilter] = useState<'all' | 'missing' | 'with'>('all');

  const trades = useMemo(() => {
    const state = detail.state as Record<string, unknown> | null;
    const status = detail.status as Record<string, unknown> | null;
    const raw = (state?.trades ?? status?.trades ?? []) as unknown[];
    return raw
      .map((t) => (typeof t === 'object' && t !== null ? (t as Record<string, unknown>) : null))
      .filter((t): t is Record<string, unknown> => t != null);
  }, [detail]);

  /** Same sort as TabOverview sortedTrades (newest first). All Overview metrics use this list. */
  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp as string | number).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp as string | number).getTime() : 0;
      return tb - ta;
    });
  }, [trades]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const isToday = (t: Record<string, unknown>) =>
    (t.timestamp ? new Date(t.timestamp as string | number).getTime() : 0) >= todayStart;

  const stats = useMemo(() => {
    const total = sortedTrades.length;
    const todayList = sortedTrades.filter(isToday);
    const tradesToday = todayList.length;
    const withPnl = (t: Record<string, unknown>) => debugGetTradePnl(t) != null;
    const tradesTodayWithPnl = todayList.filter(withPnl).length;
    const side = (t: Record<string, unknown>) => String(t.side ?? '').toLowerCase();
    const sellsWithPnl = sortedTrades.filter((t) => side(t) === 'sell' && withPnl(t)).length;
    const sellsWithoutPnl = sortedTrades.filter((t) => side(t) === 'sell' && !withPnl(t)).length;
    const buysPnl0 = sortedTrades.filter(
      (t) => side(t) === 'buy' && debugGetTradePnl(t) === 0
    ).length;

    const symMap = new Map<string, number>();
    sortedTrades.forEach((t) => {
      const sym = String(t.symbol ?? t.pair ?? '—');
      symMap.set(sym, (symMap.get(sym) ?? 0) + (debugGetTradePnl(t) ?? 0));
    });
    const symbolsNonZero = [...symMap.entries()].filter(([, v]) => v !== 0);

    const canWinRate = tradesTodayWithPnl > 0;
    const todayPnls = todayList.map((t) => debugGetTradePnl(t)).filter((n): n is number => n != null);
    const canBestWorst = todayPnls.length > 0;
    const canPerfSymbol = symbolsNonZero.length > 0;

    return {
      total,
      tradesToday,
      tradesTodayWithPnl,
      sellsWithPnl,
      sellsWithoutPnl,
      buysPnl0,
      symbolsNonZero,
      canWinRate,
      canBestWorst,
      canPerfSymbol
    };
  }, [sortedTrades, todayStart]);

  const rows = useMemo(() => {
    let list = [...sortedTrades];
    if (scope === 'today') list = list.filter(isToday);
    if (pnlFilter === 'missing') list = list.filter((t) => debugGetTradePnl(t) == null);
    if (pnlFilter === 'with') list = list.filter((t) => debugGetTradePnl(t) != null);
    return list.map((t, i) => {
      const resolved = debugGetTradePnl(t);
      const source = debugPnlSource(t, resolved);
      const today = isToday(t);
      const wr =
        today && resolved != null ? (resolved > 0 ? 'win+' : resolved < 0 ? 'loss' : '0') : '—';
      const bw = today && resolved != null ? 'Y' : '—';
      const symContrib = debugGetTradePnl(t) ?? 0;
      return { t, i, resolved, source, wr, bw, symContrib };
    });
  }, [sortedTrades, scope, pnlFilter, todayStart]);

  return (
    <Section title="PnL Flow Debug" className="border-amber-900/30">
      <p className="text-zinc-500 text-xs mb-2">
        Read-only · same <code className="text-zinc-400">getTradePnl</code> order as Overview / Trades.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 font-mono text-xs text-zinc-400 mb-3">
        <div>
          <span className="text-zinc-500">Total trades</span> {stats.total}
        </div>
        <div>
          <span className="text-zinc-500">Trades today</span> {stats.tradesToday}
        </div>
        <div>
          <span className="text-zinc-500">Today w/ resolved PnL</span> {stats.tradesTodayWithPnl}
        </div>
        <div>
          <span className="text-zinc-500">Sells w/ PnL</span> {stats.sellsWithPnl}
        </div>
        <div>
          <span className="text-zinc-500">Sells w/o PnL</span> {stats.sellsWithoutPnl}
        </div>
        <div>
          <span className="text-zinc-500">Buys resolved=0</span> {stats.buysPnl0}
        </div>
        <div className="col-span-2 sm:col-span-3">
          <span className="text-zinc-500">Symbols ΣPnL≠0</span>{' '}
          {stats.symbolsNonZero.length
            ? stats.symbolsNonZero.map(([s, v]) => `${s}:${v.toFixed(2)}`).join(' · ')
            : '—'}
        </div>
        <div>
          <span className="text-zinc-500">Win rate computable?</span>{' '}
          <span className={stats.canWinRate ? 'text-emerald-500' : 'text-zinc-500'}>
            {stats.canWinRate ? 'yes' : 'no'}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">Best/worst computable?</span>{' '}
          <span className={stats.canBestWorst ? 'text-emerald-500' : 'text-zinc-500'}>
            {stats.canBestWorst ? 'yes' : 'no'}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">Perf by symbol meaningful?</span>{' '}
          <span className={stats.canPerfSymbol ? 'text-emerald-500' : 'text-zinc-500'}>
            {stats.canPerfSymbol ? 'yes' : 'no'}
          </span>
        </div>
      </div>

      <Collapsible title="Trade-level PnL table">
        <div className="space-y-3 text-xs pt-2">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'all' | 'today')}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs"
            >
              <option value="all">All trades</option>
              <option value="today">Today only</option>
            </select>
            <select
              value={pnlFilter}
              onChange={(e) => setPnlFilter(e.target.value as 'all' | 'missing' | 'with')}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs"
            >
              <option value="all">All PnL</option>
              <option value="missing">Missing PnL only</option>
              <option value="with">With PnL only</option>
            </select>
          </div>

          <div className="overflow-x-auto max-h-72 overflow-y-auto border border-zinc-800 rounded-md">
            <table className="w-full text-left font-mono text-[10px] sm:text-xs">
              <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 text-zinc-500">
                <tr>
                  <th className="py-1 px-1">Time</th>
                  <th className="py-1 px-1">Pair</th>
                  <th className="py-1 px-1">Side</th>
                  <th className="py-1 px-1 text-right">Qty</th>
                  <th className="py-1 px-1 text-right">Px</th>
                  <th className="py-1 px-1 text-right">Fee</th>
                  <th className="py-1 px-1" title="raw pnl">
                    pnl
                  </th>
                  <th className="py-1 px-1">rPnl</th>
                  <th className="py-1 px-1">r_pnl</th>
                  <th className="py-1 px-1">imp</th>
                  <th className="py-1 px-1 text-emerald-600/90">Σ</th>
                  <th className="py-1 px-1">src</th>
                  <th className="py-1 px-1" title="win rate pool today">
                    WR
                  </th>
                  <th className="py-1 px-1" title="best/worst today">
                    B/W
                  </th>
                  <th className="py-1 px-1" title="Overview: (getTradePnl??0) added to symbol row">
                    Σsym
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-3 px-2 text-zinc-500">
                      No rows (check filters)
                    </td>
                  </tr>
                ) : (
                  rows.map(({ t, resolved, source, wr, bw, symContrib }, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-zinc-800/60 hover:bg-zinc-800/20"
                    >
                      <td className="py-0.5 px-1 text-zinc-500 whitespace-nowrap">
                        {formatTimestamp(t.timestamp as string | number | undefined, 'time')}
                      </td>
                      <td className="py-0.5 px-1 text-zinc-300 truncate max-w-[72px]" title={String(t.pair ?? t.symbol)}>
                        {String(t.pair ?? t.symbol ?? '—')}
                      </td>
                      <td className="py-0.5 px-1 capitalize">{String(t.side ?? '—')}</td>
                      <td className="py-0.5 px-1 text-right">{fmtRaw(t.qty)}</td>
                      <td className="py-0.5 px-1 text-right">{fmtRaw(t.price)}</td>
                      <td className="py-0.5 px-1 text-right text-zinc-500">{fmtRaw(t.fee)}</td>
                      <td className="py-0.5 px-1 text-zinc-500">{fmtRaw(t.pnl)}</td>
                      <td className="py-0.5 px-1 text-zinc-500">{fmtRaw(t.realizedPnl)}</td>
                      <td className="py-0.5 px-1 text-zinc-500">{fmtRaw(t.realized_pnl)}</td>
                      <td className="py-0.5 px-1 text-zinc-500">{fmtRaw(t.realized_pnl_impact)}</td>
                      <td className="py-0.5 px-1 text-emerald-400/90">
                        {resolved != null ? resolved : '—'}
                      </td>
                      <td
                        className={`py-0.5 px-1 ${
                          source === 'missing'
                            ? 'text-zinc-600'
                            : source === 'direct'
                              ? 'text-emerald-500/80'
                              : 'text-amber-500/80'
                        }`}
                      >
                        {source}
                      </td>
                      <td className="py-0.5 px-1 text-zinc-400">{wr}</td>
                      <td className="py-0.5 px-1 text-zinc-400">{bw}</td>
                      <td className="py-0.5 px-1 text-zinc-400" title="Same increment as Overview pnlBySymbol">
                        {symContrib === 0 && debugGetTradePnl(t) == null ? (
                          <span className="text-zinc-600">0</span>
                        ) : (
                          symContrib
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Collapsible>
    </Section>
  );
}

export function TabDiagnostics({ detail }: TabDiagnosticsProps) {
  const status = detail.status as Record<string, unknown> | null;
  const state = detail.state as Record<string, unknown> | null;
  const { reconciliation } = detail;

  const statusTs = status?.timestamp;
  const stateTs = state?.timestamp;

  const riskChecks = reconciliation.checks.filter((c) =>
    c.name.toLowerCase().includes('risk')
  );
  const consistencyChecks = reconciliation.checks.filter(
    (c) =>
      !c.name.toLowerCase().includes('risk') &&
      (c.name.toLowerCase().includes('position') ||
        c.name.toLowerCase().includes('cash') ||
        c.name.toLowerCase().includes('pnl') ||
        c.name.toLowerCase().includes('equity'))
  );
  const otherChecks = reconciliation.checks.filter(
    (c) =>
      !riskChecks.includes(c) && !consistencyChecks.includes(c)
  );

  return (
    <div className="space-y-4 text-sm">
      <Section title="Telemetry timestamps">
        <dl className="grid gap-2">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">latest_status</dt>
            <dd className="font-mono text-zinc-200 text-right text-xs">
              {formatTimestamp(statusTs as string | number | undefined, 'iso')}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">state_timestamp</dt>
            <dd className="font-mono text-zinc-200 text-right text-xs">
              {formatTimestamp(stateTs as string | number | undefined, 'iso')}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Reconciliation summary">
        <div className="flex flex-wrap gap-2">
          <CheckStatusBadge ok={reconciliation.positionOk} variant="position" label={reconciliation.positionOk ? 'OK' : 'Mismatch'} />
          <CheckStatusBadge ok={reconciliation.cashOk} variant="cash" />
          <CheckStatusBadge ok={reconciliation.pnlOk} variant="pnl" />
        </div>
      </Section>

      {consistencyChecks.length > 0 && (
        <Section title="Consistency checks">
          <ul className="space-y-2">
            {consistencyChecks.map((c) => (
              <li
                key={c.name}
                className={`text-xs font-mono flex flex-wrap items-baseline gap-1 break-words ${c.ok ? 'text-zinc-400' : 'text-amber-400'}`}
              >
                <span className="font-medium">{c.name}</span>: <span className="min-w-0">{c.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {riskChecks.length > 0 && (
        <Section title="Risk checks">
          <ul className="space-y-2">
            {riskChecks.map((c) => (
              <li
                key={c.name}
                className={`text-xs font-mono flex flex-wrap items-baseline gap-1 break-words ${c.ok ? 'text-zinc-400' : 'text-amber-400'}`}
              >
                <span className="font-medium">{c.name}</span>: <span className="min-w-0">{c.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {otherChecks.length > 0 && (
        <Section title="Other checks">
          <ul className="space-y-2">
            {otherChecks.map((c) => (
              <li
                key={c.name}
                className={`text-xs font-mono flex flex-wrap items-baseline gap-1 break-words ${c.ok ? 'text-zinc-400' : 'text-amber-400'}`}
              >
                <span className="font-medium">{c.name}</span>: <span className="min-w-0">{c.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <PnlFlowDebug detail={detail} />

      <Section title="Raw debug" className="opacity-90">
        <p className="text-zinc-500 text-xs mb-2">Technical / debug</p>
        <div className="space-y-3 min-w-0 max-w-full">
          <Collapsible title="Status payload">
            <pre className="text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all min-w-0">
              {status != null
                ? JSON.stringify(status, null, 2)
                : 'null'}
            </pre>
          </Collapsible>
          <Collapsible title="State payload">
            <pre className="text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all min-w-0">
              {state != null
                ? JSON.stringify(state, null, 2)
                : 'null'}
            </pre>
          </Collapsible>
        </div>
      </Section>
    </div>
  );
}
