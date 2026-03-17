import React, { useMemo } from 'react';
import type { AgentListItem, AgentDetailResponse } from '../../types/api';
import { formatCurrency, formatTimestamp } from '../../utils/format';

interface TabOverviewProps {
  agent: AgentListItem;
  detail: AgentDetailResponse;
}

const PLACEHOLDER = '—';

function MetricCard({
  label,
  value,
  valueClassName = 'text-zinc-200'
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`font-mono text-sm ${valueClassName}`}>{value}</div>
    </div>
  );
}

function parseRiskExposure(checks: { name: string; detail: string }[]): number | null {
  const risk = checks.find((c) => c.name.toLowerCase().includes('risk_exposure'));
  if (!risk?.detail) return null;
  const match = risk.detail.match(/Exposure:\s*([\d.]+)/i);
  if (!match) return null;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function TabOverview({ agent, detail }: TabOverviewProps) {
  const state = detail.state as Record<string, unknown> | null;
  const status = detail.status as Record<string, unknown> | null;
  const scoreboard = (status?.scoreboard || state) as Record<string, unknown> | undefined;
  const { reconciliation } = detail;

  const cash = Number(scoreboard?.cash ?? 0);
  const equity = Number(scoreboard?.equity ?? 0);
  const realizedPnl = Number(scoreboard?.realizedPnl ?? 0);
  const unrealizedPnl = Number(scoreboard?.unrealizedPnl ?? 0);
  const exposure = useMemo(() => parseRiskExposure(reconciliation.checks), [reconciliation.checks]);
  const lastHeartbeat = status?.timestamp ?? state?.timestamp;

  const trades = (state?.trades ?? status?.trades ?? []) as Array<{ timestamp?: string | number; pnl?: number; symbol?: string; pair?: string }>;
  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
  }, [trades]);
  const lastTradeTs = sortedTrades[0]?.timestamp;

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const tradesToday = useMemo(
    () => sortedTrades.filter((t) => (t.timestamp ? new Date(t.timestamp).getTime() : 0) >= todayStart).length,
    [sortedTrades, todayStart]
  );
  const feesToday = null;
  const winsToday = useMemo(() => {
    const today = sortedTrades.filter((t) => (t.timestamp ? new Date(t.timestamp).getTime() : 0) >= todayStart);
    return today.filter((t) => (t.pnl ?? 0) > 0).length;
  }, [sortedTrades, todayStart]);
  const winRateToday = tradesToday > 0 ? (winsToday / tradesToday) * 100 : null;
  const bestTradeToday = useMemo(() => {
    const today = sortedTrades.filter((t) => (t.timestamp ? new Date(t.timestamp).getTime() : 0) >= todayStart);
    if (today.length === 0) return null;
    const withPnl = today.map((t) => t.pnl ?? 0);
    return Math.max(...withPnl);
  }, [sortedTrades, todayStart]);
  const worstTradeToday = useMemo(() => {
    const today = sortedTrades.filter((t) => (t.timestamp ? new Date(t.timestamp).getTime() : 0) >= todayStart);
    if (today.length === 0) return null;
    const withPnl = today.map((t) => t.pnl ?? 0);
    return Math.min(...withPnl);
  }, [sortedTrades, todayStart]);

  const pnlBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    sortedTrades.forEach((t) => {
      const sym = t.symbol ?? t.pair ?? '—';
      map.set(sym, (map.get(sym) ?? 0) + (t.pnl ?? 0));
    });
    return Array.from(map.entries())
      .map(([symbol, pnl]) => ({ symbol, pnl }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [sortedTrades]);
  const top3Best = pnlBySymbol.slice(0, 3).filter((x) => x.pnl > 0);
  const top3Worst = pnlBySymbol.filter((x) => x.pnl < 0).slice(-3).reverse();

  const reconOk = reconciliation.positionOk && reconciliation.cashOk && reconciliation.pnlOk;

  return (
    <div className="space-y-5 text-sm">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Strategy & mode
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <dt className="text-zinc-500">Strategy</dt>
          <dd className="font-mono text-zinc-200">{agent.strategy ?? PLACEHOLDER}</dd>
          <dt className="text-zinc-500">Regime</dt>
          <dd className="font-mono text-zinc-200">{agent.regime ?? PLACEHOLDER}</dd>
          <dt className="text-zinc-500">Mode</dt>
          <dd className="font-mono text-zinc-200 capitalize">{agent.mode ?? PLACEHOLDER}</dd>
          <dt className="text-zinc-500">Enabled</dt>
          <dd className="font-mono text-zinc-200">{agent.enabled ? 'Yes' : 'No'}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Portfolio
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <dt className="text-zinc-500">Cash</dt>
          <dd className="font-mono text-zinc-200">{formatCurrency(cash)}</dd>
          <dt className="text-zinc-500">Equity</dt>
          <dd className="font-mono text-zinc-200">{formatCurrency(equity)}</dd>
          <dt className="text-zinc-500">Realized PnL</dt>
          <dd className={`font-mono ${realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(realizedPnl)}
          </dd>
          <dt className="text-zinc-500">Unrealized PnL</dt>
          <dd className={`font-mono ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(unrealizedPnl)}
          </dd>
          <dt className="text-zinc-500">Open positions</dt>
          <dd className="font-mono text-zinc-200">{agent.openPositions ?? 0}</dd>
          <dt className="text-zinc-500">Current exposure</dt>
          <dd className="font-mono text-zinc-200">{exposure != null ? formatCurrency(exposure) : PLACEHOLDER}</dd>
          <dt className="text-zinc-500">Last heartbeat</dt>
          <dd className="font-mono text-zinc-400 text-xs">{formatTimestamp(lastHeartbeat as string | number | undefined)}</dd>
          <dt className="text-zinc-500">Reconciliation</dt>
          <dd className={reconOk ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>
            {reconOk ? 'OK' : 'Mismatch / Fail'}
          </dd>
          <dt className="text-zinc-500">Last trade</dt>
          <dd className="font-mono text-zinc-400 text-xs">{formatTimestamp(lastTradeTs)}</dd>
        </dl>
      </section>

      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Today
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricCard label="Trades today" value={tradesToday} />
          <MetricCard label="Fees today" value={feesToday != null ? formatCurrency(feesToday) : PLACEHOLDER} />
          <MetricCard
            label="Win rate"
            value={winRateToday != null ? `${winRateToday.toFixed(1)}%` : PLACEHOLDER}
          />
          <MetricCard
            label="Best trade today"
            value={bestTradeToday != null ? formatCurrency(bestTradeToday) : PLACEHOLDER}
            valueClassName={bestTradeToday != null && bestTradeToday >= 0 ? 'text-emerald-400' : 'text-zinc-200'}
          />
          <MetricCard
            label="Worst trade today"
            value={worstTradeToday != null ? formatCurrency(worstTradeToday) : PLACEHOLDER}
            valueClassName={worstTradeToday != null && worstTradeToday < 0 ? 'text-red-400' : 'text-zinc-200'}
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Performance by symbol
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
            <div className="text-xs text-zinc-500 mb-2">Top 3 best</div>
            <ul className="space-y-1 font-mono text-sm">
              {top3Best.length > 0
                ? top3Best.map((x) => (
                    <li key={x.symbol} className="text-emerald-400 flex justify-between">
                      <span>{x.symbol}</span>
                      <span>{formatCurrency(x.pnl)}</span>
                    </li>
                  ))
                : PLACEHOLDER}
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
            <div className="text-xs text-zinc-500 mb-2">Top 3 worst</div>
            <ul className="space-y-1 font-mono text-sm">
              {top3Worst.length > 0
                ? top3Worst.map((x) => (
                    <li key={x.symbol} className="text-red-400 flex justify-between">
                      <span>{x.symbol}</span>
                      <span>{formatCurrency(x.pnl)}</span>
                    </li>
                  ))
                : PLACEHOLDER}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
