import { useEffect, useMemo, useState } from 'react';
import { wooRealClient, type WooRealAgentDetail, type WooRealDashboardAgentRow } from '../../api/wooRealClient';

interface WooRealAgentDetailPanelProps {
  agent: WooRealDashboardAgentRow | null;
  onClose: () => void;
}

type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

function toSymbol(agent: WooRealDashboardAgentRow, detail: WooRealAgentDetail | null): string {
  const statusSymbol = detail?.latestStatus?.symbol;
  if (typeof statusSymbol === 'string' && statusSymbol.trim()) {
    return statusSymbol.replace(/^SPOT_/, '').replace(/_/g, '');
  }
  const stateSymbol = detail?.paperState?.symbol;
  if (typeof stateSymbol === 'string' && stateSymbol.trim()) {
    return stateSymbol.replace(/^SPOT_/, '').replace(/_/g, '');
  }
  const raw = agent.agentId.replace(/^WOO_REAL_/, '');
  return raw.includes('USDT') ? raw : 'BTCUSDT';
}

export function WooRealAgentDetailPanel({ agent, onClose }: WooRealAgentDetailPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WooRealAgentDetail | null>(null);
  const [interval, setInterval] = useState<ChartInterval>('5m');
  const [candles, setCandles] = useState<Array<{ time: number; open: number; close: number; high: number; low: number }>>([]);

  useEffect(() => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    Promise.all([
      wooRealClient.getAgent(agent.agentId),
      wooRealClient.getCandles('BTCUSDT', interval, 120)
    ])
      .then(([agentDetail, initialCandles]) => {
        setDetail(agentDetail);
        const symbol = toSymbol(agent, agentDetail);
        return wooRealClient.getCandles(symbol, interval, 120).catch(() => initialCandles);
      })
      .then((res) => {
        setCandles(
          (res.candles ?? []).map((c) => ({
            time: c.time,
            open: c.open,
            close: c.close,
            high: c.high,
            low: c.low
          }))
        );
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load details');
        setCandles([]);
      })
      .finally(() => setLoading(false));
  }, [agent, interval]);

  const latestDecision = useMemo(() => {
    const record = detail?.latestStatus?.latest_decision;
    return record && typeof record === 'object' && !Array.isArray(record)
      ? (record as Record<string, unknown>)
      : null;
  }, [detail]);

  const chartCandles = useMemo(() => {
    if (candles.length === 0) return [];
    const slice = candles.slice(-80);
    const min = Math.min(...slice.map((c) => c.low));
    const max = Math.max(...slice.map((c) => c.high));
    const range = Math.max(max - min, Number.EPSILON);
    const width = 680;
    const height = 220;
    const padX = 10;
    const padY = 8;
    const candleWidth = Math.max(3, (width - padX * 2) / Math.max(slice.length, 1) * 0.65);
    return slice.map((c, index, arr) => {
      const x = padX + (index / Math.max(arr.length - 1, 1)) * (width - padX * 2);
      const yOpen = padY + ((max - c.open) / range) * (height - padY * 2);
      const yClose = padY + ((max - c.close) / range) * (height - padY * 2);
      const yHigh = padY + ((max - c.high) / range) * (height - padY * 2);
      const yLow = padY + ((max - c.low) / range) * (height - padY * 2);
      return {
        x,
        yOpen,
        yClose,
        yHigh,
        yLow,
        isBull: c.close >= c.open,
        bodyTop: Math.min(yOpen, yClose),
        bodyBottom: Math.max(yOpen, yClose),
        bodyHeight: Math.max(Math.abs(yClose - yOpen), 1.5),
        candleWidth
      };
    });
  }, [candles]);

  if (!agent) return null;

  return (
    <section className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-zinc-200">Agent Detail</h3>
        <button onClick={onClose} className="px-2 py-1 rounded border border-zinc-700 text-xs hover:border-zinc-500">
          Close
        </button>
      </div>
      {loading && <p className="text-sm text-zinc-400">Loading detail...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && !error && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-zinc-300">
            <p>id: {agent.agentId}</p>
            <p>status: {agent.status}</p>
            <p>mode: {agent.mode}</p>
            <p>runtime: {detail?.runtimeStatus ?? '-'}</p>
            <p>equity: {Number(agent.equity || 0).toFixed(2)}</p>
            <p>cash: {Number(agent.cash || 0).toFixed(2)}</p>
            <p>pnl: {Number(agent.pnl || 0).toFixed(2)}</p>
            <p>openPositions: {Number(agent.openPositions || 0)}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-zinc-300">Candles</h4>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as ChartInterval)}
                className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs"
              >
                <option value="1m">1m</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
            </div>
            <div className="border border-zinc-800 rounded p-2 bg-zinc-950/60 mb-2">
              {chartCandles.length === 0 ? (
                <p className="text-xs text-zinc-500">No chart data.</p>
              ) : (
                <svg viewBox="0 0 680 220" className="w-full h-40 md:h-48">
                  {chartCandles.map((c, idx) => {
                    const wickColor = c.isBull ? '#34d399' : '#f87171';
                    const bodyColor = c.isBull ? '#10b981' : '#ef4444';
                    return (
                      <g key={idx}>
                        <line x1={c.x} y1={c.yHigh} x2={c.x} y2={c.yLow} stroke={wickColor} strokeWidth="1.2" />
                        <rect
                          x={c.x - c.candleWidth / 2}
                          y={c.bodyTop}
                          width={c.candleWidth}
                          height={c.bodyHeight}
                          fill={bodyColor}
                          opacity="0.95"
                          rx="0.8"
                        />
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
            {candles.length === 0 ? (
              <p className="text-xs text-zinc-500">No candle data.</p>
            ) : (
              <div className="max-h-48 overflow-auto border border-zinc-800 rounded">
                <table className="w-full text-xs text-zinc-300">
                  <thead className="bg-zinc-900/80 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Time</th>
                      <th className="text-right p-2">Close</th>
                      <th className="text-right p-2">High</th>
                      <th className="text-right p-2">Low</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candles.slice(-25).reverse().map((c) => (
                      <tr key={c.time} className="border-t border-zinc-800">
                        <td className="p-2">{new Date(c.time * 1000).toLocaleString()}</td>
                        <td className="p-2 text-right">{c.close.toFixed(6)}</td>
                        <td className="p-2 text-right">{c.high.toFixed(6)}</td>
                        <td className="p-2 text-right">{c.low.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-zinc-300 mb-2">Latest decision</h4>
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap border border-zinc-800 rounded p-2 bg-zinc-950/60">
              {JSON.stringify(latestDecision ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
