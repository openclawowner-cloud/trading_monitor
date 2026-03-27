import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(moduleDir, '..', '..');

const defaultTelemetryRoot = path.join(PROJECT_ROOT, 'trading-live-bybit');
const defaultApiBase = 'https://api-testnet.bybit.com';

export const BYBIT_ENABLED = process.env.BYBIT_ENABLED === 'true';

export const BYBIT_TELEMETRY_ROOT = process.env.BYBIT_TELEMETRY_ROOT
  ? path.resolve(process.env.BYBIT_TELEMETRY_ROOT)
  : defaultTelemetryRoot;

export const BYBIT_API_BASE = (process.env.BYBIT_API_BASE || defaultApiBase).replace(/\/+$/, '');
