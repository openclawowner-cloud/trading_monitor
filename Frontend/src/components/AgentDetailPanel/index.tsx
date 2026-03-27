import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { AgentListItem, AgentDetailResponse } from '../../types/api';
import { api } from '../../api/client';
import { wooxClient } from '../../api/wooxClient';
import { wooRealClient } from '../../api/wooRealClient';
import { bybitClient } from '../../api/bybitClient';
import { cryptoComClient } from '../../api/cryptoComClient';
import { StatusBadge } from '../StatusBadge';
import { TabOverview } from './TabOverview';
import { TabPositions } from './TabPositions';
import { TabTrades } from './TabTrades';
import { TabDiagnostics } from './TabDiagnostics';
import { TabReconciliation } from './TabReconciliation';
import { TabLifecycle } from './TabLifecycle';
import { TabRisk } from './TabRisk';
import { TabChart } from './TabChart';

type TabId = 'overview' | 'positions' | 'trades' | 'chart' | 'risk' | 'diagnostics' | 'reconciliation' | 'lifecycle';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'positions', label: 'Positions' },
  { id: 'trades', label: 'Trades' },
  { id: 'chart', label: 'Chart' },
  { id: 'risk', label: 'Risk' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'lifecycle', label: 'Lifecycle' }
];

interface AgentDetailPanelProps {
  agent: AgentListItem | null;
  onClose: () => void;
  onAction: () => void;
  dataSource?: 'binance' | 'woox' | 'woo_real' | 'bybit' | 'crypto_com';
}

function toWooxDetailResponse(raw: Awaited<ReturnType<typeof wooxClient.getAgent>>): AgentDetailResponse {
  return {
    status: raw.latestStatus,
    state: raw.paperState,
    reconciliation: {
      positionOk: true,
      cashOk: true,
      pnlOk: true,
      checks: [
        {
          name: 'woox_runtime_status',
          ok: raw.runtimeStatus === 'running' || raw.runtimeStatus === 'stale',
          detail: `runtime=${raw.runtimeStatus}`
        },
        {
          name: 'woox_mode_allowed',
          ok: raw.modeAllowed,
          detail: `modeAllowed=${String(raw.modeAllowed)}`
        }
      ],
      mismatchDetails: []
    },
    agent: raw.agent as unknown as Record<string, unknown>
  };
}

export function AgentDetailPanel({ agent, onClose, onAction, dataSource = 'binance' }: AgentDetailPanelProps) {
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
    const load =
      dataSource === 'woox'
        ? wooxClient.getAgent(agent.agentId).then(toWooxDetailResponse)
        : dataSource === 'woo_real'
          ? wooRealClient.getAgent(agent.agentId).then((raw) =>
              toWooxDetailResponse({
                agent: raw.agent,
                latestStatus: raw.latestStatus,
                paperState: raw.paperState,
                runtimeStatus: raw.runtimeStatus,
                modeAllowed: raw.modeAllowed
              })
            )
        : dataSource === 'bybit'
          ? bybitClient.getAgent(agent.agentId).then((raw) =>
              toWooxDetailResponse({
                agent: raw.agent,
                latestStatus: raw.latestStatus,
                paperState: raw.paperState,
                runtimeStatus: raw.runtimeStatus,
                modeAllowed: raw.modeAllowed
              })
            )
        : dataSource === 'crypto_com'
          ? cryptoComClient.getAgent(agent.agentId).then((raw) =>
              toWooxDetailResponse({
                agent: raw.agent,
                latestStatus: raw.latestStatus,
                paperState: raw.paperState,
                runtimeStatus: raw.runtimeStatus,
                modeAllowed: raw.modeAllowed
              })
            )
        : api.getAgent(agent.agentId);
    load
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [agent?.agentId, dataSource]);

  if (!agent) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-[634px] bg-zinc-900 border-l border-zinc-800 shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 p-4 md:p-5 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{agent.name || agent.agentId}</h2>
          <div className="mt-1">
            <StatusBadge status={agent.status} />
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex border-b border-zinc-800 overflow-x-auto shrink-0 gap-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab === t.id ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-4 md:p-5">
        {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!loading && !error && detail && (
          <>
            {tab === 'overview' && <TabOverview agent={agent} detail={detail} />}
            {tab === 'positions' && <TabPositions detail={detail} />}
            {tab === 'trades' && <TabTrades detail={detail} />}
            {tab === 'chart' && (
              <TabChart
                agentId={agent.agentId}
                detail={detail}
                dataSource={dataSource}
                onAction={onAction}
                candleSource={
                  dataSource === 'woox'
                    ? 'woox'
                    : dataSource === 'woo_real'
                      ? 'woo_real'
                      : dataSource === 'bybit'
                        ? 'bybit'
                      : dataSource === 'crypto_com'
                        ? 'crypto_com'
                      : 'binance'
                }
              />
            )}
            {tab === 'risk' && <TabRisk detail={detail} />}
            {tab === 'diagnostics' && <TabDiagnostics detail={detail} />}
            {tab === 'reconciliation' && <TabReconciliation detail={detail} />}
            {tab === 'lifecycle' && <TabLifecycle agent={agent} onAction={onAction} dataSource={dataSource} />}
          </>
        )}
      </div>
    </div>
  );
}
