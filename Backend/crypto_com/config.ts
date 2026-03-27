import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(moduleDir, '..', '..');

const defaultTelemetryRoot = path.join(PROJECT_ROOT, 'trading-live-crypto-com');
const defaultApiBase = 'https://api.crypto.com';

export const CRYPTO_COM_ENABLED = process.env.CRYPTO_COM_ENABLED === 'true';

export const CRYPTO_COM_TELEMETRY_ROOT = process.env.CRYPTO_COM_TELEMETRY_ROOT
  ? path.resolve(process.env.CRYPTO_COM_TELEMETRY_ROOT)
  : defaultTelemetryRoot;

export const CRYPTO_COM_API_BASE = (process.env.CRYPTO_COM_API_BASE || defaultApiBase).replace(
  /\/+$/,
  ''
);
