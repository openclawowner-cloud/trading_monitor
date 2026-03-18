import React from 'react';
import { Square, Archive, Play, RefreshCw } from 'lucide-react';
import type { AgentListItem } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { CheckStatusBadge } from './CheckStatusBadge';
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
      <header className="flex justify-between items-start gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg text-zinc-100 truncate">{agent.name || agent.agentId}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-zinc-500">
            <span className="font-mono">{agent.strategy || '—'}</span>
            <span className="text-zinc-600">·</span>
            <span className="font-mono">{agent.regime || 'Any'}</span>
            {version !== '—' && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="font-mono text-zinc-600">v{version}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
          {agent.mode && (agent.mode.toLowerCase() === 'paper' || agent.mode.toLowerCase() === 'live') && (
            <span className="rounded border border-zinc-600 px-2 py-0.5 text-xs font-medium text-zinc-500 capitalize">
              {agent.mode}
            </span>
          )}
          <StatusBadge status={agent.status} />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 mb-3">
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

      <div className="border-t border-zinc-800/50 pt-3 pb-3 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {agent.reconciliationOk !== undefined && (
            <CheckStatusBadge ok={agent.reconciliationOk} variant="generic" label={agent.reconciliationOk ? 'Recon OK' : 'Recon mismatch'} />
          )}
        </div>
        <div className="text-xs text-zinc-500 font-mono truncate min-w-0">
          {lastUpdate ? (
            <span title={new Date(lastUpdate).toISOString()}>As of {new Date(lastUpdate).toLocaleTimeString()}</span>
          ) : (
            'Never updated'
          )}
        </div>
        <div className="text-xs text-zinc-500 font-mono">Exposure: —</div>
        <div className="text-xs text-zinc-500 font-mono">Last trade: —</div>
      </div>

      <footer className="mt-auto pt-3 border-t border-zinc-800/50 flex justify-end items-center">
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
