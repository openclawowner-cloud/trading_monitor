import React from 'react';
import type { AgentDetailResponse } from '../../types/api';

interface TabReconciliationProps {
  detail: AgentDetailResponse;
}

export function TabReconciliation({ detail }: TabReconciliationProps) {
  const { reconciliation } = detail;

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Summary</h3>
        <dl className="grid grid-cols-2 gap-2">
          <dt className="text-zinc-500">Position match</dt>
          <dd className={reconciliation.positionOk ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>{reconciliation.positionOk ? 'OK' : 'Mismatch'}</dd>
          <dt className="text-zinc-500">Cash</dt>
          <dd className={reconciliation.cashOk ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>{reconciliation.cashOk ? 'OK' : 'Fail'}</dd>
          <dt className="text-zinc-500">PnL</dt>
          <dd className={reconciliation.pnlOk ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>{reconciliation.pnlOk ? 'OK' : 'Fail'}</dd>
        </dl>
      </section>
      {reconciliation.mismatchDetails && reconciliation.mismatchDetails.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Mismatch details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-2">Symbol</th>
                  <th className="py-2 pr-2">Shadow (fills) qty</th>
                  <th className="py-2 pr-2">Reported qty</th>
                  <th className="py-2 pr-2">Diff USD</th>
                  <th className="py-2 pr-2">Last fill</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.mismatchDetails.map((m) => (
                  <tr key={m.symbol} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-2 font-mono text-zinc-200">{m.symbol}</td>
                    <td className="py-2 pr-2 font-mono text-zinc-200">{m.fills_qty}</td>
                    <td className="py-2 pr-2 font-mono text-zinc-200">{m.reported_qty}</td>
                    <td className="py-2 pr-2 font-mono text-zinc-200">{m.diff_usd != null ? `$${m.diff_usd.toFixed(2)}` : '—'}</td>
                    <td className="py-2 pr-2 font-mono text-zinc-500 text-xs">{m.last_fill_id ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">All checks</h3>
        <ul className="space-y-1">
          {reconciliation.checks.map((c) => (
            <li key={c.name} className={`text-xs ${c.ok ? 'text-zinc-400' : 'text-amber-400'}`}>
              <span className="font-mono">{c.name}</span>: {c.detail}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
