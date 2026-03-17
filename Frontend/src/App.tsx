import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { TopStatsBar } from './components/TopStatsBar';
import { FilterBar, type FilterState } from './components/FilterBar';
import { AlertBanner } from './components/AlertBanner';
import { AgentCard } from './components/AgentCard';
import { AgentDetailPanel } from './components/AgentDetailPanel';
import { api } from './api/client';
import type { AgentListItem, SupervisorStatus } from './types/api';

const DEFAULT_FILTERS: FilterState = {
  status: 'all',
  mode: 'all',
  search: '',
  hideOfflineOver24h: false
};

function filterAgents(agents: AgentListItem[], filters: FilterState): AgentListItem[] {
  let out = agents;
  if (filters.status !== 'all') {
    out = out.filter((a) => a.status === filters.status);
  }
  if (filters.mode !== 'all') {
    out = out.filter((a) => a.mode === filters.mode);
  }
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

export default function App() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [config, setConfig] = useState<{ killSwitchActive?: boolean } | null>(null);
  const [supervisorStatus, setSupervisorStatus] = useState<SupervisorStatus | null>(null);
  const [supervisorError, setSupervisorError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedAgent, setSelectedAgent] = useState<AgentListItem | null>(null);

  const fetchData = () => {
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
  };

  const handleSupervisorStart = () => {
    setSupervisorError(null);
    api
      .postSupervisorStart()
      .then(() => { setSupervisorError(null); fetchData(); })
      .catch((err: Error) => {
        setSupervisorError(err.message || 'Start mislukt');
        fetchData();
      });
  };

  const handleSupervisorStop = () => {
    setSupervisorError(null);
    api.postSupervisorStop().then(fetchData).catch(() => fetchData());
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAgents = useMemo(() => filterAgents(agents, filters), [agents, filters]);
  const allIncidents = useMemo(() => agents.flatMap((a) => (a.incidents ?? []).map((i) => ({ ...i, agentId: a.agentId }))), [agents]);

  const handleLifecycle = (agentId: string, action: 'enable' | 'disable' | 'reset' | 'validate' | 'archive') => {
    const f = api.postEnable(agentId) as Promise<unknown>;
    if (action === 'disable') api.postDisable(agentId).then(fetchData);
    else if (action === 'reset') api.postReset(agentId).then(fetchData);
    else if (action === 'validate') api.postValidate(agentId).then(fetchData);
    else if (action === 'archive') api.postArchive(agentId).then(() => { setSelectedAgent(null); fetchData(); });
    else api.postEnable(agentId).then(fetchData);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
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

      <main className="max-w-7xl mx-auto p-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-zinc-600" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-zinc-800 rounded-xl">
            <ServerCrash className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-zinc-400">No agents found</h2>
            <p className="text-zinc-600 mt-2">Check your telemetry root directory or registry.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.agentId}
                agent={agent}
                onSelect={setSelectedAgent}
                onEnable={(id) => { api.postEnable(id).then(fetchData); }}
                onDisable={(id) => { api.postDisable(id).then(fetchData); }}
                onReset={(id) => { api.postReset(id).then(fetchData); }}
                onValidate={(id) => api.postValidate(id).then(fetchData)}
                onArchive={(id) => { api.postArchive(id).then(() => { setSelectedAgent(null); fetchData(); }); }}
              />
            ))}
          </div>
        )}
        {filteredAgents.length === 0 && agents.length > 0 && (
          <p className="text-center text-zinc-500 text-sm mt-4">No agents match the current filters.</p>
        )}
      </main>

      <AgentDetailPanel
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onAction={fetchData}
      />
    </div>
  );
}
