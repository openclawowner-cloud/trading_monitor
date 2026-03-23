import path from 'path';
import { fileURLToPath } from 'url';

const wooxModuleDir = path.dirname(fileURLToPath(import.meta.url));
/** Repository root (…/Backend/woox -> two levels up). */
export const PROJECT_ROOT = path.resolve(wooxModuleDir, '..', '..');

const defaultWooxTelemetryRoot = path.join(PROJECT_ROOT, 'trading-live-woox');

/**
 * WOO dashboard lists these ids but reads `latest_status.json` / `paper_state.json` / `agent.pid`
 * from `trading-live/<id>/` (main trading supervisor). Not started by the WOO supervisor.
 * Never add `WOO_CC_5M_BB_RSI` here — that agent must use `trading-live-woox/WOO_CC_5M_BB_RSI/` only.
 */
export const WOOX_TELEMETRY_MIRROR_FROM_TRADING_LIVE: ReadonlySet<string> = new Set(['CC_5M_BB_RSI']);

/** Public REST only (read-only client). Override for staging, e.g. https://api.staging.woox.io */
const defaultWooxApiBase = 'https://api.woox.io';
export const WOOX_API_BASE = (process.env.WOOX_API_BASE || defaultWooxApiBase).replace(/\/+$/, '');

export const WOOX_TELEMETRY_ROOT = process.env.WOOX_TELEMETRY_ROOT
  ? path.resolve(process.env.WOOX_TELEMETRY_ROOT)
  : defaultWooxTelemetryRoot;

/** Strict opt-in for registry mode `paper_exchange` (staging); compare with === "true". */
export const WOOX_ENABLE_STAGING_TRADING = process.env.WOOX_ENABLE_STAGING_TRADING === 'true';

/**
 * True when both key and secret env vars are non-empty (values never logged).
 * Names align with typical WOO V3 signed REST usage.
 */
export const WOOX_SIGNED_API_CONFIGURED = isNonEmpty(process.env.WOOX_API_KEY) &&
  isNonEmpty(process.env.WOOX_API_SECRET);

function isNonEmpty(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}
