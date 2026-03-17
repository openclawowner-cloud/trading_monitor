import type { AgentStatus } from '../types/api';

export const STATUS_STYLES: Record<AgentStatus, string> = {
  running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  stale: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  offline: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  disabled: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  archived: 'bg-zinc-900 text-zinc-600 border-zinc-800'
};
