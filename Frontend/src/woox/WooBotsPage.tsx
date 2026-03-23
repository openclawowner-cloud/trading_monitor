import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { TradingAgentsDashboard } from '../components/TradingAgentsDashboard';
import {
  WooxApiError,
  wooxClient,
  type WooxAgentDetail,
  type WooxAgentListItem,
  type WooxCapabilities,
  type WooxDashboardAgentDetail,
  type WooxInstrumentDebug,
  type WooxSupervisorStatus
} from '../api/wooxClient';
import { formatCurrency, formatPnl } from '../utils/format';

function fmtNumber(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '-';
}

function fmtText(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v : '-';
}

function formatNumber(value: unknown, decimals = 2): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toFixed(decimals);
}

function toSafeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatMetricCount(value: unknown): string {
  return String(Math.max(0, Math.floor(toSafeNumber(value))));
}

function formatMetricWinRate(value: unknown): string {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return '-';
  return `${(rate * 100).toFixed(2)}%`;
}

function badgeClass(kind: 'green' | 'yellow' | 'red' | 'zinc'): string {
  if (kind === 'green') return 'border-emerald-700 bg-emerald-950/40 text-emerald-300';
  if (kind === 'yellow') return 'border-amber-700 bg-amber-950/40 text-amber-300';
  if (kind === 'red') return 'border-red-700 bg-red-950/40 text-red-300';
  return 'border-zinc-700 bg-zinc-900/60 text-zinc-300';
}

function statusBadge(status: WooxAgentListItem['runtimeStatus']): string {
  if (status === 'running') return badgeClass('green');
  if (status === 'stale') return badgeClass('yellow');
  if (status === 'offline') return badgeClass('red');
  return badgeClass('zinc');
}

function modeAllowedBadge(modeAllowed: boolean): string {
  return modeAllowed ? badgeClass('green') : badgeClass('red');
}

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function formatTime(ts: unknown): string {
  const num = Number(ts);
  if (!Number.isFinite(num)) return '-';
  return new Date(num).toLocaleString();
}

function actionErrorMessage(actionName: string, err: unknown): string {
  const base = `${actionName} failed.`;
  if (err instanceof WooxApiError && (err.status === 401 || err.status === 403)) {
    return `${base} Actie geweigerd of beschermd; controleer server/debug-auth configuratie.`;
  }
  if (err instanceof Error && err.message) return `${base} ${err.message}`;
  return base;
}

type WooPageTab = 'dashboard' | 'tools';

function tabBtnClass(active: boolean): string {
  return [
    'px-4 py-2 rounded-md text-sm font-medium border transition-colors',
    active
      ? 'border-emerald-600 bg-emerald-950/40 text-emerald-300'
      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
  ].join(' ');
}

