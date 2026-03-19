import type { AgentDetailResponse } from '../../types/api';
import { backfillTradesPnLClient } from './backfillTradesPnLClient';

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
  decision_context?: import('../../types/api').TradeDecisionContext;
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
  const mapped = raw
    .map((item) => (typeof item === 'object' && item !== null ? (item as TradeRecord) : null))
    .filter((t): t is TradeRecord => t != null);
  return backfillTradesPnLClient(mapped);
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

const INTERVAL_SEC: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400
};

export function normalizeChartSymbol(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** First open position symbol, else last trade pair, else null. */
export function getDefaultChartSymbol(detail: AgentDetailResponse): string | null {
  const status = detail.status as Record<string, unknown> | null;
  const state = detail.state as Record<string, unknown> | null;
  const positions = (status?.positions ?? state?.positions ?? {}) as Record<string, unknown>;
  for (const [key, val] of Object.entries(positions)) {
    let qty = 0;
    if (key.endsWith('_qty')) qty = Number(val);
    else if (typeof val === 'object' && val !== null) {
      qty = Number((val as Record<string, unknown>).qty ?? 0);
    }
    if (qty > 1e-8) {
      const sym = key.endsWith('_qty') ? key.replace(/_qty$/i, '') : key;
      const n = normalizeChartSymbol(sym);
      if (n.length >= 6) return n;
    }
  }
  const trades = getTradesFromDetail(detail);
  for (let i = trades.length - 1; i >= 0; i--) {
    const n = normalizeChartSymbol(trades[i].pair ?? trades[i].symbol ?? '');
    if (n.length >= 6) return n;
  }
  return null;
}

export function alignTradeTimeToBar(tsMs: number, interval: string): number {
  const sec = INTERVAL_SEC[interval] ?? 60;
  const t = Math.floor(tsMs / 1000);
  return Math.floor(t / sec) * sec;
}

/** Distinct symbols from positions + trades for chart datalist. */
export function collectChartSymbolSuggestions(detail: AgentDetailResponse): string[] {
  const set = new Set<string>();
  const status = detail.status as Record<string, unknown> | null;
  const state = detail.state as Record<string, unknown> | null;
  const positions = (status?.positions ?? state?.positions ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(positions)) {
    if (key.endsWith('_qty')) set.add(normalizeChartSymbol(key.replace(/_qty$/i, '')));
    else set.add(normalizeChartSymbol(key));
  }
  for (const t of getTradesFromDetail(detail)) {
    set.add(normalizeChartSymbol(t.pair ?? t.symbol ?? ''));
  }
  return [...set].filter((s) => s.length >= 6).sort();
}

export function buildChartMarkers(
  trades: TradeRecord[],
  targetSymbol: string,
  interval: string
): import('../../types/api').ChartMarker[] {
  const sym = normalizeChartSymbol(targetSymbol);
  if (!sym) return [];
  type Row = { time: number; buys: string[]; sells: string[] };
  const buckets = new Map<number, Row>();
  for (const t of trades) {
    const p = normalizeChartSymbol(t.pair ?? t.symbol ?? '');
    if (p !== sym) continue;
    const ms = tradeTimestampMs(t);
    if (ms <= 0) continue;
    const time = alignTradeTimeToBar(ms, interval);
    const side = String(t.side ?? '').toLowerCase();
    const price = finiteNum(t.price);
    const qty = finiteNum(t.qty);
    const reason = trimStr(t.reason) || trimStr(t.strategy) || 'trade';
    const bit = `${reason} @${price != null ? price.toFixed(4) : '?'} ×${qty != null ? qty.toFixed(2) : '?'}`;
    let row = buckets.get(time);
    if (!row) {
      row = { time, buys: [], sells: [] };
      buckets.set(time, row);
    }
    if (side === 'buy') row.buys.push(bit);
    else if (side === 'sell') row.sells.push(bit);
  }
  const out: import('../../types/api').ChartMarker[] = [];
  for (const row of [...buckets.values()].sort((a, b) => a.time - b.time)) {
    if (row.buys.length) {
      const text = row.buys.length > 1 ? `B×${row.buys.length}` : row.buys[0]!.slice(0, 42);
      out.push({
        time: row.time,
        position: 'belowBar',
        color: '#22c55e',
        shape: 'arrowUp',
        text: text.length > 48 ? `${text.slice(0, 45)}…` : text
      });
    }
    if (row.sells.length) {
      const text = row.sells.length > 1 ? `S×${row.sells.length}` : row.sells[0]!.slice(0, 42);
      out.push({
        time: row.time,
        position: 'aboveBar',
        color: '#f87171',
        shape: 'arrowDown',
        text: text.length > 48 ? `${text.slice(0, 45)}…` : text
      });
    }
  }
  return out;
}

/** Decision log from state; returns array (may be empty). */
export function getDecisionLog(detail: AgentDetailResponse | null | undefined): import('../../types/api').LatestDecisionRecord[] {
  if (detail == null) return [];
  const state = detail.state as Record<string, unknown> | null | undefined;
  const raw = state?.decision_log;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is import('../../types/api').LatestDecisionRecord => typeof r === 'object' && r != null && typeof (r as { timestamp?: unknown }).timestamp === 'number')
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** Same logical decision (stable across detail refresh). */
export function isSameDecision(
  a: import('../../types/api').LatestDecisionRecord | null | undefined,
  b: import('../../types/api').LatestDecisionRecord | null | undefined
): boolean {
  if (a == null || b == null) return false;
  return a.timestamp === b.timestamp && (a.pair ?? '') === (b.pair ?? '');
}

/** Latest decision from status then state. */
export function getLatestDecision(detail: AgentDetailResponse | null | undefined): import('../../types/api').LatestDecisionRecord | null {
  if (detail == null) return null;
  const status = detail.status as Record<string, unknown> | null | undefined;
  const state = detail.state as Record<string, unknown> | null | undefined;
  const rec = (status?.latest_decision ?? state?.latest_decision) as import('../../types/api').LatestDecisionRecord | null | undefined;
  if (rec != null && typeof rec.timestamp === 'number' && typeof rec.action === 'string') return rec;
  return null;
}

/** Format decision/trade timestamp (ms) for display. */
export function formatDecisionTime(ts: number | string | null | undefined): string {
  if (ts == null) return TRADES_PANEL_PLACEHOLDER;
  const ms = typeof ts === 'number' ? ts : new Date(ts as string).getTime();
  if (!Number.isFinite(ms)) return TRADES_PANEL_PLACEHOLDER;
  const d = new Date(ms);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Format indicator number for debug panel; "—" if null/undefined/NaN. */
export function formatIndicatorValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return TRADES_PANEL_PLACEHOLDER;
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0)) return v.toExponential(4);
  return v.toFixed(6).replace(/\.?0+$/, '') || '0';
}

/** Human-readable boolean for context; "—" if null/undefined. */
export function formatContextBool(v: boolean | null | undefined): string {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return TRADES_PANEL_PLACEHOLDER;
}
