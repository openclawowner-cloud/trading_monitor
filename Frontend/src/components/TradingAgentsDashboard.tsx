import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { TopStatsBar } from './TopStatsBar';
import { FilterBar, type FilterState } from './FilterBar';
import { AlertBanner } from './AlertBanner';
import { AgentCard } from './AgentCard';
import { AgentDetailPanel } from './AgentDetailPanel';
import { api } from '../api/client';
import type { AgentListItem, SupervisorStatus } from '../types/api';

/** Mirrors Frontend/src/api/client.ts base resolution (do not import client to avoid coupling). */
const API_BASE = (() => {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN != null
      ? String(import.meta.env.VITE_API_ORIGIN).replace(/\/$/, '')
      : '';
  if (raw) return `${raw}/api`;
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return 'http://localhost:3000/api';
  return '/api';
})();

function wooxDashboardAgentsUrl(): string {
  return `${API_BASE}/woox/dashboard-agents`;
}

const DEFAULT_FILTERS: FilterState = {
  status: 'all',
  mode: 'all',
  search: '',
  hideOfflineOver24h: false
};

function filterAgents(agents: AgentListItem[], filters: FilterState): AgentListItem[] {
  let out = agents;
  if (filters.status !== 'all') out = out.filter((a) => a.status === filters.status);
  if (filters.mode !== 'all') out = out.filter((a) => a.mode === filters.mode);
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    out = out.filter((a) => (a.name ?? '').toLowerCase().includes(q) || (a.agentId ?? '').toLowerCase().includes(q));
  }
  if (filters.hideOfflineOver24h) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    out = out.filter((a) => a.status !== 'offline' || (a.lastModifiedMs != null && a.lastModifiedMs >= cutoff));
  }
  return out;
}

export interface TradingAgentsDashboardProps {
  dataSource?: 'binance' | 'woox' | 'woo_real' | 'bybit';
  /** Nested on /woox: avoid full-page min-height shell. */
  embedded?: boolean;
}

