import React from 'react';
import { Square, Archive, Play, RefreshCw } from 'lucide-react';
import type { AgentListItem } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { formatPnl } from '../utils/format';

interface AgentCardProps {
  agent: AgentListItem;
  onSelect: (agent: AgentListItem) => void;
  onEnable?: (agentId: string) => void;
  onDisable?: (agentId: string) => void;
  onReset?: (agentId: string) => void;
  onValidate?: (agentId: string) => void;
  onArchive?: (agentId: string) => void;
  key?: string;
}

export function AgentCard({ agent, onSelect, onEnable, onDisable, onReset, onValidate, onArchive }: AgentCardProps) {
  const realized = agent.realizedPnl ?? agent.pnl ?? 0;
  const unrealized = agent.unrealizedPnl ?? 0;
  const netPnl = realized + unrealized;
  const lastUpdate = agent.lastUpdate ?? (agent.lastModifiedMs ? new Date(agent.lastModifiedMs).toISOString() : null);
  const version = (agent as AgentListItem & { version?: string }).version ?? '—';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(agent)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(agent)}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col cursor-pointer text-left min-h-[200px]"
    >
      <header className="flex justify-between items-start gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg text-zinc-100 truncate">{agent.name || agent.agentId}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-zinc-500">
            <span className="font-mono">{agent.strategy || '—'}</span>
            <span className="text-zinc-600">·</span>
            <span className="font-mono">{agent.regime || 'Any'}</span>
            <span className="text-zinc-600">·</span>
            <span className="font-mono capitalize">{agent.mode || '—'}</span>
            {version !== '—' && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="font-mono text-zinc-600">v{version}</span>
              </>
            )}
          </div>
        </div>
        <StatusBadge status={agent.status} className="shrink-0" />
      </header>

      <section className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">Net PnL</div>
          <div className={`font-mono text-lg ${netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPnl(netPnl)}
          </div>
        </div>
        <div className="bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">Open Pos</div>
          <div className="font-mono text-lg text-zinc-100">{agent.openPositions ?? 0}</div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {agent.reconciliationOk !== undefined && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
              agent.reconciliationOk ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
            title={agent.reconciliationOk ? 'Reconciliation OK' : 'Reconciliation mismatch'}
          >
            {agent.reconciliationOk ? 'Recon OK' : 'Recon mismatch'}
          </span>
        )}
      </div>

      <footer className="mt-auto pt-4 border-t border-zinc-800/50 flex justify-between items-center gap-3">
        <div className="text-xs text-zinc-500 font-mono truncate min-w-0">
          {lastUpdate ? (
            <span title={new Date(lastUpdate).toISOString()}>Updated {new Date(lastUpdate).toLocaleTimeString()}</span>
          ) : (
            'Never updated'
          )}
        </div>
        <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {agent.enabled ? (
            <button type="button" onClick={() => onDisable?.(agent.agentId)} className="p-2 text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors" title="Disable" aria-label="Disable">
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={() => onEnable?.(agent.agentId)} className="p-2 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-md transition-colors" title="Enable" aria-label="Enable">
              <Play className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={() => onReset?.(agent.agentId)} className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors" title="Reset" aria-label="Reset">
            <RefreshCw className="w-4 h-4" />
          </button>
          {onValidate && (
            <button type="button" onClick={() => onValidate(agent.agentId)} className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 rounded-md transition-colors" title="Validate" aria-label="Validate">
              Validate
            </button>
          )}
          {onArchive && (
            <button type="button" onClick={() => onArchive(agent.agentId)} className="p-2 text-zinc-400 hover:text-zinc-500 rounded-md transition-colors" title="Archive" aria-label="Archive">
              <Archive className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
