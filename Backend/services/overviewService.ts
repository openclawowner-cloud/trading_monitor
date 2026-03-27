import { getCategorizedAgents, readRegistry } from './agent-registry';
import { runReconciliation } from './reconciliationService';
import { readAgentTelemetry, getTelemetryFileTimestamps } from '../adapters/telemetryReader';
import { buildIncidentsForAgent } from './incidents';
import { STALE_THRESHOLD_MINUTES, getKillSwitch } from '../utils/config';
import { getSupervisorStatus } from './supervisorController';
import { readWooxRegistry } from '../woox/services/wooxRegistry';
import { readWooxAgentTelemetry } from '../woox/services/wooxTelemetry';
import { mapWooxAgentToDashboardItem } from '../woox/services/wooxDashboardAdapter';
import { getWooxSupervisorStatus } from '../woox/services/wooxSupervisorController';
import { WOO_REAL_ENABLED } from '../woo_real/config';
import { readWooRealRegistry } from '../woo_real/services/wooRealRegistry';
import { readWooRealAgentTelemetry } from '../woo_real/services/wooRealTelemetry';
import { mapWooRealAgentToDashboardItem } from '../woo_real/services/wooRealDashboardAdapter';
import { getWooRealSupervisorStatus } from '../woo_real/services/wooRealSupervisorController';
import { BYBIT_ENABLED } from '../bybit/config';
import { readBybitRegistry } from '../bybit/services/bybitRegistry';
import { readBybitAgentTelemetry } from '../bybit/services/bybitTelemetry';
import { mapBybitAgentToDashboardItem } from '../bybit/services/bybitDashboardAdapter';
import { getBybitSupervisorStatus } from '../bybit/services/bybitSupervisorController';
import { CRYPTO_COM_ENABLED } from '../crypto_com/config';
import { readCryptoComRegistry } from '../crypto_com/services/cryptoComRegistry';
import { readCryptoComAgentTelemetry } from '../crypto_com/services/cryptoComTelemetry';
import { mapCryptoComAgentToDashboardItem } from '../crypto_com/services/cryptoComDashboardAdapter';
import { getCryptoComSupervisorStatus } from '../crypto_com/services/cryptoComSupervisorController';

type DashboardAgentRow = {
  agentId: string;
  status: string;
  cash: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl?: number;
  openPositions: number;
  incidents?: unknown[];
  lastModifiedMs?: number | null;
  lastUpdate?: string | null;
};

const STALE_MS = STALE_THRESHOLD_MINUTES * 60 * 1000;

function deriveBinanceStatus(
  agentId: string,
  telemetry: ReturnType<typeof readAgentTelemetry>,
  lastModifiedMs: number | null
): 'running' | 'stale' | 'offline' | 'disabled' | 'archived' {
  const agentFromRegistry = readRegistry().find((a: Record<string, unknown>) => a.id === agentId) as
    | Record<string, unknown>
    | undefined;
  const enabled = agentFromRegistry?.enabled !== false;
  if (agentFromRegistry?.archived) return 'archived';
  if (!enabled) return 'disabled';
  if (!telemetry?.status && !telemetry?.state) return 'offline';
  if (lastModifiedMs === null) return 'offline';
  if (Date.now() - lastModifiedMs > STALE_MS) return 'stale';
  return 'running';
}

function getBinanceDashboardAgents(): DashboardAgentRow[] {
  const agents = getCategorizedAgents({ includeTestAgents: false });
  return agents.map((agent: Record<string, unknown>) => {
    const agentId = String(agent.id);
    const telemetry = readAgentTelemetry(agentId);
    const { statusMs, stateMs } = getTelemetryFileTimestamps(agentId);
    const lastModifiedMs = statusMs ?? stateMs ?? null;
    const status = deriveBinanceStatus(agentId, telemetry, lastModifiedMs);

    const scoreboard = (telemetry.status?.scoreboard || telemetry.state) as Record<string, unknown>;
    const cash = Number(scoreboard?.cash ?? 0);
    const equity = Number(scoreboard?.equity ?? 0);
    const realizedPnl = Number(scoreboard?.realizedPnl ?? 0);
    const unrealizedPnl =
      scoreboard?.unrealizedPnl !== undefined ? Number(scoreboard.unrealizedPnl) : undefined;
    const positions = (telemetry.status?.positions || telemetry.state?.positions || {}) as Record<
      string,
      unknown
    >;
    const openPositions = Object.keys(positions).filter(
      (k) => k.endsWith('_qty') || (typeof positions[k] === 'object' && positions[k] !== null)
    ).length;
    const recon = runReconciliation(agentId, telemetry.status, telemetry.state);
    const incidents = buildIncidentsForAgent(agentId, {
      hasTelemetry: !!telemetry?.status || !!telemetry?.state,
      status,
      reconciliationOk: recon.positionOk && recon.cashOk && recon.pnlOk,
      lastModifiedMs,
      staleThresholdMs: STALE_MS,
      mismatchDetails: recon.mismatchDetails?.map((m) => ({ symbol: m.symbol })) ?? []
    });
    return {
      agentId,
      status,
      cash: Number.isFinite(cash) ? cash : 0,
      equity: Number.isFinite(equity) ? equity : 0,
      realizedPnl: Number.isFinite(realizedPnl) ? realizedPnl : 0,
      unrealizedPnl: Number.isFinite(unrealizedPnl ?? 0) ? unrealizedPnl : 0,
      openPositions,
      incidents,
      lastModifiedMs,
      lastUpdate: lastModifiedMs ? new Date(lastModifiedMs).toISOString() : null
    };
  });
}

