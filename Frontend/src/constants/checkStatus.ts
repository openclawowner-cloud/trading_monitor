/**
 * Shared styles and labels for reconciliation/check status (OK / Fail / Mismatch).
 * Use for Overview, Risk, Diagnostics, and Reconciliation so status is consistent.
 */

export type CheckStatusVariant = 'position' | 'cash' | 'pnl' | 'generic';

const OK_CLASS = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
const FAIL_AMBER_CLASS = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
const FAIL_RED_CLASS = 'bg-red-500/20 text-red-400 border-red-500/30';

export function getCheckStatusStyle(ok: boolean, variant: CheckStatusVariant = 'generic'): string {
  if (ok) return OK_CLASS;
  return variant === 'position' ? FAIL_RED_CLASS : FAIL_AMBER_CLASS;
}

export function getCheckStatusLabel(ok: boolean, variant: CheckStatusVariant = 'generic'): string {
  if (ok) return 'OK';
  return variant === 'position' ? 'Mismatch' : 'Fail';
}
