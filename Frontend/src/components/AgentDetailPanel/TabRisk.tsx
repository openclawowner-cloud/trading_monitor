import React from 'react';
import type { AgentDetailResponse } from '../../types/api';
import { formatTimestamp, formatCurrency } from '../../utils/format';
import { CheckStatusBadge } from '../CheckStatusBadge';

interface TabRiskProps {
  detail: AgentDetailResponse;
}

const PLACEHOLDER = '—';

/** Parse "Exposure: X, Limit: Y" from risk_exposure check detail. */
function parseRiskExposure(checks: { name: string; detail: string }[]): { exposure: number | null; limit: number | null } {
  const risk = checks.find((c) => c.name.toLowerCase().includes('risk_exposure'));
  if (!risk?.detail) return { exposure: null, limit: null };
  const match = risk.detail.match(/Exposure:\s*([\d.]+).*Limit:\s*([\d.]+)/i);
  if (!match) return { exposure: null, limit: null };
  const exposure = parseFloat(match[1]);
  const limit = parseFloat(match[2]);
  return {
    exposure: Number.isFinite(exposure) ? exposure : null,
    limit: Number.isFinite(limit) ? limit : null
  };
}

function RiskRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-zinc-800/50 last:border-0">
      <span className="text-zinc-500 text-sm">{label}</span>
      <span className="font-mono text-zinc-200 text-sm">{value}</span>
    </div>
  );
}

export function TabRisk({ detail }: TabRiskProps) {
  const { reconciliation } = detail;
  const { exposure, limit } = parseRiskExposure(reconciliation.checks);
  const reconOk = reconciliation.positionOk && reconciliation.cashOk && reconciliation.pnlOk;

  return (
    <div className="space-y-5 text-sm">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Risk overview
        </h3>
        <div className="space-y-0">
          <RiskRow
            label="Current exposure"
            value={exposure != null ? formatCurrency(exposure) : PLACEHOLDER}
          />
          <RiskRow
            label="Exposure limit"
            value={limit != null ? formatCurrency(limit) : PLACEHOLDER}
          />
          <RiskRow label="Fees today" value={PLACEHOLDER} />
          <RiskRow label="Slippage today" value={PLACEHOLDER} />
          <RiskRow label="Daily PnL" value={PLACEHOLDER} />
          <RiskRow label="Drawdown today" value={PLACEHOLDER} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Status
        </h3>
        <div className="space-y-0">
          <RiskRow
            label="Reconciliation"
            value={<CheckStatusBadge ok={reconOk} variant="generic" label={reconOk ? 'OK' : 'Mismatch or fail'} />}
          />
          <RiskRow
            label="Data freshness (state)"
            value={formatTimestamp(reconciliation.stateTimestamp, 'datetime')}
          />
          <RiskRow
            label="Data freshness (market)"
            value={formatTimestamp(reconciliation.marketPriceTimestamp, 'datetime')}
          />
        </div>
      </section>
    </div>
  );
}
