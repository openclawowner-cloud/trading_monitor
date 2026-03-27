import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { getOverview } from '../api/overviewClient';
import type { OverviewResponse } from '../types/api';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}

function clsStatus(enabled: boolean, running: boolean | null): string {
  if (!enabled) return 'text-zinc-500';
  if (running) return 'text-emerald-400';
  return 'text-amber-400';
}

function routeForExchange(exchangeId: string): string {
  if (exchangeId === 'binance') return '/binance';
  if (exchangeId === 'woox') return '/woox';
  if (exchangeId === 'woo_real') return '/woo-real';
  if (exchangeId === 'bybit') return '/bybit';
  if (exchangeId === 'crypto_com') return '/crypto-com';
  return '/home';
}

export function HomeOverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  const exchanges = useMemo(() => data?.exchanges ?? [], [data]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-4">
        <section className="border border-zinc-800 rounded-xl bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Home</h1>
              <p className="text-sm text-zinc-400">Cross-exchange control overview</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          {loading && <p className="text-sm text-zinc-500 mt-4">Loading overview...</p>}
          {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
          {!loading && !error && data && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border border-zinc-800 p-3">
                <p className="text-zinc-500">Agents</p>
                <p className="text-lg font-semibold">{data.global.agents.total}</p>
                <p className="text-xs text-zinc-400">
                  run {data.global.agents.running} / stale {data.global.agents.stale} / off{' '}
                  {data.global.agents.offline}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 p-3">
                <p className="text-zinc-500">Open positions</p>
                <p className="text-lg font-semibold">{data.global.openPositions}</p>
                <p className="text-xs text-zinc-400">
                  supervisors {data.global.supervisors.running}/{data.global.supervisors.total}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 p-3">
                <p className="text-zinc-500">Equity / Cash</p>
                <p className="text-lg font-semibold">${fmt(data.global.balances.equity)}</p>
                <p className="text-xs text-zinc-400">${fmt(data.global.balances.cash)} cash</p>
              </div>
              <div className="rounded-lg border border-zinc-800 p-3">
                <p className="text-zinc-500">PnL</p>
                <p className="text-lg font-semibold">${fmt(data.global.pnl.total)}</p>
                <p className="text-xs text-zinc-400">
                  realized ${fmt(data.global.pnl.realized)} / unrealized ${fmt(data.global.pnl.unrealized)}
                </p>
              </div>
            </div>
          )}
        </section>

        {!loading && !error && data?.global.incidents ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {data.global.incidents} incidents detected across exchanges.
          </div>
        ) : null}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exchanges.map((ex) => (
            <article key={ex.exchangeId} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{ex.label}</h2>
                <span className={`text-xs ${clsStatus(ex.enabled, ex.supervisorRunning)}`}>
                  {!ex.enabled ? 'disabled' : ex.supervisorRunning ? 'supervisor running' : 'supervisor stopped'}
                </span>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Agents</dt>
                  <dd>{ex.counts.total}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Running / Stale / Offline</dt>
                  <dd>
                    {ex.counts.running} / {ex.counts.stale} / {ex.counts.offline}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Open positions</dt>
                  <dd>{ex.openPositions}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Equity</dt>
                  <dd>${fmt(ex.balances.equity)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">PnL</dt>
                  <dd>${fmt(ex.pnl.total)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-zinc-500">{ex.lastUpdate ? `Updated ${ex.lastUpdate}` : 'No telemetry yet'}</p>
                <Link
                  to={routeForExchange(ex.exchangeId)}
                  className="text-sm text-emerald-400 hover:text-emerald-300"
                >
                  Open tab
                </Link>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
