import React from 'react';
import { CheckCircle, Clock, ServerCrash, AlertTriangle, Square, Archive, Play, RefreshCw } from 'lucide-react';
import type { AgentListItem } from '../types/api';

const STATUS_STYLES: Record<AgentListItem['status'], string> = {
  running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  stale: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  offline: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  disabled: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  archived: 'bg-zinc-900 text-zinc-600 border-zinc-800'
};

const STATUS_ICONS: Record<AgentListItem['status'], React.ReactNode> = {
  running: <CheckCircle className="w-3 h-3" />,
  stale: <Clock className="w-3 h-3" />,
  offline: <ServerCrash className="w-3 h-3" />,
  error: <AlertTriangle className="w-3 h-3" />,
  disabled: <Square className="w-3 h-3" />,
  archived: <Archive className="w-3 h-3" />
};

interface AgentCardProps {
  agent: AgentListItem;
  onSelect: (agent: AgentListItem) => void;
  onEnable?: (agentId: string) => void;
  onDisable?: (agentId: string) => void;
  onReset?: (agentId: string) => void;
  onValidate?: (agentId: string) => void;
  onArchive?: (agentId: string) => void;
}

export function AgentCard({ agent, onSelect, onEnable, onDisable, onReset, onValidate, onArchive }: AgentCardProps) {
  const pnl = agent.realizedPnl ?? agent.pnl ?? 0;
  const lastUpdate = agent.lastUpdate ?? (agent.lastModifiedMs ? new Date(agent.lastModifiedMs).toISOString() : null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(agent)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(agent)}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col cursor-pointer text-left"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-medium text-lg text-zinc-100">{agent.name || agent.agentId}</h3>
          <div className="flex gap-2 mt-1 text-xs font-mono text-zinc-500">
            <span>{agent.strategy || '—'}</span>
            <span>•</span>
            <span>{agent.regime || 'Any'}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[agent.status] ?? STATUS_STYLES.offline}`}>
          {STATUS_ICONS[agent.status] ?? STATUS_ICONS.offline}
          <span className="capitalize">{agent.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">PnL</div>
          <div className={`font-mono text-lg ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnl >= 0 ? '+' : ''}{Number(pnl).toFixed(2)}
          </div>
        </div>
        <div className="bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Open Pos</div>
          <div className="font-mono text-lg text-zinc-100">{agent.openPositions ?? 0}</div>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-zinc-800/50 flex justify-between items-center">
        <div className="text-xs text-zinc-600 font-mono">
          Updated: {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'Never'}
        </div>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {agent.enabled ? (
            <button type="button" onClick={() => onDisable?.(agent.agentId)} className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors" title="Disable">
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={() => onEnable?.(agent.agentId)} className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors" title="Enable">
              <Play className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={() => onReset?.(agent.agentId)} className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors" title="Reset">
            <RefreshCw className="w-4 h-4" />
          </button>
          {onValidate && (
            <button type="button" onClick={() => onValidate(agent.agentId)} className="p-1.5 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 rounded transition-colors" title="Validate">
              Validate
            </button>
          )}
          {onArchive && (
            <button type="button" onClick={() => onArchive(agent.agentId)} className="p-1.5 text-zinc-400 hover:text-zinc-500 rounded transition-colors" title="Archive">
              <Archive className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
