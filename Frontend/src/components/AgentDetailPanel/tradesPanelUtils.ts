import type { AgentDetailResponse } from '../../types/api';

/** Display placeholder for missing trade fields (must match previous TabTrades behavior). */
export const TRADES_PANEL_PLACEHOLDER = '—';

export type TradeRecord = {
  id?: string;
  timestamp?: string | number;
  symbol?: string;
  pair?: string;
  side?: string;
  qty?: number;
  price?: number;
  fill_id?: string;
  order_id?: string;
  fee?: number;
  pnl?: number;
  realizedPnl?: number;
  realized_pnl?: number;
  event_type?: string;
  reason?: string;
  strategy?: string;
};

/** Read PnL from a trade using common field names (backend/telemetry may use different keys). */
export function getTradePnl(t: TradeRecord): number | null {
  const raw =
    t.pnl ??
    (t as Record<string, unknown>).realizedPnl ??
    (t as Record<string, unknown>).realized_pnl ??
    (t as Record<string, unknown>).realized_pnl_impact;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getTradesFromDetail(detail: AgentDetailResponse | null | undefined): TradeRecord[] {
  if (detail == null) return [];
  const state = detail.state as Record<string, unknown> | null | undefined;
  const status = detail.status as Record<string, unknown> | null | undefined;
  const raw = state?.trades ?? status?.trades;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === 'object' && item !== null ? (item as TradeRecord) : null))
    .filter((t): t is TradeRecord => t != null);
}

export function tradeRowKey(t: TradeRecord, index: number): string {
  const id = t.id != null && String(t.id).trim() !== '' ? String(t.id) : '';
  if (id) return `id:${id}`;
  const ts = t.timestamp != null ? String(t.timestamp) : 'x';
  const sym = String(t.pair ?? t.symbol ?? 'x');
  const side = String(t.side ?? 'x');
  return `fb:${ts}:${sym}:${side}:${index}`;
}

export function finiteNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function trimStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** reason → strategy → [event_type]; title lists whatever is present. */
export function tradeSignalDisplay(t: TradeRecord): {
  text: string;
  title: string;
  isEventFallback: boolean;
} {
  const ph = TRADES_PANEL_PLACEHOLDER;
  const reason = trimStr(t.reason);
  const strategy = trimStr(t.strategy);
  const ev = trimStr(t.event_type);
  const titleBits = [reason, strategy, ev].filter(Boolean);
  const title = titleBits.length ? titleBits.join(' · ') : '';
  let text = ph;
  if (reason) text = reason;
  else if (strategy) text = strategy;
  else if (ev) text = `[${ev}]`;
  return {
    text,
    title: title || text,
    isEventFallback: Boolean(ev && !reason && !strategy)
  };
}

export function tradeTimestampMs(t: TradeRecord): number {
  try {
    return t.timestamp != null ? new Date(t.timestamp as string | number).getTime() : 0;
  } catch {
    return 0;
  }
}

export type TradesSortOrder = 'newest' | 'oldest';

export function sortTradesByTimestamp(list: readonly TradeRecord[], order: TradesSortOrder): TradeRecord[] {
  const out = [...list];
  out.sort((a, b) => {
    const ta = tradeTimestampMs(a);
    const tb = tradeTimestampMs(b);
    return order === 'newest' ? tb - ta : ta - tb;
  });
  return out;
}

/** `queryLowerTrimmed` should be `search.trim().toLowerCase()`; empty string matches all. */
export function matchesTradeSearch(t: TradeRecord, queryLowerTrimmed: string): boolean {
  if (!queryLowerTrimmed) return true;
  const q = queryLowerTrimmed;
  return (
    (t.symbol ?? '').toLowerCase().includes(q) ||
    (t.pair ?? '').toLowerCase().includes(q) ||
    (t.side ?? '').toLowerCase().includes(q) ||
    (t.fill_id ?? '').toLowerCase().includes(q) ||
    (t.order_id ?? '').toLowerCase().includes(q) ||
    String(t.id ?? '').toLowerCase().includes(q) ||
    trimStr(t.reason).toLowerCase().includes(q) ||
    trimStr(t.strategy).toLowerCase().includes(q) ||
    trimStr(t.event_type).toLowerCase().includes(q)
  );
}
