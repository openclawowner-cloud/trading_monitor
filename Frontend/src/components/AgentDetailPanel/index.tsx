import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { AgentListItem, AgentDetailResponse } from '../../types/api';
import { api } from '../../api/client';
import { TabOverview } from './TabOverview';
import { TabPositions } from './TabPositions';
import { TabTrades } from './TabTrades';
import { TabDiagnostics } from './TabDiagnostics';
import { TabReconciliation } from './TabReconciliation';
import { TabLifecycle } from './TabLifecycle';

type TabId = 'overview' | 'positions' | 'trades' | 'diagnostics' | 'reconciliation' | 'lifecycle';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'positions', label: 'Positions' },
  { id: 'trades', label: 'Trades' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'lifecycle', label: 'Lifecycle' }
];

interface AgentDetailPanelProps {
  agent: AgentListItem | null;
  onClose: () => void;
  onAction: () => void;
}

export function AgentDetailPanel({ agent, onClose, onAction }: AgentDetailPanelProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const [detail, setDetail] = useState<AgentDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agent) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getAgent(agent.agentId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [agent?.agentId]);

  if (!agent) return null;

  const statusColor =
    agent.status === 'running'
      ? 'text-emerald-400'
      : agent.status === 'stale'
        ? 'text-amber-400'
        : agent.status === 'error' || agent.status === 'offline'
          ? 'text-red-400'
          : 'text-zinc-400';

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-zinc-900 border-l border-zinc-800 shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 p-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{agent.name || agent.agentId}</h2>
          <p className={`text-sm font-medium capitalize ${statusColor}`}>{agent.status}</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex border-b border-zinc-800 overflow-x-auto shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!loading && !error && detail && (
          <>
            {tab === 'overview' && <TabOverview agent={agent} detail={detail} />}
            {tab === 'positions' && <TabPositions detail={detail} />}
            {tab === 'trades' && <TabTrades detail={detail} />}
            {tab === 'diagnostics' && <TabDiagnostics detail={detail} />}
            {tab === 'reconciliation' && <TabReconciliation detail={detail} />}
            {tab === 'lifecycle' && <TabLifecycle agent={agent} onAction={onAction} />}
          </>
        )}
      </div>
    </div>
  );
}
