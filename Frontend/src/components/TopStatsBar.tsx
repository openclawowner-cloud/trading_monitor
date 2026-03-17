import React from 'react';
import { Activity, AlertTriangle, CheckCircle, Play, Square } from 'lucide-react';
import type { AgentListItem, SupervisorStatus } from '../types/api';

interface TopStatsBarProps {
  agents: AgentListItem[];
  config?: { killSwitchActive?: boolean };
  supervisorStatus?: SupervisorStatus | null;
  supervisorError?: string | null;
  onSupervisorStart?: () => void;
  onSupervisorStop?: () => void;
}

export function TopStatsBar({ agents, config, supervisorStatus, supervisorError, onSupervisorStart, onSupervisorStop }: TopStatsBarProps) {
  const totalEquity = agents.reduce((sum, a) => sum + (a.equity || 0), 0);
  const totalRealizedPnl = agents.reduce((sum, a) => sum + (a.realizedPnl ?? a.pnl ?? 0), 0);
  const totalUnrealizedPnl = agents.reduce((sum, a) => sum + (a.unrealizedPnl ?? 0), 0);
  const totalOpenPositions = agents.reduce((sum, a) => sum + (a.openPositions || 0), 0);
  const running = agents.filter((a) => a.status === 'running').length;
  const stale = agents.filter((a) => a.status === 'stale').length;
  const offlineOrError = agents.filter((a) => a.status === 'offline' || a.status === 'error').length;

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/50 p-4 sticky top-0 z-10 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-emerald-500" />
          <h1 className="text-xl font-semibold tracking-tight">Trading Monitor</h1>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="flex flex-col">
            <span className="text-zinc-500 font-medium text-xs uppercase tracking-wider">Total Equity</span>
            <span className="font-mono text-lg">${Number(totalEquity).toFixed(2)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-zinc-500 font-medium text-xs uppercase tracking-wider">Unrealized PnL</span>
            <span className={`font-mono text-lg ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}{Number(totalUnrealizedPnl).toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-zinc-500 font-medium text-xs uppercase tracking-wider">Realized PnL</span>
            <span className={`font-mono text-lg ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalRealizedPnl >= 0 ? '+' : ''}{Number(totalRealizedPnl).toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-zinc-500 font-medium text-xs uppercase tracking-wider">Open Positions</span>
            <span className="font-mono text-lg">{totalOpenPositions}</span>
          </div>
          <div className="flex flex-col border-l border-zinc-800 pl-6">
            <span className="text-zinc-500 font-medium text-xs uppercase tracking-wider">Agents</span>
            <div className="flex gap-3 text-lg">
              <span className="text-emerald-400 flex items-center gap-1" title="Running">
                <CheckCircle className="w-4 h-4" /> {running}
              </span>
              <span className="text-amber-400" title="Stale">{stale}</span>
              <span className="text-red-400 flex items-center gap-1" title="Offline/Error">
                <AlertTriangle className="w-4 h-4" /> {offlineOrError}
              </span>
            </div>
          </div>
          <div className="flex flex-col border-l border-zinc-800 pl-6">
            <span className="text-zinc-500 font-medium text-xs uppercase tracking-wider">Supervisor</span>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium border ${
                    supervisorStatus?.supervisorRunning
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                  }`}
                  title={supervisorStatus?.supervisorRunning ? 'Supervisor draait' : 'Supervisor draait niet'}
                >
                  {supervisorStatus?.supervisorRunning ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {supervisorStatus?.supervisorRunning ? 'Actief' : 'Niet actief'}
                </span>
                {onSupervisorStart && !supervisorStatus?.supervisorRunning && (
                  <button type="button" onClick={onSupervisorStart} className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10" title="Start supervisor">
                    <Play className="w-4 h-4" />
                  </button>
                )}
                {onSupervisorStop && supervisorStatus?.supervisorRunning && (
                  <button type="button" onClick={onSupervisorStop} className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-400/10" title="Stop supervisor">
                    <Square className="w-4 h-4" />
                  </button>
                )}
              </div>
              {supervisorError && (
                <span className="text-xs text-amber-400 max-w-[220px]" title={supervisorError}>{supervisorError}</span>
              )}
            </div>
          </div>
          {config?.killSwitchActive && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs font-medium">
              Kill switch ON
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
