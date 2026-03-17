import React from 'react';
import type { AgentListItem, AgentDetailResponse } from '../../types/api';

interface TabOverviewProps {
  agent: AgentListItem;
  detail: AgentDetailResponse;
}

export function TabOverview({ agent, detail }: TabOverviewProps) {
  const state = detail.state as Record<string, unknown> | null;
  const status = detail.status as Record<string, unknown> | null;
  const scoreboard = (status?.scoreboard || state) as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Strategy & mode</h3>
        <dl className="grid grid-cols-2 gap-2">
          <dt className="text-zinc-500">Strategy</dt>
          <dd className="font-mono text-zinc-200">{agent.strategy ?? '—'}</dd>
          <dt className="text-zinc-500">Regime</dt>
          <dd className="font-mono text-zinc-200">{agent.regime ?? '—'}</dd>
          <dt className="text-zinc-500">Mode</dt>
          <dd className="font-mono text-zinc-200">{agent.mode ?? '—'}</dd>
          <dt className="text-zinc-500">Enabled</dt>
          <dd className="font-mono text-zinc-200">{agent.enabled ? 'Yes' : 'No'}</dd>
        </dl>
      </section>
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Portfolio</h3>
        <dl className="grid grid-cols-2 gap-2">
          <dt className="text-zinc-500">Cash</dt>
          <dd className="font-mono text-zinc-200">${Number(scoreboard?.cash ?? 0).toFixed(2)}</dd>
          <dt className="text-zinc-500">Equity</dt>
          <dd className="font-mono text-zinc-200">${Number(scoreboard?.equity ?? 0).toFixed(2)}</dd>
          <dt className="text-zinc-500">Realized PnL</dt>
          <dd className={`font-mono ${Number(scoreboard?.realizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${Number(scoreboard?.realizedPnl ?? 0).toFixed(2)}
          </dd>
          <dt className="text-zinc-500">Unrealized PnL</dt>
          <dd className={`font-mono ${Number(scoreboard?.unrealizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${Number(scoreboard?.unrealizedPnl ?? 0).toFixed(2)}
          </dd>
        </dl>
      </section>
    </div>
  );
}
