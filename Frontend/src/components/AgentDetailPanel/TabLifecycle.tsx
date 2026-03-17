import React, { useState } from 'react';
import { Play, Square, RefreshCw, Archive, CheckCircle } from 'lucide-react';
import type { AgentListItem } from '../../types/api';
import { api } from '../../api/client';

interface TabLifecycleProps {
  agent: AgentListItem;
  onAction: () => void;
}

export function TabLifecycle({ agent, onAction }: TabLifecycleProps) {
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

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Lifecycle actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading !== null || agent.enabled}
            onClick={() => run('Enable', () => api.postEnable(agent.agentId))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" /> Enable
          </button>
          <button
            type="button"
            disabled={loading !== null || !agent.enabled}
            onClick={() => run('Disable', () => api.postDisable(agent.agentId))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Square className="w-4 h-4" /> Disable
          </button>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run('Reset', () => api.postReset(agent.agentId))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run('Restart via supervisor', () => api.postSupervisorRestart(agent.agentId))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" /> Restart (via supervisor)
          </button>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run('Validate', () => api.postValidate(agent.agentId))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4" /> Validate
          </button>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run('Archive', () => api.postArchive(agent.agentId))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-600 text-zinc-400 hover:bg-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Archive className="w-4 h-4" /> Archive
          </button>
        </div>
        {loading && <p className="text-zinc-500 text-xs mt-2">Running {loading}…</p>}
        {message && <p className="text-zinc-400 text-xs mt-2">{message}</p>}
      </section>
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Status</h3>
        <dl className="grid grid-cols-2 gap-2">
          <dt className="text-zinc-500">Enabled</dt>
          <dd className="font-mono text-zinc-200">{agent.enabled ? 'Yes' : 'No'}</dd>
          <dt className="text-zinc-500">Activity</dt>
          <dd className="font-mono text-zinc-200 capitalize">{agent.status}</dd>
        </dl>
      </section>
    </div>
  );
}
