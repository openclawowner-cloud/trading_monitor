const PLACEHOLDER = '—';

/**
 * Format a PnL value with sign and 2 decimals; "—" if invalid.
 */
export function formatPnl(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return PLACEHOLDER;
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

/**
 * Format as currency; "—" if invalid.
 */
export function formatCurrency(
  value: number | null | undefined,
  options?: { decimals?: number }
): string {
  if (value == null || !Number.isFinite(value)) return PLACEHOLDER;
  const decimals = options?.decimals ?? 2;
  return `$${value.toFixed(decimals)}`;
}

/**
 * Format as percentage; "—" if invalid.
 */
export function formatPercent(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value == null || !Number.isFinite(value)) return PLACEHOLDER;
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format price with sensible decimals (e.g. 4 for crypto); "—" if invalid.
 */
export function formatPrice(
  value: number | null | undefined,
  decimals: number = 4
): string {
  if (value == null || !Number.isFinite(value)) return PLACEHOLDER;
  return value.toFixed(decimals);
}

/**
 * Format timestamp; "—" if missing.
 */
export function formatTimestamp(
  ts: string | number | null | undefined,
  style: 'datetime' | 'time' | 'iso' = 'datetime'
): string {
  if (ts == null || ts === '') return PLACEHOLDER;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return PLACEHOLDER;
  if (style === 'iso') return date.toISOString();
  if (style === 'time') return date.toLocaleTimeString();
  return date.toLocaleString();
}

/**
 * Generic number format with fixed decimals; "—" if not finite.
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number
): string {
  if (value == null || !Number.isFinite(value)) return PLACEHOLDER;
  return value.toFixed(decimals);
}
