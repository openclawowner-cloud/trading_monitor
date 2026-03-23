/**
 * Pre-submit style validation using WOO instrument metadata (string-safe, no decimal.js).
 */
import type { WooInstrument, WooInstrumentRules } from '../types';

export function extractRulesFromInstrument(row: WooInstrument | null | undefined): WooInstrumentRules {
  if (!row || typeof row.symbol !== 'string') {
    return {
      symbol: '',
      baseTick: null,
      quoteTick: null,
      baseMin: null,
      baseMax: null,
      minNotional: null
    };
  }
  const s = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  return {
    symbol: row.symbol,
    baseTick: s(row.baseTick),
    quoteTick: s(row.quoteTick),
    baseMin: s(row.baseMin),
    baseMax: s(row.baseMax),
    minNotional: s(row.minNotional)
  };
}

function decimalPlaces(s: string): number {
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Normalizes to non-negative decimal string without leading +; null if invalid. */
export function normalizePositiveDecimalString(raw: string): string | null {
  let s = raw.trim().replace(/^\+/, '');
  if (!s || s === '.') return null;
  if (s.startsWith('-')) return null;
  if (s.startsWith('.')) s = `0${s}`;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [intPart, frac = ''] = s.split('.');
  const intClean = intPart.replace(/^0+(?=\d)/, '') || '0';
  const fracTrim = frac.replace(/0+$/, '');
  return fracTrim ? `${intClean}.${fracTrim}` : intClean;
}

function toScaledInt(decimal: string, targetScale: number): bigint | null {
  const n = normalizePositiveDecimalString(decimal);
  if (n === null) return null;
  const [intPart, frac = ''] = n.split('.');
  const fracPadded = (frac + '0'.repeat(targetScale)).slice(0, targetScale);
  const combined = intPart + fracPadded;
  if (!/^\d+$/.test(combined)) return null;
  return BigInt(combined);
}

function fromScaledInt(value: bigint, scale: number): string {
  if (scale <= 0) return value.toString();
  const neg = value < 0n;
  const v = neg ? -value : value;
  const s = v.toString().padStart(scale + 1, '0');
  const split = Math.max(0, s.length - scale);
  const intPart = s.slice(0, split).replace(/^0+(?=\d)/, '') || '0';
  const fracPart = s.slice(split).replace(/0+$/, '');
  const body = fracPart ? `${intPart}.${fracPart}` : intPart;
  return neg ? `-${body}` : body;
}

/** Round positive decimal to nearest step (half-up) in integer scaled space. */
function roundToStepNearestScaled(priceInt: bigint, stepInt: bigint): bigint {
  if (stepInt <= 0n) return priceInt;
  const half = stepInt / 2n;
  return ((priceInt + half) / stepInt) * stepInt;
}

function roundToStepFloorScaled(priceInt: bigint, stepInt: bigint): bigint {
  if (stepInt <= 0n) return priceInt;
  return (priceInt / stepInt) * stepInt;
}

export function roundPriceToTick(price: string, rules: WooInstrumentRules): string | null {
  const tick = rules.quoteTick;
  if (!tick) return normalizePositiveDecimalString(price);
  const p = normalizePositiveDecimalString(price);
  const t = normalizePositiveDecimalString(tick);
  if (p === null || t === null) return null;
  const S = Math.max(decimalPlaces(p), decimalPlaces(t));
  const pi = toScaledInt(p, S);
  const ti = toScaledInt(t, S);
  if (pi === null || ti === null || ti === 0n) return p;
  const rounded = roundToStepNearestScaled(pi, ti);
  return fromScaledInt(rounded, S);
}

export function roundQtyToStep(qty: string, rules: WooInstrumentRules): string | null {
  const step = rules.baseTick;
  if (!step) return normalizePositiveDecimalString(qty);
  const q = normalizePositiveDecimalString(qty);
  const st = normalizePositiveDecimalString(step);
  if (q === null || st === null) return null;
  const S = Math.max(decimalPlaces(q), decimalPlaces(st));
  const qi = toScaledInt(q, S);
  const si = toScaledInt(st, S);
  if (qi === null || si === null || si === 0n) return q;
  const rounded = roundToStepFloorScaled(qi, si);
  return fromScaledInt(rounded, S);
}

/** (price * qty) as decimal string at scale = dp(price)+dp(qty). */
export function multiplyDecimalStrings(price: string, qty: string): string | null {
  const p = normalizePositiveDecimalString(price);
  const q = normalizePositiveDecimalString(qty);
  if (p === null || q === null) return null;
  const sp = decimalPlaces(p);
  const sq = decimalPlaces(q);
  const pi = toScaledInt(p, sp);
  const qi = toScaledInt(q, sq);
  if (pi === null || qi === null) return null;
  const prod = pi * qi;
  return fromScaledInt(prod, sp + sq);
}

/** Unsigned decimal compare: -1 | 0 | 1 */
export function compareDecimalStrings(a: string, b: string): number | null {
  const x = normalizePositiveDecimalString(a);
  const y = normalizePositiveDecimalString(b);
  if (x === null || y === null) return null;
  const S = Math.max(decimalPlaces(x), decimalPlaces(y));
  const xi = toScaledInt(x, S);
  const yi = toScaledInt(y, S);
  if (xi === null || yi === null) return null;
  if (xi < yi) return -1;
  if (xi > yi) return 1;
  return 0;
}

export interface MinNotionalValidation {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  notional?: string;
  minNotional?: string;
}

export function validateMinNotional(
  price: string,
  qty: string,
  rules: WooInstrumentRules
): MinNotionalValidation {
  const min = rules.minNotional;
  if (!min || !min.trim()) {
    return { ok: true, skipped: true };
  }
  const notional = multiplyDecimalStrings(price, qty);
  if (notional === null) {
    return { ok: false, skipped: false, reason: 'invalid_price_or_qty' };
  }
  const cmp = compareDecimalStrings(notional, min);
  if (cmp === null) {
    return { ok: false, skipped: false, reason: 'compare_failed' };
  }
  if (cmp < 0) {
    return {
      ok: false,
      skipped: false,
      reason: 'below_min_notional',
      notional,
      minNotional: min
    };
  }
  return { ok: true, skipped: false, notional, minNotional: min };
}

export interface NormalizedOrderInput {
  priceRounded: string | null;
  qtyRounded: string | null;
  minNotional: MinNotionalValidation;
  errors: string[];
}

/** Single helper combining tick rounding + min-notional check (no orders sent). */
export function normalizeOrderInput(
  price: string,
  qty: string,
  rules: WooInstrumentRules
): NormalizedOrderInput {
  const errors: string[] = [];
  const priceRounded = roundPriceToTick(price, rules);
  const qtyRounded = roundQtyToStep(qty, rules);
  if (priceRounded === null) errors.push('invalid_price');
  if (qtyRounded === null) errors.push('invalid_qty');
  const p = priceRounded ?? price;
  const q = qtyRounded ?? qty;
  const minNotional = validateMinNotional(p, q, rules);
  if (!minNotional.ok && !minNotional.skipped) {
    errors.push(minNotional.reason || 'min_notional');
  }
  return { priceRounded, qtyRounded, minNotional, errors };
}
