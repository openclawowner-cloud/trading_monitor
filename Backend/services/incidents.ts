export type IncidentType =
  | 'no_files_found'
  | 'process_dead'
  | 'timestamp_parse_failed'
  | 'telemetry_dropped_spike'
  | 'heartbeat_missing'
  | 'file_stale'
  | 'file_offline'
  | 'process_stuck_or_not_writing'
  | 'path_mismatch'
  | 'registry_mismatch'
  | 'reconciliation_mismatch'
  | 'pnl_consistency_failure'
  | 'close_invariant_failure';

export interface Incident {
  type: IncidentType;
  agentId?: string;
  reason: string;
  impact: string;
  recommendedAction: string;
  symbols?: string[];
  lastHealthyTimestamp?: string | number;
  meta?: Record<string, unknown>;
}

export function buildIncidentsForAgent(
  agentId: string,
  opts: {
    hasTelemetry: boolean;
    status: string;
    reconciliationOk: boolean;
    lastModifiedMs: number | null;
    staleThresholdMs: number;
    mismatchDetails?: Array<{ symbol: string }>;
  }
): Incident[] {
  const incidents: Incident[] = [];

  if (!opts.hasTelemetry) {
    incidents.push({
      type: 'no_files_found',
      agentId,
      reason: 'No status or state files found',
      impact: 'Cannot compute positions or PnL',
      recommendedAction: 'Check telemetry path and agent output directory.'
    });
    return incidents;
  }

  if (opts.lastModifiedMs !== null && opts.lastModifiedMs < Date.now() - opts.staleThresholdMs) {
    const ms = Number(opts.lastModifiedMs);
    const lastStr = Number.isFinite(ms)
      ? new Date(ms).toISOString()
      : String(opts.lastModifiedMs);
    incidents.push({
      type: opts.status === 'offline' ? 'file_offline' : 'file_stale',
      agentId,
      reason: `Telemetry older than threshold (last: ${lastStr})`,
      impact: 'Data may be outdated',
      recommendedAction: 'Restart agent or check process.'
    });
  }

  if (!opts.reconciliationOk) {
    incidents.push({
      type: 'reconciliation_mismatch',
      agentId,
      reason: 'Position or PnL mismatch between reported and shadow',
      impact: 'State may be inconsistent',
      recommendedAction: 'Review reconciliation tab and consider reset.',
      symbols: opts.mismatchDetails?.map((m) => m.symbol)
    });
  }

  return incidents;
}
