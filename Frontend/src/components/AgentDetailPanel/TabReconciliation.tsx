import React from 'react';
import type { AgentDetailResponse, ReconCheck } from '../../types/api';
import { formatCurrency } from '../../utils/format';

interface TabReconciliationProps {
  detail: AgentDetailResponse;
}

function CheckRow({ check }: { check: ReconCheck; key?: string }) {
  const isFail = !check.ok;
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
          <p className={`mt-0.5 text-xs ${isFail ? 'text-amber-400' : 'text-zinc-500'}`}>
            {check.detail}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
            check.ok
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}
        >
          {check.ok ? 'OK' : 'Fail'}
        </span>
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
        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
              reconciliation.positionOk
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            Position: {reconciliation.positionOk ? 'OK' : 'Mismatch'}
          </span>
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
              reconciliation.cashOk
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            Cash: {reconciliation.cashOk ? 'OK' : 'Fail'}
          </span>
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
              reconciliation.pnlOk
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            PnL: {reconciliation.pnlOk ? 'OK' : 'Fail'}
          </span>
        </div>
      </section>

      {reconciliation.mismatchDetails && reconciliation.mismatchDetails.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
            Mismatch details
          </h3>
          <div className="overflow-x-auto rounded-lg border border-amber-500/30 bg-amber-500/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs font-medium uppercase tracking-wider border-b border-zinc-800">
                  <th className="py-3 pl-3 pr-2 text-left">Symbol</th>
                  <th className="py-3 pl-2 pr-3 text-right">Shadow (fills) qty</th>
                  <th className="py-3 pl-2 pr-3 text-right">Reported qty</th>
                  <th className="py-3 pl-2 pr-3 text-right">Diff USD</th>
                  <th className="py-3 pl-2 pr-3 text-left">Last fill</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.mismatchDetails.map((m) => (
                  <tr key={m.symbol} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-2 pl-3 pr-2 font-mono text-zinc-200">{m.symbol}</td>
                    <td className="py-2 pl-2 pr-3 font-mono text-zinc-200 text-right">
                      {m.fills_qty}
                    </td>
                    <td className="py-2 pl-2 pr-3 font-mono text-zinc-200 text-right">
                      {m.reported_qty}
                    </td>
                    <td className="py-2 pl-2 pr-3 font-mono text-zinc-200 text-right">
                      {m.diff_usd != null ? formatCurrency(m.diff_usd) : '—'}
                    </td>
                    <td className="py-2 pl-2 pr-3 font-mono text-zinc-500 text-xs">
                      {m.last_fill_id ?? '—'}
                    </td>
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
