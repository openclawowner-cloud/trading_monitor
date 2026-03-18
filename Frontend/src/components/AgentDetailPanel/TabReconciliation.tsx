import React from 'react';
import type { AgentDetailResponse, ReconCheck } from '../../types/api';
import { formatCurrency, formatTimestamp } from '../../utils/format';
import { CheckStatusBadge } from '../CheckStatusBadge';

interface TabReconciliationProps {
  detail: AgentDetailResponse;
}

function getCheckVariant(name: string): 'position' | 'cash' | 'pnl' | 'generic' {
  const n = name.toLowerCase();
  if (n.includes('position')) return 'position';
  if (n.includes('cash')) return 'cash';
  if (n.includes('pnl')) return 'pnl';
  return 'generic';
}

function CheckRow({ check }: { check: ReconCheck; key?: string }) {
  const isFail = !check.ok;
  const variant = getCheckVariant(check.name);
  return (
    <div
      className={`rounded-lg border p-3 ${
        isFail
          ? 'border-amber-500/50 bg-amber-500/5'
          : 'border-zinc-800 bg-zinc-900/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-sm text-zinc-200">{check.name}</span>
          <p className={`mt-0.5 text-xs break-words ${isFail ? 'text-amber-400' : 'text-zinc-500'}`}>
            {check.detail}
          </p>
        </div>
        <CheckStatusBadge ok={check.ok} variant={variant} className="shrink-0" />
      </div>
    </div>
  );
}

export function TabReconciliation({ detail }: TabReconciliationProps) {
  const { reconciliation } = detail;

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Summary
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <CheckStatusBadge ok={reconciliation.positionOk} variant="position" label={reconciliation.positionOk ? 'OK' : 'Mismatch'} />
          <CheckStatusBadge ok={reconciliation.cashOk} variant="cash" />
          <CheckStatusBadge ok={reconciliation.pnlOk} variant="pnl" />
        </div>
        {(reconciliation.stateTimestamp != null || reconciliation.marketPriceTimestamp != null) && (
          <p className="text-zinc-500 text-xs mt-2">
            As of: {formatTimestamp(reconciliation.stateTimestamp ?? reconciliation.marketPriceTimestamp, 'datetime')}
          </p>
        )}
      </section>

      {reconciliation.mismatchDetails && reconciliation.mismatchDetails.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
            Mismatch details
          </h3>
          <div className="min-w-0 overflow-x-auto rounded-lg border border-amber-500/30 bg-amber-500/5">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-zinc-500 text-xs font-medium uppercase tracking-wider border-b border-zinc-800">
                  <th className="py-3 pl-2 pr-1 text-left w-24">Symbol</th>
                  <th className="py-3 pl-1 pr-2 text-right">Shadow</th>
                  <th className="py-3 pl-1 pr-2 text-right">Reported</th>
                  <th className="py-3 pl-1 pr-2 text-right">Diff USD</th>
                  <th className="py-3 pl-1 pr-2 text-left w-20">Last fill</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.mismatchDetails.map((m) => (
                  <tr key={m.symbol} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-1.5 pl-2 pr-1 font-mono text-zinc-200 truncate" title={m.symbol}>{m.symbol}</td>
                    <td className="py-1.5 pl-1 pr-2 font-mono text-zinc-200 text-right">{m.fills_qty}</td>
                    <td className="py-1.5 pl-1 pr-2 font-mono text-zinc-200 text-right">{m.reported_qty}</td>
                    <td className="py-1.5 pl-1 pr-2 font-mono text-zinc-200 text-right">{m.diff_usd != null ? formatCurrency(m.diff_usd) : '—'}</td>
                    <td className="py-1.5 pl-1 pr-2 font-mono text-zinc-500 text-xs truncate" title={m.last_fill_id ?? undefined}>{m.last_fill_id ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          All checks
        </h3>
        <div className="space-y-2">
          {reconciliation.checks.map((c) => (
            <CheckRow key={c.name} check={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
