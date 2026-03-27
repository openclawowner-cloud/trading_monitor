import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(moduleDir, '..', '..');

const defaultTelemetryRoot = path.join(PROJECT_ROOT, 'trading-live-woo-real');
const defaultApiBase = 'https://api.woox.io';

export const WOO_REAL_ENABLED = process.env.WOO_REAL_ENABLED === 'true';

export const WOO_REAL_TELEMETRY_ROOT = process.env.WOO_REAL_TELEMETRY_ROOT
  ? path.resolve(process.env.WOO_REAL_TELEMETRY_ROOT)
  : defaultTelemetryRoot;

export const WOO_REAL_API_BASE = (process.env.WOO_REAL_API_BASE || defaultApiBase).replace(/\/+$/, '');

export const WOO_REAL_ENABLE_STAGING_TRADING = process.env.WOO_REAL_ENABLE_STAGING_TRADING === 'true';

export const WOO_REAL_SIGNED_API_CONFIGURED = isNonEmpty(process.env.WOO_REAL_API_KEY) &&
  isNonEmpty(process.env.WOO_REAL_API_SECRET);

function isNonEmpty(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}
