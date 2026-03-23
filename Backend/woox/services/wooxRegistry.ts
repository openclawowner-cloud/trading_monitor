import fs from 'fs';
import path from 'path';
import { WOOX_ENABLE_STAGING_TRADING, WOOX_TELEMETRY_ROOT } from '../config';
import type { WooAgentMode, WooRegistryAgent } from '../types';

const AGENTS_FILE = 'agents.json';

function getAgentsPath(): string {
  return path.join(WOOX_TELEMETRY_ROOT, AGENTS_FILE);
}

/**
 * `paper_exchange` is only allowed when staging trading env flag is set.
 * `paper_local` is always allowed.
 */
export function isPaperExchangeAllowed(mode: WooAgentMode): boolean {
  if (mode === 'paper_local') return true;
  return WOOX_ENABLE_STAGING_TRADING;
}

export function normalizeWooRegistryAgent(raw: unknown): WooRegistryAgent | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== 'string' || !id.trim()) return null;

  const mode = normalizeMode(o.mode);
  const enabled = o.enabled === false ? false : true;

  const extra: Record<string, unknown> = { ...o };
  delete extra.id;
  delete extra.mode;
  delete extra.enabled;

  return { id: id.trim(), mode, enabled, extra };
}

function normalizeMode(value: unknown): WooAgentMode {
  if (value === 'paper_exchange' || value === 'paper_local') return value;
  return 'paper_local';
}

/** Read-only: missing file => empty list. */
export function readWooxRegistry(): WooRegistryAgent[] {
  const p = getAgentsPath();
  if (!fs.existsSync(p)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: WooRegistryAgent[] = [];
  for (const row of parsed) {
    const n = normalizeWooRegistryAgent(row);
    if (n) out.push(n);
  }
  return out;
}

export function findWooxRegistryAgent(agentId: string): WooRegistryAgent | null {
  const id = agentId.trim();
  if (!id) return null;
  return readWooxRegistry().find((a) => a.id === id) ?? null;
}
