import React from 'react';
import { getCheckStatusStyle, getCheckStatusLabel, type CheckStatusVariant } from '../constants/checkStatus';

interface CheckStatusBadgeProps {
  ok: boolean;
  variant?: CheckStatusVariant;
  label?: string;
  className?: string;
}

/**
 * Badge for reconciliation/check status (OK / Fail / Mismatch).
 * Same look everywhere: Overview, Risk, Diagnostics, Reconciliation.
 */
export function CheckStatusBadge({ ok, variant = 'generic', label, className = '' }: CheckStatusBadgeProps) {
  const displayLabel = label ?? getCheckStatusLabel(ok, variant);
  const style = getCheckStatusStyle(ok, variant);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${style} ${className}`}
      title={displayLabel}
    >
      {displayLabel}
    </span>
  );
}
