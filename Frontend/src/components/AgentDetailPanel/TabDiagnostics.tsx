import React from 'react';
import type { AgentDetailResponse } from '../../types/api';

interface TabDiagnosticsProps {
  detail: AgentDetailResponse;
}

export function TabDiagnostics({ detail }: TabDiagnosticsProps) {
  const status = detail.status as Record<string, unknown> | null;
  const state = detail.state as Record<string, unknown> | null;

  const statusTs = status?.timestamp != null ? new Date(Number(status.timestamp)).toISOString() : '—';
  const stateTs = state?.timestamp != null ? new Date(Number(state.timestamp)).toISOString() : '—';

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Telemetry timestamps</h3>
        <dl className="grid gap-2">
          <dt className="text-zinc-500">latest_status</dt>
          <dd className="font-mono text-zinc-200">{statusTs}</dd>
          <dt className="text-zinc-500">state_timestamp</dt>
          <dd className="font-mono text-zinc-200">{stateTs}</dd>
        </dl>
      </section>
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Reconciliation</h3>
        <dl className="grid gap-2">
          <dt className="text-zinc-500">Position check</dt>
          <dd className="font-mono text-zinc-200">{detail.reconciliation.positionOk ? 'OK' : 'Mismatch'}</dd>
          <dt className="text-zinc-500">Cash check</dt>
          <dd className="font-mono text-zinc-200">{detail.reconciliation.cashOk ? 'OK' : 'Fail'}</dd>
          <dt className="text-zinc-500">PnL check</dt>
          <dd className="font-mono text-zinc-200">{detail.reconciliation.pnlOk ? 'OK' : 'Fail'}</dd>
        </dl>
      </section>
      {detail.reconciliation.checks.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Checks</h3>
          <ul className="space-y-1">
            {detail.reconciliation.checks.map((c) => (
              <li key={c.name} className={`text-xs font-mono ${c.ok ? 'text-zinc-400' : 'text-amber-400'}`}>
                {c.name}: {c.detail}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
