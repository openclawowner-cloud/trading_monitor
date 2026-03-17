import React from 'react';
import { Activity, AlertTriangle, Bell, CheckCircle, Play, Square } from 'lucide-react';
import type { AgentListItem, SupervisorStatus } from '../types/api';
import { formatCurrency, formatPnl } from '../utils/format';

interface TopStatsBarProps {
  agents: AgentListItem[];
  config?: { killSwitchActive?: boolean };
  supervisorStatus?: SupervisorStatus | null;
  supervisorError?: string | null;
  onSupervisorStart?: () => void;
  onSupervisorStop?: () => void;
}

function KpiBlock({
  label,
  value,
  valueClassName = 'font-mono text-lg text-zinc-100'
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

export function TopStatsBar({ agents, config, supervisorStatus, supervisorError, onSupervisorStart, onSupervisorStop }: TopStatsBarProps) {
  const totalEquity = agents.reduce((sum, a) => sum + (a.equity || 0), 0);
  const totalRealizedPnl = agents.reduce((sum, a) => sum + (a.realizedPnl ?? a.pnl ?? 0), 0);
  const totalUnrealizedPnl = agents.reduce((sum, a) => sum + (a.unrealizedPnl ?? 0), 0);
  const totalOpenPositions = agents.reduce((sum, a) => sum + (a.openPositions || 0), 0);
  const running = agents.filter((a) => a.status === 'running').length;
  const stale = agents.filter((a) => a.status === 'stale').length;
  const offlineOrError = agents.filter((a) => a.status === 'offline' || a.status === 'error').length;
  const alertsCount = agents.reduce((sum, a) => sum + (a.incidents?.length ?? 0), 0);

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3 sticky top-0 z-10 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-emerald-500 shrink-0" />
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Trading Monitor</h1>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm">
          <KpiBlock label="Total Equity" value={formatCurrency(totalEquity)} />
          <KpiBlock
            label="Unrealized PnL"
            value={formatPnl(totalUnrealizedPnl)}
            valueClassName={`font-mono text-lg ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
          />
          <KpiBlock
            label="Realized PnL"
            value={formatPnl(totalRealizedPnl)}
            valueClassName={`font-mono text-lg ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
          />
          <KpiBlock label="Open Positions" value={String(totalOpenPositions)} />
          <KpiBlock label="Active Agents" value={String(running)} valueClassName="font-mono text-lg text-emerald-400" />

          <div className="h-8 w-px bg-zinc-700" aria-hidden />
          <KpiBlock
            label="Agents"
            value={
              <span className="flex items-center gap-3 font-mono text-base">
                <span className="text-emerald-400" title="Running">
                  <CheckCircle className="inline w-4 h-4 mr-0.5" />
                  {running}
                </span>
                <span className="text-amber-400" title="Stale">
                  {stale}
                </span>
                <span className="text-red-400" title="Offline/Error">
                  <AlertTriangle className="inline w-4 h-4 mr-0.5" />
                  {offlineOrError}
                </span>
              </span>
            }
          />
          <KpiBlock
            label="Alerts"
            value={
              alertsCount > 0 ? (
                <span className="font-mono text-amber-400 flex items-center gap-1">
                  <Bell className="w-4 h-4" />
                  {alertsCount}
                </span>
              ) : (
                <span className="font-mono text-zinc-500">0</span>
              )
            }
          />
          <KpiBlock label="Exposure" value={<span className="font-mono text-zinc-500">—</span>} />

          <div className="h-8 w-px bg-zinc-700" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Supervisor</span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium border ${
                  supervisorStatus?.supervisorRunning
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}
                title={supervisorStatus?.supervisorRunning ? 'Supervisor running' : 'Supervisor not running'}
              >
                {supervisorStatus?.supervisorRunning ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {supervisorStatus?.supervisorRunning ? 'Active' : 'Inactive'}
              </span>
              {onSupervisorStart && !supervisorStatus?.supervisorRunning && (
                <button
                  type="button"
                  onClick={onSupervisorStart}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                  title="Start supervisor"
                  aria-label="Start supervisor"
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              {onSupervisorStop && supervisorStatus?.supervisorRunning && (
                <button
                  type="button"
                  onClick={onSupervisorStop}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Stop supervisor"
                  aria-label="Stop supervisor"
                >
                  <Square className="w-4 h-4" />
                </button>
              )}
            </div>
            {supervisorError && (
              <span className="text-xs text-amber-400 max-w-[220px] truncate block" title={supervisorError}>
                {supervisorError}
              </span>
            )}
          </div>

          {config?.killSwitchActive && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30">
              Kill switch ON
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