function summarizeExchange(
  exchangeId: string,
  label: string,
  enabled: boolean,
  supervisorRunning: boolean | null,
  agents: DashboardAgentRow[]
) {
  const counts = {
    total: agents.length,
    running: agents.filter((a) => a.status === 'running').length,
    stale: agents.filter((a) => a.status === 'stale').length,
    offline: agents.filter((a) => a.status === 'offline').length,
    disabled: agents.filter((a) => a.status === 'disabled').length,
    archived: agents.filter((a) => a.status === 'archived').length
  };
  const cash = agents.reduce((acc, a) => acc + (Number.isFinite(a.cash) ? a.cash : 0), 0);
  const equity = agents.reduce((acc, a) => acc + (Number.isFinite(a.equity) ? a.equity : 0), 0);
  const realizedPnl = agents.reduce((acc, a) => acc + (Number.isFinite(a.realizedPnl) ? a.realizedPnl : 0), 0);
  const unrealizedPnl = agents.reduce(
    (acc, a) => acc + (Number.isFinite(a.unrealizedPnl ?? 0) ? (a.unrealizedPnl ?? 0) : 0),
    0
  );
  const openPositions = agents.reduce(
    (acc, a) => acc + (Number.isFinite(a.openPositions) ? a.openPositions : 0),
    0
  );
  const lastUpdateMs = agents
    .map((a) => (typeof a.lastModifiedMs === 'number' ? a.lastModifiedMs : 0))
    .reduce((max, cur) => Math.max(max, cur), 0);
  const incidents = agents.flatMap((a) => (Array.isArray(a.incidents) ? a.incidents : []));
  return {
    exchangeId,
    label,
    enabled,
    supervisorRunning,
    counts,
    pnl: { realized: realizedPnl, unrealized: unrealizedPnl, total: realizedPnl + unrealizedPnl },
    balances: { cash, equity },
    openPositions,
    incidents,
    lastUpdate: lastUpdateMs > 0 ? new Date(lastUpdateMs).toISOString() : null
  };
}

export async function buildOverview() {
  const killSwitch = getKillSwitch();

  const [binanceSupervisor, wooxSupervisor, wooRealSupervisor, bybitSupervisor, cryptoComSupervisor] =
    await Promise.all([
      getSupervisorStatus().catch(() => null),
      getWooxSupervisorStatus().catch(() => null),
      getWooRealSupervisorStatus().catch(() => null),
      getBybitSupervisorStatus().catch(() => null),
      getCryptoComSupervisorStatus().catch(() => null)
    ]);

  const binanceAgents = getBinanceDashboardAgents();
  const wooxAgents = readWooxRegistry().map((a) => mapWooxAgentToDashboardItem(a, readWooxAgentTelemetry(a.id)));
  const wooRealAgents = readWooRealRegistry().map((a) =>
    mapWooRealAgentToDashboardItem(a, readWooRealAgentTelemetry(a.id))
  );
  const bybitAgents = readBybitRegistry().map((a) =>
    mapBybitAgentToDashboardItem(a, readBybitAgentTelemetry(a.id))
  );
  const cryptoComAgents = readCryptoComRegistry().map((a) =>
    mapCryptoComAgentToDashboardItem(a, readCryptoComAgentTelemetry(a.id))
  );

  const exchanges = [
    summarizeExchange(
      'binance',
      'Binance',
      true,
      Boolean((binanceSupervisor as { supervisorRunning?: boolean } | null)?.supervisorRunning),
      binanceAgents
    ),
    summarizeExchange(
      'woox',
      'WOO',
      true,
      Boolean((wooxSupervisor as { running?: boolean } | null)?.running),
      wooxAgents
    ),
    summarizeExchange(
      'woo_real',
      'WOO Real',
      WOO_REAL_ENABLED,
      Boolean((wooRealSupervisor as { running?: boolean } | null)?.running),
      wooRealAgents
    ),
    summarizeExchange(
      'bybit',
      'Bybit',
      BYBIT_ENABLED,
      Boolean((bybitSupervisor as { running?: boolean } | null)?.running),
      bybitAgents
    ),
    summarizeExchange(
      'crypto_com',
      'Crypto.com',
      CRYPTO_COM_ENABLED,
      Boolean((cryptoComSupervisor as { running?: boolean } | null)?.running),
      cryptoComAgents
    )
  ];

  const global = {
    agents: exchanges.reduce(
      (acc, ex) => ({
        total: acc.total + ex.counts.total,
        running: acc.running + ex.counts.running,
        stale: acc.stale + ex.counts.stale,
        offline: acc.offline + ex.counts.offline,
        disabled: acc.disabled + ex.counts.disabled
      }),
      { total: 0, running: 0, stale: 0, offline: 0, disabled: 0 }
    ),
    balances: exchanges.reduce(
      (acc, ex) => ({
        cash: acc.cash + ex.balances.cash,
        equity: acc.equity + ex.balances.equity
      }),
      { cash: 0, equity: 0 }
    ),
    pnl: exchanges.reduce(
      (acc, ex) => ({
        realized: acc.realized + ex.pnl.realized,
        unrealized: acc.unrealized + ex.pnl.unrealized,
        total: acc.total + ex.pnl.total
      }),
      { realized: 0, unrealized: 0, total: 0 }
    ),
    openPositions: exchanges.reduce((acc, ex) => acc + ex.openPositions, 0),
    supervisors: {
      running: exchanges.filter((e) => e.supervisorRunning).length,
      total: exchanges.length
    },
    incidents: exchanges.reduce((acc, ex) => acc + ex.incidents.length, 0),
    killSwitchActive: killSwitch.active,
    killSwitchMode: killSwitch.mode
  };

  return {
    generatedAt: new Date().toISOString(),
    global,
    exchanges
  };
}
