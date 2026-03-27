import React, { useState } from 'react';
import { Play, Square, RefreshCw, Archive, CheckCircle } from 'lucide-react';
import type { AgentListItem } from '../../types/api';
import { api } from '../../api/client';
import { wooxClient } from '../../api/wooxClient';
import { wooRealClient } from '../../api/wooRealClient';
import { bybitClient } from '../../api/bybitClient';

interface TabLifecycleProps {
  agent: AgentListItem;
  onAction: () => void;
  dataSource?: 'binance' | 'woox' | 'woo_real' | 'bybit';
}

const btnBase =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export function TabLifecycle({ agent, onAction, dataSource = 'binance' }: TabLifecycleProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: string, fn: () => Promise<unknown>) => {
    setLoading(action);
    setMessage(null);
    try {
      await fn();
      setMessage(`${action} succeeded`);
      onAction();
    } catch (e) {
      setMessage(`${action} failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const busy = loading !== null;
  const isWoox = dataSource === 'woox';
  const isWooReal = dataSource === 'woo_real';
  const isBybit = dataSource === 'bybit';

  return (
    <div className="space-y-6 text-sm">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Status
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <dt className="text-zinc-500">Enabled</dt>
          <dd className="font-mono text-zinc-200">{agent.enabled ? 'Yes' : 'No'}</dd>
          <dt className="text-zinc-500">Activity</dt>
          <dd className="font-mono text-zinc-200 capitalize">{agent.status}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Primary actions
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || agent.enabled || isWoox}
            onClick={() =>
              run('Enable', () =>
                isWooReal
                  ? fetch(`/api/woo-real/agent/${encodeURIComponent(agent.agentId)}/enable`, {
                      method: 'POST'
                    }).then((r) => r.json())
                  : isBybit
                    ? fetch(`/api/bybit/agent/${encodeURIComponent(agent.agentId)}/enable`, {
                        method: 'POST'
                      }).then((r) => r.json())
                  : api.postEnable(agent.agentId)
              )
            }
            className={`${btnBase} bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30`}
          >
            <Play className="w-4 h-4" /> Enable
          </button>
          <button
            type="button"
            disabled={busy || !agent.enabled || isWoox}
            onClick={() =>
              run('Disable', () =>
                isWooReal
                  ? fetch(`/api/woo-real/agent/${encodeURIComponent(agent.agentId)}/disable`, {
                      method: 'POST'
                    }).then((r) => r.json())
                  : isBybit
                    ? fetch(`/api/bybit/agent/${encodeURIComponent(agent.agentId)}/disable`, {
                        method: 'POST'
                      }).then((r) => r.json())
                  : api.postDisable(agent.agentId)
              )
            }
            className={`${btnBase} bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30`}
          >
            <Square className="w-4 h-4" /> Disable
          </button>
          <button
            type="button"
            disabled={busy || isWoox}
            onClick={() =>
              run('Validate', () =>
                isWooReal
                  ? fetch(`/api/woo-real/agent/${encodeURIComponent(agent.agentId)}/validate`, {
                      method: 'POST'
                    }).then((r) => r.json())
                  : isBybit
                    ? fetch(`/api/bybit/agent/${encodeURIComponent(agent.agentId)}/validate`, {
                        method: 'POST'
                      }).then((r) => r.json())
                  : api.postValidate(agent.agentId)
              )
            }
            className={`${btnBase} bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30`}
          >
            <CheckCircle className="w-4 h-4" /> Validate
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Reset & restart
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || isWoox}
            onClick={() =>
              run('Soft reset', () =>
                isWooReal
                  ? fetch(`/api/woo-real/agent/${encodeURIComponent(agent.agentId)}/reset`, {
                      method: 'POST'
                    }).then((r) => r.json())
                  : isBybit
                    ? fetch(`/api/bybit/agent/${encodeURIComponent(agent.agentId)}/reset`, {
                        method: 'POST'
                      }).then((r) => r.json())
                  : api.postReset(agent.agentId)
              )
            }
            className={`${btnBase} bg-zinc-700 text-zinc-200 hover:bg-zinc-600 border border-zinc-600`}
          >
            <RefreshCw className="w-4 h-4" /> Soft reset
          </button>
          <button
            type="button"
            disabled={busy || isWoox}
            onClick={() =>
              run('Hard reset', () =>
                isWooReal
                  ? fetch(`/api/woo-real/agent/${encodeURIComponent(agent.agentId)}/reset-hard`, {
                      method: 'POST'
                    }).then((r) => r.json())
                  : isBybit
                    ? fetch(`/api/bybit/agent/${encodeURIComponent(agent.agentId)}/reset-hard`, {
                        method: 'POST'
                      }).then((r) => r.json())
                    : api.postResetHard(agent.agentId)
              )
            }
            className={`${btnBase} bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40`}
            title="Disable + verwijder paper state/trades/status"
          >
            <RefreshCw className="w-4 h-4" /> Hard reset
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run('Restart via supervisor', () =>
                isWoox
                  ? wooxClient.restartAgent(agent.agentId)
                  : isWooReal
                    ? wooRealClient.restartAgent(agent.agentId)
                    : isBybit
                      ? bybitClient.restartAgent(agent.agentId)
                    : api.postSupervisorRestart(agent.agentId)
              )
            }
            className={`${btnBase} bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 border border-violet-500/30`}
          >
            <RefreshCw className="w-4 h-4" /> Restart (via supervisor)
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
        <h3 className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-3">
          Destructive
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || isWoox}
            onClick={() =>
              run('Archive', () =>
                isWooReal
                  ? fetch(`/api/woo-real/agent/${encodeURIComponent(agent.agentId)}/archive`, {
                      method: 'POST'
                    }).then((r) => r.json())
                  : isBybit
                    ? fetch(`/api/bybit/agent/${encodeURIComponent(agent.agentId)}/archive`, {
                        method: 'POST'
                      }).then((r) => r.json())
                  : api.postArchive(agent.agentId)
              )
            }
            className={`${btnBase} bg-zinc-700/80 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-300 border border-zinc-600`}
          >
            <Archive className="w-4 h-4" /> Archive
          </button>
        </div>
      </section>

      {(loading || message) && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          {loading && (
            <p className="text-zinc-500 text-sm">Running {loading}…</p>
          )}
          {message && (
            <p className={`text-sm ${message.includes('failed') ? 'text-amber-400' : 'text-zinc-400'}`}>
              {message}
            </p>
          )}
        </div>
      )}
      {isWoox && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="text-zinc-400 text-sm">
            WOO lifecycle ondersteunt hier alleen restart via WOO supervisor; overige lifecycle-acties zijn uitgeschakeld.
          </p>
        </div>
      )}
    </div>
  );
}
