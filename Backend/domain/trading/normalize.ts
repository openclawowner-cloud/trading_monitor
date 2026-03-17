export function normPair(pair: string): string {
  if (!pair) return '';
  const upper = pair.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (upper.endsWith('USDT')) {
    return upper.slice(0, -4) + '/USDT';
  }
  return pair;
}

export function normPairKey(pair: string): string {
  if (!pair) return '';
  return pair.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function pairKeyToDisplay(pairKey: string): string {
  if (pairKey.endsWith('USDT')) {
    return pairKey.slice(0, -4) + '/USDT';
  }
  return pairKey;
}

export function toBinanceSymbol(pair: string): string {
  return normPairKey(pair);
}
