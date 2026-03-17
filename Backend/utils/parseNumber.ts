export function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function parsePrice(value: unknown): number {
  const n = parseNumber(value);
  return n >= 0 ? n : 0;
}
