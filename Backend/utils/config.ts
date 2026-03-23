import path from 'path';
import { fileURLToPath } from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '..', '..');
/** Binance / main supervisor tree (`agents.json`, agent folders). Never the WOO tree. */
const defaultTradingLiveRoot = path.join(repoRoot, 'trading-live');
const defaultWooxTelemetryRoot = path.join(repoRoot, 'trading-live-woox');

function resolveFromRepo(p: string): string {
  const trimmed = p.trim();
  return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(repoRoot, trimmed);
}

function resolvedWooxTelemetryRoot(): string {
  const w = process.env.WOOX_TELEMETRY_ROOT?.trim();
  if (w) return path.resolve(w);
  return path.resolve(defaultWooxTelemetryRoot);
}

/** Same logical folder (Windows: drive letter case differs). */
function pathsEffectivelyEqual(a: string, b: string): boolean {
  const na = path.normalize(path.resolve(a));
  const nb = path.normalize(path.resolve(b));
  if (process.platform === 'win32') {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

/**
 * Home + `/api/trading/live/*` use this root only.
 * If `TELEMETRY_ROOT` points at the WOO folder (common misconfig), it is ignored so Home stays on `trading-live/`.
 * Override explicitly with `TRADING_LIVE_TELEMETRY_ROOT` when needed.
 */
function resolveTradingLiveTelemetryRoot(): string {
  const explicit = process.env.TRADING_LIVE_TELEMETRY_ROOT?.trim();
  if (explicit) {
    return resolveFromRepo(explicit);
  }
  const legacy = process.env.TELEMETRY_ROOT?.trim();
  if (legacy) {
    const resolvedLegacy = resolveFromRepo(legacy);
    if (!pathsEffectivelyEqual(resolvedLegacy, resolvedWooxTelemetryRoot())) {
      return resolvedLegacy;
    }
  }
  return path.resolve(defaultTradingLiveRoot);
}

export const STALE_THRESHOLD_MINUTES = Number(process.env.STALE_THRESHOLD_MINUTES || 5);
export const TELEMETRY_ROOT = resolveTradingLiveTelemetryRoot();

export function getKillSwitch(): { active: boolean; mode: string } {
  return {
    active: process.env.KILL_SWITCH_ACTIVE === '1' || process.env.KILL_SWITCH_ACTIVE === 'true',
    mode: process.env.KILL_SWITCH_MODE || 'block_all'
  };
}

export function getReconciliationTolerances() {
  return {
    qtyTolerance: Number(process.env.RECON_QTY_TOLERANCE || 1e-6),
    valueToleranceUsd: Number(process.env.RECON_VALUE_TOLERANCE_USD || 0.5),
    pnlTolerance: Number(process.env.RECON_PNL_TOLERANCE || 10)
  };
}
