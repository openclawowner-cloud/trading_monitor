import React from 'react';
import type { AgentStatus } from '../types/api';

const STATUS_OPTIONS: { value: AgentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'stale', label: 'Stale' },
  { value: 'offline', label: 'Offline' },
  { value: 'error', label: 'Error' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'archived', label: 'Archived' }
];

export interface FilterState {
  status: AgentStatus | 'all';
  mode: 'all' | 'paper' | 'live';
  search: string;
  hideOfflineOver24h: boolean;
}

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  resultCount: number;
  totalCount: number;
}

export function FilterBar({ filters, onFiltersChange, resultCount, totalCount }: FilterBarProps) {
  const set = (patch: Partial<FilterState>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  const hasActiveFilters = filters.status !== 'all' || filters.mode !== 'all' || filters.search.trim() !== '' || filters.hideOfflineOver24h;

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/30 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 uppercase tracking-wider">Status</label>
          <select
            value={filters.status}
            onChange={(e) => set({ status: e.target.value as FilterState['status'] })}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 uppercase tracking-wider">Mode</label>
          <select
            value={filters.mode}
            onChange={(e) => set({ mode: e.target.value as FilterState['mode'] })}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200"
          >
            <option value="all">All</option>
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
        </div>
        <input
          type="search"
          placeholder="Search name / id"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 min-w-[180px]"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={filters.hideOfflineOver24h}
            onChange={(e) => set({ hideOfflineOver24h: e.target.checked })}
            className="rounded border-zinc-600"
          />
          Hide offline &gt; 24h
        </label>
        {hasActiveFilters && (
          <span className="text-xs text-zinc-500">
            Showing {resultCount} of {totalCount} agents
          </span>
        )}
      </div>
    </div>
  );
}
