import React, { useState } from 'react';
import type { AgentDetailResponse } from '../../types/api';
import { formatTimestamp } from '../../utils/format';

interface TabDiagnosticsProps {
  detail: AgentDetailResponse;
}

function Section({
  title,
  children,
  className = ''
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 ${className}`}>
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors"
      >
        {title}
        <span className="text-zinc-500">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-0 border-t border-zinc-800">{children}</div>}
    </div>
  );
}

export function TabDiagnostics({ detail }: TabDiagnosticsProps) {
  const status = detail.status as Record<string, unknown> | null;
  const state = detail.state as Record<string, unknown> | null;
  const { reconciliation } = detail;

  const statusTs = status?.timestamp;
  const stateTs = state?.timestamp;

  const riskChecks = reconciliation.checks.filter((c) =>
    c.name.toLowerCase().includes('risk')
  );
  const consistencyChecks = reconciliation.checks.filter(
    (c) =>
      !c.name.toLowerCase().includes('risk') &&
      (c.name.toLowerCase().includes('position') ||
        c.name.toLowerCase().includes('cash') ||
        c.name.toLowerCase().includes('pnl') ||
        c.name.toLowerCase().includes('equity'))
  );
  const otherChecks = reconciliation.checks.filter(
    (c) =>
      !riskChecks.includes(c) && !consistencyChecks.includes(c)
  );

  return (
    <div className="space-y-4 text-sm">
      <Section title="Telemetry timestamps">
        <dl className="grid gap-2">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">latest_status</dt>
            <dd className="font-mono text-zinc-200 text-right text-xs">
              {formatTimestamp(statusTs as string | number | undefined, 'iso')}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">state_timestamp</dt>
            <dd className="font-mono text-zinc-200 text-right text-xs">
              {formatTimestamp(stateTs as string | number | undefined, 'iso')}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Reconciliation summary">
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              reconciliation.positionOk
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            Position: {reconciliation.positionOk ? 'OK' : 'Mismatch'}
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              reconciliation.cashOk
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            Cash: {reconciliation.cashOk ? 'OK' : 'Fail'}
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              reconciliation.pnlOk
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            PnL: {reconciliation.pnlOk ? 'OK' : 'Fail'}
          </span>
        </div>
      </Section>

      {consistencyChecks.length > 0 && (
        <Section title="Consistency checks">
          <ul className="space-y-2">
            {consistencyChecks.map((c) => (
              <li
                key={c.name}
                className={`text-xs font-mono ${c.ok ? 'text-zinc-400' : 'text-amber-400'}`}
              >
                <span className="font-medium">{c.name}</span>: {c.detail}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {riskChecks.length > 0 && (
        <Section title="Risk checks">
          <ul className="space-y-2">
            {riskChecks.map((c) => (
              <li
                key={c.name}
                className={`text-xs font-mono ${c.ok ? 'text-zinc-400' : 'text-amber-400'}`}
              >
                <span className="font-medium">{c.name}</span>: {c.detail}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {otherChecks.length > 0 && (
        <Section title="Other checks">
          <ul className="space-y-2">
            {otherChecks.map((c) => (
              <li
                key={c.name}
                className={`text-xs font-mono ${c.ok ? 'text-zinc-400' : 'text-amber-400'}`}
              >
                <span className="font-medium">{c.name}</span>: {c.detail}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Raw debug">
        <div className="space-y-3">
          <Collapsible title="Status payload">
            <pre className="text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all">
              {status != null
                ? JSON.stringify(status, null, 2)
                : 'null'}
            </pre>
          </Collapsible>
          <Collapsible title="State payload">
            <pre className="text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all">
              {state != null
                ? JSON.stringify(state, null, 2)
                : 'null'}
            </pre>
          </Collapsible>
        </div>
      </Section>
    </div>
  );
}