/** Live trading dashboard — `binance` uses trading-live API; `woox` uses WOO dashboard-agents (read-only cards). */
export function TradingAgentsDashboard({
  dataSource = 'binance',
  embedded = false
}: TradingAgentsDashboardProps) {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [config, setConfig] = useState<{ killSwitchActive?: boolean } | null>(null);
  const [supervisorStatus, setSupervisorStatus] = useState<SupervisorStatus | null>(null);
  const [supervisorError, setSupervisorError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedAgent, setSelectedAgent] = useState<AgentListItem | null>(null);
  const isWoox = dataSource === 'woox';
  const isWooReal = dataSource === 'woo_real';
  const isBybit = dataSource === 'bybit';

  const fetchData = useCallback(() => {
    if (dataSource === 'woox') {
      Promise.all([fetch(wooxDashboardAgentsUrl()), api.getConfig(), api.getSupervisorStatus().catch(() => null)])
        .then(async ([res, cfg, supervisor]) => {
          if (!res.ok) throw new Error(String(res.status));
          const list = (await res.json()) as AgentListItem[];
          setAgents(Array.isArray(list) ? list : []);
          setConfig({ killSwitchActive: cfg.killSwitchActive });
          setSupervisorStatus(supervisor ?? null);
        })
        .catch((err) => {
          console.error('Failed to fetch WOO dashboard agents', err);
          setAgents([]);
        })
        .finally(() => setLoading(false));
      return;
    }

    if (dataSource === 'woo_real') {
      Promise.all([
        fetch(`${API_BASE}/woo-real/dashboard-agents`),
        api.getConfig(),
        fetch(`${API_BASE}/woo-real/supervisor`)
          .then((r) => (r.ok ? r.json() : null))
          .then((s) =>
            s
              ? {
                  supervisorRunning: Boolean((s as { running?: boolean }).running),
                  supervisorPid:
                    typeof (s as { supervisorPid?: number }).supervisorPid === 'number'
                      ? (s as { supervisorPid: number }).supervisorPid
                      : null,
                  updatedAt:
                    typeof (s as { updatedAt?: number }).updatedAt === 'number'
                      ? (s as { updatedAt: number }).updatedAt
                      : null,
                  agents: {}
                }
              : null
          )
          .catch(() => null)
      ])
        .then(async ([res, cfg, supervisor]) => {
          if (!res.ok) throw new Error(String(res.status));
          const list = (await res.json()) as AgentListItem[];
          setAgents(Array.isArray(list) ? list : []);
          setConfig({ killSwitchActive: cfg.killSwitchActive });
          setSupervisorStatus(supervisor);
        })
        .catch((err) => {
          console.error('Failed to fetch WOO Real dashboard agents', err);
          setAgents([]);
        })
        .finally(() => setLoading(false));
      return;
    }

    if (dataSource === 'bybit') {
      Promise.all([
        fetch(`${API_BASE}/bybit/dashboard-agents`),
        api.getConfig(),
        fetch(`${API_BASE}/bybit/supervisor`)
          .then((r) => (r.ok ? r.json() : null))
          .then((s) =>
            s
              ? {
                  supervisorRunning: Boolean((s as { running?: boolean }).running),
                  supervisorPid:
                    typeof (s as { supervisorPid?: number }).supervisorPid === 'number'
                      ? (s as { supervisorPid: number }).supervisorPid
                      : null,
                  updatedAt:
                    typeof (s as { updatedAt?: number }).updatedAt === 'number'
                      ? (s as { updatedAt: number }).updatedAt
                      : null,
                  agents: {}
                }
              : null
          )
          .catch(() => null)
      ])
        .then(async ([res, cfg, supervisor]) => {
          if (!res.ok) throw new Error(String(res.status));
          const list = (await res.json()) as AgentListItem[];
          setAgents(Array.isArray(list) ? list : []);
          setConfig({ killSwitchActive: cfg.killSwitchActive });
          setSupervisorStatus(supervisor);
        })
        .catch((err) => {
          console.error('Failed to fetch Bybit dashboard agents', err);
          setAgents([]);
        })
        .finally(() => setLoading(false));
      return;
    }

    Promise.all([api.getAgents(), api.getConfig(), api.getSupervisorStatus().catch(() => null)])
      .then(([agentsList, cfg, supervisor]) => {
        setAgents(agentsList);
        setConfig({ killSwitchActive: cfg.killSwitchActive });
        setSupervisorStatus(supervisor ?? null);
      })
      .catch((err) => {
        console.error('Failed to fetch', err);
        setAgents([]);
      })
      .finally(() => setLoading(false));
  }, [dataSource]);

  const handleSupervisorStart = () => {
    setSupervisorError(null);
    if (isBybit) {
      fetch(`${API_BASE}/bybit/supervisor/start`, { method: 'POST' })
        .then(() => {
          setSupervisorError(null);
          fetchData();
        })
        .catch((err: Error) => {
          setSupervisorError(err.message || 'Start mislukt');
          fetchData();
        });
      return;
    }
    if (isWooReal) {
      fetch(`${API_BASE}/woo-real/supervisor/start`, { method: 'POST' })
        .then(() => {
          setSupervisorError(null);
          fetchData();
        })
        .catch((err: Error) => {
          setSupervisorError(err.message || 'Start mislukt');
          fetchData();
        });
      return;
    }
    api
      .postSupervisorStart()
      .then(() => {
        setSupervisorError(null);
        fetchData();
      })
      .catch((err: Error) => {
        setSupervisorError(err.message || 'Start mislukt');
        fetchData();
      });
  };

  const handleSupervisorStop = () => {
    setSupervisorError(null);
    if (isBybit) {
      fetch(`${API_BASE}/bybit/supervisor/stop`, { method: 'POST' })
        .then(fetchData)
        .catch(() => fetchData());
      return;
    }
    if (isWooReal) {
      fetch(`${API_BASE}/woo-real/supervisor/stop`, { method: 'POST' })
        .then(fetchData)
        .catch(() => fetchData());
      return;
    }
    api.postSupervisorStop().then(fetchData).catch(() => fetchData());
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const filteredAgents = useMemo(() => filterAgents(agents, filters), [agents, filters]);
  const allIncidents = useMemo(
    () => agents.flatMap((a) => (a.incidents ?? []).map((i) => ({ ...i, agentId: a.agentId }))),
    [agents]
  );

  const rootClass = embedded
    ? 'text-zinc-100 font-sans antialiased'
    : 'min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased';

  return (
    <div className={rootClass}>
      <TopStatsBar
        agents={agents}
        config={config ?? undefined}
        supervisorStatus={supervisorStatus ?? undefined}
        supervisorError={supervisorError ?? undefined}
        onSupervisorStart={handleSupervisorStart}
        onSupervisorStop={handleSupervisorStop}
      />
      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        resultCount={filteredAgents.length}
        totalCount={agents.length}
      />
      <AlertBanner incidents={allIncidents} killSwitchActive={config?.killSwitchActive} />

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {loading ? (
          <div className="flex items-center justify-center min-h-[16rem]">
            <RefreshCw className="w-8 h-8 animate-spin text-zinc-600" aria-hidden />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 md:py-20 border border-dashed border-zinc-800 rounded-xl px-4">
            <ServerCrash className="w-12 h-12 text-zinc-700 mx-auto mb-4" aria-hidden />
            <h2 className="text-xl font-semibold text-zinc-400">No agents found</h2>
            <p className="text-zinc-500 mt-2 text-sm">Check your telemetry root directory or registry.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.agentId}
                agent={agent}
                onSelect={setSelectedAgent}
                disableInteraction={false}
                selectionOnly={false}
                isSelected={selectedAgent?.agentId === agent.agentId}
                onEnable={
                  isWoox
                    ? undefined
                    : isBybit
                      ? (id) => {
                          fetch(`${API_BASE}/bybit/agent/${encodeURIComponent(id)}/enable`, {
                            method: 'POST'
                          }).then(fetchData);
                        }
                    : isWooReal
                      ? (id) => {
                          fetch(`${API_BASE}/woo-real/agent/${encodeURIComponent(id)}/enable`, {
                            method: 'POST'
                          }).then(fetchData);
                        }
                    : (id) => {
                        api.postEnable(id).then(fetchData);
                      }
                }
                onDisable={
                  isWoox
                    ? undefined
                    : isBybit
                      ? (id) => {
                          fetch(`${API_BASE}/bybit/agent/${encodeURIComponent(id)}/disable`, {
                            method: 'POST'
                          }).then(fetchData);
                        }
                    : isWooReal
                      ? (id) => {
                          fetch(`${API_BASE}/woo-real/agent/${encodeURIComponent(id)}/disable`, {
                            method: 'POST'
                          }).then(fetchData);
                        }
                    : (id) => {
                        api.postDisable(id).then(fetchData);
                      }
                }
                onReset={
                  isWoox
                    ? undefined
                    : isBybit
                      ? (id) => {
                          fetch(`${API_BASE}/bybit/agent/${encodeURIComponent(id)}/reset`, {
                            method: 'POST'
                          }).then(fetchData);
                        }
                    : isWooReal
                      ? (id) => {
                          fetch(`${API_BASE}/woo-real/agent/${encodeURIComponent(id)}/reset`, {
                            method: 'POST'
                          }).then(fetchData);
                        }
                    : (id) => {
                        api.postReset(id).then(fetchData);
                      }
                }
                onValidate={
                  isWoox
                    ? undefined
                    : isBybit
                      ? (id) =>
                          fetch(`${API_BASE}/bybit/agent/${encodeURIComponent(id)}/validate`, {
                            method: 'POST'
                          }).then(fetchData)
                    : isWooReal
                      ? (id) =>
                          fetch(`${API_BASE}/woo-real/agent/${encodeURIComponent(id)}/validate`, {
                            method: 'POST'
                          }).then(fetchData)
                      : (id) => api.postValidate(id).then(fetchData)
                }
                onArchive={
                  isWoox
                    ? undefined
                    : isBybit
                      ? (id) => {
                          fetch(`${API_BASE}/bybit/agent/${encodeURIComponent(id)}/archive`, {
                            method: 'POST'
                          }).then(() => {
                            setSelectedAgent(null);
                            fetchData();
                          });
                        }
                    : isWooReal
                      ? (id) => {
                          fetch(`${API_BASE}/woo-real/agent/${encodeURIComponent(id)}/archive`, {
                            method: 'POST'
                          }).then(() => {
                            setSelectedAgent(null);
                            fetchData();
                          });
                        }
                    : (id) => {
                        api.postArchive(id).then(() => {
                          setSelectedAgent(null);
                          fetchData();
                        });
                      }
                }
              />
            ))}
          </div>
        )}
        {filteredAgents.length === 0 && agents.length > 0 && (
          <p className="text-center text-zinc-500 text-sm mt-5">No agents match the current filters.</p>
        )}
      </main>

      <AgentDetailPanel
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onAction={fetchData}
        dataSource={dataSource}
      />
    </div>
  );
}
