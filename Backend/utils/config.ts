import path from 'path';
import { fileURLToPath } from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
/** Project-root `trading-live/` — not tied to process.cwd() so agents and API stay aligned. */
const defaultTelemetryRoot = path.resolve(configDir, '..', '..', 'trading-live');

export const STALE_THRESHOLD_MINUTES = Number(process.env.STALE_THRESHOLD_MINUTES || 5);
export const TELEMETRY_ROOT = process.env.TELEMETRY_ROOT
  ? path.resolve(process.env.TELEMETRY_ROOT)
  : defaultTelemetryRoot;

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
