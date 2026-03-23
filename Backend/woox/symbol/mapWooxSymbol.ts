/**
 * Symbol mapping: internal compact / slash form ↔ WOO listing symbols (SPOT_*_USDT).
 * MVP: spot USDT only; PERP_* recognized for inverse mapping only.
 */
import type { WooListingKind, WooSymbolMappingResult } from '../types';

const RE_WOO_SPOT = /^SPOT_([A-Z0-9]+)_([A-Z0-9]+)$/i;
const RE_WOO_PERP = /^PERP_([A-Z0-9]+)_([A-Z0-9]+)$/i;

function normalizeToken(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Parse WOO-native symbol into structured form. */
export function fromWooSymbol(wooSymbol: string): WooSymbolMappingResult | null {
  const raw = wooSymbol.trim();
  const spot = raw.match(RE_WOO_SPOT);
  if (spot) {
    const base = spot[1].toUpperCase();
    const quote = spot[2].toUpperCase();
    return {
      wooSymbol: `SPOT_${base}_${quote}`,
      compact: `${base}${quote}`,
      slash: `${base}/${quote}`,
      base,
      quote,
      kind: 'spot'
    };
  }
  const perp = raw.match(RE_WOO_PERP);
  if (perp) {
    const base = perp[1].toUpperCase();
    const quote = perp[2].toUpperCase();
    return {
      wooSymbol: `PERP_${base}_${quote}`,
      compact: `${base}${quote}`,
      slash: `${base}/${quote}`,
      base,
      quote,
      kind: 'perp'
    };
  }
  return null;
}

/**
 * Map internal input to WOO spot symbol. Accepts SPOT_BTC_USDT, BTCUSDT, BTC/USDT, BTC-USDT.
 * Perps are not produced here (spot MVP).
 */
export function toWooSpotSymbol(input: string): WooSymbolMappingResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const existing = fromWooSymbol(trimmed);
  if (existing?.kind === 'spot') return existing;
  if (existing?.kind === 'perp') return null;

  let base: string;
  let quote: string;

  if (trimmed.includes('/') || trimmed.includes('-')) {
    const sep = trimmed.includes('/') ? '/' : '-';
    const parts = trimmed.split(sep).map((p) => p.trim().toUpperCase()).filter(Boolean);
    if (parts.length !== 2) return null;
    base = normalizeToken(parts[0]);
    quote = normalizeToken(parts[1]);
  } else {
    const u = trimmed.toUpperCase();
    const m = u.match(/^([A-Z0-9]{2,})(USDT|USDC|USD)$/);
    if (!m) return null;
    base = m[1];
    quote = m[2];
  }

  if (!base || !quote) return null;

  const wooSymbol = `SPOT_${base}_${quote}`;
  return {
    wooSymbol,
    compact: `${base}${quote}`,
    slash: `${base}/${quote}`,
    base,
    quote,
    kind: 'spot'
  };
}