export function WooBotsPage() {
  const [activeTab, setActiveTab] = useState<WooPageTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<WooxCapabilities | null>(null);
  const [supervisor, setSupervisor] = useState<WooxSupervisorStatus | null>(null);
  const [agents, setAgents] = useState<WooxAgentListItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDetail, setAgentDetail] = useState<WooxAgentDetail | null>(null);
  const [instrumentDebug, setInstrumentDebug] = useState<WooxInstrumentDebug | null>(null);
  const [instrumentLoading, setInstrumentLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [wooDashSelectedId, setWooDashSelectedId] = useState<string | null>(null);
  const [wooDashDetail, setWooDashDetail] = useState<WooxDashboardAgentDetail | null>(null);
  const [wooDashDetailLoading, setWooDashDetailLoading] = useState(false);
  const [wooDashDetailError, setWooDashDetailError] = useState<string | null>(null);

  const refresh = (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    Promise.all([wooxClient.getCapabilities(), wooxClient.getSupervisor(), wooxClient.getAgents()])
      .then(([caps, sup, ag]) => {
        setCapabilities(caps);
        setSupervisor(sup);
        setAgents(ag.agents ?? []);
      })
      .catch((e: Error) => {
        setError(`Fetch failed: ${e.message || 'Failed to load WOO data'}`);
        setAgents([]);
      })
      .finally(() => {
        setLoading(false);
        if (isManual) setRefreshing(false);
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!selectedAgentId) {
      setAgentDetail(null);
      return;
    }
    wooxClient
      .getAgent(selectedAgentId)
      .then((detail) => {
        setAgentDetail(detail);
        setInstrumentDebug(null);
      })
      .catch(() => {
        setAgentDetail(null);
        setInstrumentDebug(null);
      });
  }, [selectedAgentId]);

  useEffect(() => {
    if (!wooDashSelectedId) {
      setWooDashDetail(null);
      setWooDashDetailError(null);
      return;
    }
    let cancelled = false;
    setWooDashDetailLoading(true);
    setWooDashDetailError(null);
    wooxClient
      .getDashboardAgent(wooDashSelectedId)
      .then((d) => {
        if (!cancelled) setWooDashDetail(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setWooDashDetail(null);
          setWooDashDetailError(e instanceof Error ? e.message : 'Failed to load dashboard detail');
        }
      })
      .finally(() => {
        if (!cancelled) setWooDashDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wooDashSelectedId]);

  const selectedListItem = useMemo(
    () => agents.find((a) => a.agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  const runAction = async (
    actionName: string,
    task: () => Promise<{ ok: boolean; message?: string }>
  ) => {
    setActionError(null);
    setActionInfo(null);
    setPendingAction(actionName);
    try {
      const res = await task();
      if (!res.ok) {
        setActionError(res.message || `${actionName} failed.`);
      } else {
        setActionInfo(`${actionName} completed.`);
      }
    } catch (err) {
      setActionError(actionErrorMessage(actionName, err));
    } finally {
      refresh();
      if (selectedAgentId) {
        wooxClient.getAgent(selectedAgentId).then(setAgentDetail).catch(() => setAgentDetail(null));
      }
      setPendingAction(null);
    }
  };

  const inspectInstrument = async () => {
    const status = safeObj(agentDetail?.latestStatus);
    const state = safeObj(agentDetail?.paperState);
    const symbol = fmtText(status.symbol) !== '-' ? String(status.symbol) : fmtText(state.symbol) !== '-' ? String(state.symbol) : '';
    if (!symbol) return;
    setInstrumentLoading(true);
    setInstrumentDebug(null);
    try {
      const res = await wooxClient.getInstrument(symbol);
      setInstrumentDebug(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Instrument lookup failed';
      setInstrumentDebug({ ok: false, error: msg });
    } finally {
      setInstrumentLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-3 border-b border-zinc-800">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="WOO pagina">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
            className={tabBtnClass(activeTab === 'dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tools'}
            onClick={() => setActiveTab('tools')}
            className={tabBtnClass(activeTab === 'tools')}
          >
            Tools
          </button>
        </div>
        {activeTab === 'dashboard' && (
          <p className="text-xs text-zinc-500 mt-3">
            WOO trading dashboard-weergave met dezelfde hiërarchie als de home dashboard pagina.
          </p>
        )}
        {activeTab === 'tools' && (
          <p className="text-xs text-zinc-500 mt-3">
            WOO tools: capabilities, supervisor en ruwe agent/debug informatie.
          </p>
        )}
      </div>

      {activeTab === 'dashboard' && (
        <div>
          <TradingAgentsDashboard
            dataSource="woox"
            onWooxDashboardAgentSelect={(a) => setWooDashSelectedId(a.agentId)}
            selectedWooxDashboardAgentId={wooDashSelectedId}
          />
          <main className="max-w-7xl mx-auto px-4 pb-6 md:pb-8">
            {wooDashSelectedId && (
              <section className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50 space-y-3 mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-zinc-200">WOO dashboard detail</h2>
                  <button
                    type="button"
                    onClick={() => setWooDashSelectedId(null)}
                    className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  >
                    Sluit selectie
                  </button>
                </div>
                {wooDashDetailLoading && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                    Laden…
                  </div>
                )}
                {!wooDashDetailLoading && wooDashDetailError && (
                  <p className="text-xs text-red-400 py-2">{wooDashDetailError}</p>
                )}
                {!wooDashDetailLoading && !wooDashDetailError && wooDashDetail && (
                  <div className="space-y-4 text-xs">
                    {(() => {
                      const tradeCount = Math.max(0, Math.floor(toSafeNumber(wooDashDetail.metrics?.tradeCount)));
                      const winCount = Math.max(0, Math.floor(toSafeNumber(wooDashDetail.metrics?.winCount)));
                      const lossCount = Math.max(0, Math.floor(toSafeNumber(wooDashDetail.metrics?.lossCount)));
                      const breakEvenCount = Math.max(0, tradeCount - winCount - lossCount);
                      return (
                        <>
                          <p className="text-zinc-400">
                            <span className="text-zinc-200 font-medium">{wooDashDetail.agent.name || wooDashDetail.agent.agentId}</span>
                            <span className="text-zinc-600 mx-1">·</span>
                            <span className="font-mono">{wooDashDetail.agent.agentId}</span>
                            <span className="text-zinc-600 mx-1">·</span>
                            {wooDashDetail.agent.enabled ? 'enabled' : 'disabled'}
                            <span className="text-zinc-600 mx-1">·</span>
                            {fmtText(wooDashDetail.agent.status)}
                          </p>
                          <div>
                            <h3 className="text-zinc-300 font-medium mb-2">Summary</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-zinc-400">
                              <p>cash: {formatCurrency(wooDashDetail.summary?.cash)}</p>
                              <p>equity: {formatCurrency(wooDashDetail.summary?.equity)}</p>
                              <p>realized PnL: {formatPnl(wooDashDetail.summary?.realizedPnl)}</p>
                              <p>unrealized PnL: {formatPnl(wooDashDetail.summary?.unrealizedPnl)}</p>
                              <p>total PnL: {formatPnl(wooDashDetail.summary?.pnl)}</p>
                              <p>open positions: {fmtNumber(wooDashDetail.summary?.openPositions)}</p>
                            </div>
                          </div>
                          <div>
                            <h3 className="text-zinc-300 font-medium mb-2">Metrics</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-zinc-400">
                              <p>trades: {formatMetricCount(wooDashDetail.metrics?.tradeCount)}</p>
                              <p>wins: {formatMetricCount(wooDashDetail.metrics?.winCount)}</p>
                              <p>losses: {formatMetricCount(wooDashDetail.metrics?.lossCount)}</p>
                              <p>win rate: {formatMetricWinRate(wooDashDetail.metrics?.winRate)}</p>
                              <p>avg win: {formatNumber(wooDashDetail.metrics?.avgWin, 2)}</p>
                              <p>avg loss: {formatNumber(wooDashDetail.metrics?.avgLoss, 2)}</p>
                              {breakEvenCount > 0 && <p>break-even trades: {breakEvenCount}</p>}
                            </div>
                          </div>
                          <div>
                            <h3 className="text-zinc-300 font-medium mb-2">Recent trades</h3>
                            {!Array.isArray(wooDashDetail.trades) || wooDashDetail.trades.length === 0 ? (
                              <p className="text-zinc-500">Geen trades in telemetry.</p>
                            ) : (
                              <div className="overflow-x-auto border border-zinc-800 rounded-lg">
                                <table className="w-full text-left border-collapse min-w-[32rem]">
                                  <thead>
                                    <tr className="border-b border-zinc-800 text-zinc-500">
                                      <th className="p-2 font-medium">time</th>
                                      <th className="p-2 font-medium">side</th>
                                      <th className="p-2 font-medium">qty</th>
                                      <th className="p-2 font-medium">price</th>
                                      <th className="p-2 font-medium">fee</th>
                                      <th className="p-2 font-medium">realized PnL</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...wooDashDetail.trades]
                                      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
                                      .map((t, i) => (
                                        <tr key={`${t.timestamp}-${i}`} className="border-b border-zinc-800/80 text-zinc-300">
                                          <td className="p-2 font-mono whitespace-nowrap">{formatTime(t.timestamp)}</td>
                                          <td className="p-2 uppercase">{fmtText(t.side)}</td>
                                          <td className="p-2 font-mono">{fmtText(t.qty)}</td>
                                          <td className="p-2 font-mono">{fmtText(t.price)}</td>
                                          <td className="p-2 font-mono">{fmtText(t.fee)}</td>
                                          <td
                                            className={[
                                              'p-2 font-mono',
                                              (() => {
                                                const n = Number(t.realizedPnl);
                                                if (t.side !== 'sell' || t.realizedPnl == null || !String(t.realizedPnl).trim()) return 'text-zinc-400';
                                                if (!Number.isFinite(n)) return 'text-zinc-400';
                                                if (n > 0) return 'text-emerald-400';
                                                if (n < 0) return 'text-red-400';
                                                return 'text-zinc-400';
                                              })()
                                            ].join(' ')}
                                          >
                                            {t.side === 'sell' && t.realizedPnl != null && String(t.realizedPnl).trim()
                                              ? formatNumber(t.realizedPnl, 2)
                                              : '-'}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </section>
            )}
          </main>
        </div>
      )}

      {activeTab === 'tools' && (
        <main className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-4">
          <section className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold">WOO Tools</h1>
              <button
                onClick={() => refresh(true)}
                disabled={refreshing || !!pendingAction}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-sm hover:border-zinc-500 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
            {actionError && <p className="text-red-400 text-sm mt-2">{actionError}</p>}
            {actionInfo && <p className="text-emerald-400 text-sm mt-2">{actionInfo}</p>}
            {loading && <p className="text-zinc-400 text-sm mt-3">Loading...</p>}
          </section>

          <section className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">Capabilities</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-zinc-300">
              <p>paper_local: {String(capabilities?.paper_local ?? false)}</p>
              <p>paper_exchange: {String(capabilities?.paper_exchange ?? false)}</p>
              <p>signed_api_configured: {String(capabilities?.signed_api_configured ?? false)}</p>
              <p>spot: {String(capabilities?.spot ?? false)}</p>
              <p>perps: {String(capabilities?.perps ?? false)}</p>
            </div>
            {capabilities && !capabilities.paper_exchange && (
              <p className="text-xs text-zinc-500 mt-2">paper_exchange is disabled in current backend configuration.</p>
            )}
          </section>

          <section className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-200">Supervisor</h2>
              <span className={`px-2 py-1 rounded-md text-xs border ${supervisor?.running ? badgeClass('green') : badgeClass('red')}`}>
                {supervisor?.running ? 'running' : 'stopped'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runAction('Supervisor start', () => wooxClient.startSupervisor())}
                  disabled={!!pendingAction}
                  className="px-3 py-1.5 rounded-md border border-emerald-700 text-emerald-300 text-sm hover:border-emerald-500 disabled:opacity-50"
                >
                  Start
                </button>
                <button
                  onClick={() => runAction('Supervisor stop', () => wooxClient.stopSupervisor())}
                  disabled={!!pendingAction}
                  className="px-3 py-1.5 rounded-md border border-red-700 text-red-300 text-sm hover:border-red-500 disabled:opacity-50"
                >
                  Stop
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-zinc-300 mt-2">
              <p>running: {String(supervisor?.running ?? false)}</p>
              <p>pid: {fmtNumber(supervisor?.supervisorPid)}</p>
              <p>updatedAt: {fmtNumber(supervisor?.updatedAt)}</p>
            </div>
            {supervisor?.lastError ? <p className="text-xs text-red-400 mt-2">{supervisor.lastError}</p> : null}
          </section>

          <section className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-200 mb-3">Agents</h2>
            {agents.length === 0 ? (
              <p className="text-zinc-500 text-sm">No WOO agents found.</p>
            ) : (
              <div className="space-y-2">
                {agents.map((item) => {
                  const isSelected = item.agent.id === selectedAgentId;
                  const extra = item.agent.extra ?? {};
                  return (
                    <div
                      key={item.agent.id}
                      className={[
                        'p-3 rounded-md border',
                        isSelected ? 'border-zinc-400 bg-zinc-800/70' : 'border-zinc-800 bg-zinc-900/40'
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{fmtText((extra as Record<string, unknown>).name) !== '-' ? String((extra as Record<string, unknown>).name) : item.agent.id}</p>
                          <p className="text-xs text-zinc-400">{item.agent.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedAgentId(item.agent.id)}
                            disabled={!!pendingAction}
                            className="px-2 py-1 rounded border border-zinc-700 text-xs hover:border-zinc-500 disabled:opacity-50"
                          >
                            Detail
                          </button>
                          <button
                            onClick={() => runAction(`Restart ${item.agent.id}`, () => wooxClient.restartAgent(item.agent.id))}
                            disabled={
                              !!pendingAction ||
                              (item.agent.extra as Record<string, unknown> | undefined)?.supervisorManaged === false
                            }
                            title={
                              (item.agent.extra as Record<string, unknown> | undefined)?.supervisorManaged === false
                                ? 'Beheerd door de hoofd-trading supervisor, niet door WOO'
                                : undefined
                            }
                            className="px-2 py-1 rounded border border-amber-700 text-amber-300 text-xs hover:border-amber-500 disabled:opacity-50"
                          >
                            Restart
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-zinc-300 mt-2">
                        <p>
                          mode:{' '}
                          <span className={`px-1.5 py-0.5 rounded border ${badgeClass('zinc')}`}>{item.agent.mode}</span>
                        </p>
                        <p>enabled: {String(item.agent.enabled)}</p>
                        <p>
                          runtime:{' '}
                          <span className={`px-1.5 py-0.5 rounded border ${statusBadge(item.runtimeStatus)}`}>
                            {item.runtimeStatus}
                          </span>
                        </p>
                        <p>
                          modeAllowed:{' '}
                          <span className={`px-1.5 py-0.5 rounded border ${modeAllowedBadge(item.modeAllowed)}`}>
                            {item.modeAllowed ? 'allowed' : 'blocked'}
                          </span>
                        </p>
                        <p>symbol: {fmtText((extra as Record<string, unknown>).symbol)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {selectedListItem && (
            <section className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
              <h2 className="text-sm font-semibold text-zinc-200 mb-2">Selected Agent Detail</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-zinc-300 mb-3">
                <p>id: {selectedListItem.agent.id}</p>
                <p>name: {fmtText((selectedListItem.agent.extra ?? {}).name)}</p>
                <p>mode: {selectedListItem.agent.mode}</p>
                <p>enabled: {String(selectedListItem.agent.enabled)}</p>
                <p>runtime: {selectedListItem.runtimeStatus}</p>
                <p>modeAllowed: {String(selectedListItem.modeAllowed)}</p>
                <p>status.symbol: {fmtText(agentDetail?.latestStatus?.symbol)}</p>
                <p>
                  status.lastPrice/price:{' '}
                  {fmtText(agentDetail?.latestStatus?.lastPrice) !== '-'
                    ? fmtText(agentDetail?.latestStatus?.lastPrice)
                    : fmtText(agentDetail?.latestStatus?.price)}
                </p>
                <p>status.signal: {fmtText(agentDetail?.latestStatus?.signal)}</p>
                <p>status.positionSide: {fmtText(agentDetail?.latestStatus?.positionSide)}</p>
                <p>state.equity: {fmtText(agentDetail?.paperState?.equity)}</p>
                <p>state.realizedPnl: {fmtText(agentDetail?.paperState?.realizedPnl)}</p>
                <p>state.unrealizedPnl: {fmtText(agentDetail?.paperState?.unrealizedPnl)}</p>
                <p>
                  status.updated:{' '}
                  {formatTime(agentDetail?.latestStatus?.timestamp ?? agentDetail?.latestStatus?.updatedAt ?? null)}
                </p>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={inspectInstrument}
                  disabled={instrumentLoading}
                  className="px-2 py-1 rounded border border-zinc-700 text-xs hover:border-zinc-500 disabled:opacity-50"
                >
                  {instrumentLoading ? 'Inspecting…' : 'Inspect instrument'}
                </button>
              </div>
              {instrumentDebug && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-zinc-300">
                  <p>instrument.ok: {String(instrumentDebug.ok)}</p>
                  <p>rule.quoteTick: {fmtText(instrumentDebug.rules?.quoteTick)}</p>
                  <p>rule.baseTick: {fmtText(instrumentDebug.rules?.baseTick)}</p>
                  <p>rule.minNotional: {fmtText(instrumentDebug.rules?.minNotional)}</p>
                  {!instrumentDebug.ok && <p className="col-span-2 md:col-span-4 text-red-400">instrument error: {fmtText(instrumentDebug.error)}</p>}
                </div>
              )}
            </section>
          )}
        </main>
      )}
    </div>
  );
}
