import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  ColorType,
  createSeriesMarkers
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time } from 'lightweight-charts';
import type { AgentDetailResponse, ChartIndicators, IndicatorPoint } from '../../types/api';
import { api } from '../../api/client';
import { wooxClient } from '../../api/wooxClient';
import { wooRealClient } from '../../api/wooRealClient';
import { bybitClient } from '../../api/bybitClient';
import { cryptoComClient } from '../../api/cryptoComClient';
import {
  buildChartMarkers,
  collectChartSymbolSuggestions,
  getDefaultChartSymbol,
  getTradesFromDetail,
  getLatestDecision,
  getDecisionLog,
  isSameDecision,
  normalizeChartSymbol,
  tradeTimestampMs,
  formatDecisionTime,
  type TradeRecord
} from './tradesPanelUtils';
import { DecisionDetailBlock, ActionBadge } from './DecisionDetailBlock';
import type { LatestDecisionRecord } from '../../types/api';
import { Maximize2, Minimize2 } from 'lucide-react';

const CHART_HEIGHT = 320;
const CHART_HEIGHT_EXPANDED = '70vh';
const POLL_MS = 30_000;
const INTERVALS = ['1m', '5m', '15m'] as const;
const LIMITS = [100, 300, 500] as const;

const EMPTY_INDICATORS: ChartIndicators = {
  sma20: [],
  ma50: [],
  ma100: [],
  bbUpper: [],
  bbLower: []
};

function toLineData(points: IndicatorPoint[] | undefined): { time: Time; value: number }[] {
  if (!points?.length) return [];
  return points
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
    .map((p) => ({ time: p.time as Time, value: p.value }));
}

function toRsiData(
  candles: Array<{ time: number; close: number }>,
  period = 14
): { time: Time; value: number }[] {
  if (candles.length <= period) return [];
  const closes = candles.map((c) => c.close);
  const out: { time: Time; value: number }[] = [];
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gainSum += d > 0 ? d : 0;
    lossSum += d < 0 ? -d : 0;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const d = closes[i]! - closes[i - 1]!;
      const gain = d > 0 ? d : 0;
      const loss = d < 0 ? -d : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    out.push({ time: candles[i]!.time as Time, value: Number.isFinite(rsi) ? rsi : 100 });
  }
  return out;
}

type IndicatorToggleKey = 'sma20' | 'ma50' | 'ma100' | 'bbUpper' | 'bbLower' | 'rsi';

const INDICATOR_LABELS: Record<IndicatorToggleKey, string> = {
  sma20: 'SMA20',
  ma50: 'MA50',
  ma100: 'MA100',
  bbUpper: 'BB↑',
  bbLower: 'BB↓',
  rsi: 'RSI'
};

interface LineSeriesRefs {
  sma20: ISeriesApi<'Line'> | null;
  ma50: ISeriesApi<'Line'> | null;
  ma100: ISeriesApi<'Line'> | null;
  bbUpper: ISeriesApi<'Line'> | null;
  bbLower: ISeriesApi<'Line'> | null;
  rsi: ISeriesApi<'Line'> | null;
}

interface TabChartProps {
  agentId: string;
  detail: AgentDetailResponse;
  /** WOO agents: candles from WOO public kline (Binance often 502 for WOO-only symbols). */
  candleSource?: 'binance' | 'woox' | 'woo_real' | 'bybit' | 'crypto_com';
  dataSource?: 'binance' | 'woox' | 'woo_real' | 'bybit' | 'crypto_com';
  onAction?: () => void;
}

export function TabChart({
  agentId,
  detail,
  candleSource = 'binance',
  dataSource = 'binance',
  onAction
}: TabChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const lineRefs = useRef<LineSeriesRefs>({
    sma20: null,
    ma50: null,
    ma100: null,
    bbUpper: null,
    bbLower: null,
    rsi: null
  });

  const suggestions = useMemo(() => collectChartSymbolSuggestions(detail), [detail]);
  const [symbol, setSymbol] = useState(() => getDefaultChartSymbol(detail) ?? '');
  const lastAgentId = useRef(agentId);
  useEffect(() => {
    if (lastAgentId.current !== agentId) {
      lastAgentId.current = agentId;
      setSymbol(getDefaultChartSymbol(detail) ?? '');
    }
  }, [agentId, detail]);
  const [interval, setIntervalState] = useState<string>('1m');
  const [limit, setLimit] = useState<number>(300);

  const [indVisible, setIndVisible] = useState({
    sma20: true,
    ma50: true,
    ma100: true,
    bbUpper: true,
    bbLower: true,
    rsi: true
  });
  const indVisibleRef = useRef(indVisible);
  indVisibleRef.current = indVisible;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<TradeRecord | null>(null);
  const [selectedLogRecord, setSelectedLogRecord] = useState<LatestDecisionRecord | null>(null);
  const [logFilter, setLogFilter] = useState<'all' | 'trades' | 'hold' | 'skip'>('all');
  const [chartExpanded, setChartExpanded] = useState(false);
  const [rsiValue, setRsiValue] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const fetchGen = useRef(0);
  const paused = Boolean((detail.state as Record<string, unknown> | null)?.paused);

  const latestDecision = useMemo(() => getLatestDecision(detail), [detail]);
  const decisionLogRaw = useMemo(() => getDecisionLog(detail), [detail]);
  const decisionLogFiltered = useMemo(() => {
    const filtered =
      logFilter === 'all'
        ? decisionLogRaw
        : logFilter === 'trades'
          ? decisionLogRaw.filter((r) => r.action === 'buy' || r.action === 'sell')
          : logFilter === 'hold'
            ? decisionLogRaw.filter((r) => r.action === 'hold')
            : decisionLogRaw.filter((r) => r.action === 'skip');
    return filtered.slice(0, 20);
  }, [decisionLogRaw, logFilter]);

  const applyIndicatorVisibility = useCallback((v: typeof indVisible) => {
    const L = lineRefs.current;
    if (!L.sma20) return;
    L.sma20.applyOptions({ visible: v.sma20 });
    L.ma50?.applyOptions({ visible: v.ma50 });
    L.ma100?.applyOptions({ visible: v.ma100 });
    L.bbUpper?.applyOptions({ visible: v.bbUpper });
    L.bbLower?.applyOptions({ visible: v.bbLower });
    L.rsi?.applyOptions({ visible: v.rsi });
  }, []);

  const tradesForSymbol = useMemo(() => {
    const sym = normalizeChartSymbol(symbol);
    if (!sym) return [];
    return getTradesFromDetail(detail).filter(
      (t) => normalizeChartSymbol(t.pair ?? t.symbol ?? '') === sym
    );
  }, [detail, symbol]);

  const tradesInRange = useCallback(
    (candles: { time: number }[], trades: TradeRecord[]) => {
      if (!candles.length) return [];
      const t0 = candles[0]!.time * 1000;
      const t1 = candles[candles.length - 1]!.time * 1000 + 60_000;
      return trades.filter((t) => {
        const ms = tradeTimestampMs(t);
        return ms >= t0 && ms <= t1;
      });
    },
    []
  );

  const noSymbol = normalizeChartSymbol(symbol) === '';

  useLayoutEffect(() => {
    if (noSymbol) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        markersRef.current = null;
        lineRefs.current = {
          sma20: null,
          ma50: null,
          ma100: null,
          bbUpper: null,
          bbLower: null,
          rsi: null
        };
      }
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#18181b' },
        textColor: '#a1a1aa'
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' }
      },
      rightPriceScale: {
        borderColor: '#3f3f46',
        scaleMargins: { top: 0.02, bottom: 0.42 }
      },
      timeScale: { borderColor: '#3f3f46', timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: '#52525b' }, horzLine: { color: '#52525b' } },
      width: el.clientWidth,
      height: CHART_HEIGHT
    });

    const sma20 = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true
    });
    const ma50 = chart.addSeries(LineSeries, {
      color: '#a78bfa',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true
    });
    const ma100 = chart.addSeries(LineSeries, {
      color: '#fb923c',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true
    });
    const bbUpper = chart.addSeries(LineSeries, {
      color: '#71717a',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false
    });
    const bbLower = chart.addSeries(LineSeries, {
      color: '#71717a',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false
    });
    const rsi = chart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceScaleId: 'rsi'
    });
    chart.priceScale('rsi').applyOptions({
      autoScale: true,
      borderVisible: false,
      scaleMargins: { top: 0.58, bottom: 0.02 }
    });
    rsi.createPriceLine({
      price: 70,
      color: '#ef4444',
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      axisLabelVisible: false,
      title: 'RSI 70'
    });
    rsi.createPriceLine({
      price: 30,
      color: '#22c55e',
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      axisLabelVisible: false,
      title: 'RSI 30'
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444'
    });
    const markers = createSeriesMarkers(series, []);

    chartRef.current = chart;
    lineRefs.current = { sma20, ma50, ma100, bbUpper, bbLower, rsi };
    seriesRef.current = series;
    markersRef.current = markers;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      const el = containerRef.current;
      chartRef.current.applyOptions({
        width: el.clientWidth,
        height: el.clientHeight
      });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      lineRefs.current = {
        sma20: null,
        ma50: null,
        ma100: null,
        bbUpper: null,
        bbLower: null,
        rsi: null
      };
    };
  }, [noSymbol]);

  useEffect(() => {
    applyIndicatorVisibility(indVisible);
  }, [indVisible, applyIndicatorVisibility, noSymbol]);

  const loadCandles = useCallback(async () => {
    const sym = normalizeChartSymbol(symbol);
    if (!sym) {
      seriesRef.current?.setData([]);
      markersRef.current?.setMarkers([]);
      const L = lineRefs.current;
      L.sma20?.setData([]);
      L.ma50?.setData([]);
      L.ma100?.setData([]);
      L.bbUpper?.setData([]);
      L.bbLower?.setData([]);
      L.rsi?.setData([]);
      setError(null);
      setLoading(false);
      return;
    }
    const gen = ++fetchGen.current;
    setLoading(true);
    setError(null);
    try {
      const res =
        candleSource === 'woox'
          ? await wooxClient.getCandles(sym, interval, limit)
          : candleSource === 'woo_real'
            ? await wooRealClient.getCandles(sym, interval, limit)
            : candleSource === 'bybit'
              ? await bybitClient.getCandles(sym, interval, limit)
            : candleSource === 'crypto_com'
              ? await cryptoComClient.getCandles(sym, interval, limit)
          : await api.getAgentCandles(agentId, sym, interval, limit);
      if (gen !== fetchGen.current) return;

      const ind = res.indicators ?? EMPTY_INDICATORS;
      const L = lineRefs.current;
      if (L.sma20) {
        L.sma20.setData(toLineData(ind.sma20));
        L.ma50?.setData(toLineData(ind.ma50));
        L.ma100?.setData(toLineData(ind.ma100));
        L.bbUpper?.setData(toLineData(ind.bbUpper));
        L.bbLower?.setData(toLineData(ind.bbLower));
        const rsiData = toRsiData(res.candles);
        L.rsi?.setData(rsiData);
        setRsiValue(rsiData.length ? rsiData[rsiData.length - 1]!.value : null);
        applyIndicatorVisibility(indVisibleRef.current);
      }

      const data = res.candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      }));
      seriesRef.current?.setData(data);
      const inRange = tradesInRange(res.candles, getTradesFromDetail(detail));
      const markerPayload = buildChartMarkers(inRange, sym, interval) as SeriesMarker<Time>[];
      markersRef.current?.setMarkers(markerPayload);
      setLastUpdated(new Date().toISOString());
    } catch (e) {
      if (gen !== fetchGen.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load candles');
      seriesRef.current?.setData([]);
      markersRef.current?.setMarkers([]);
      const L = lineRefs.current;
      L.sma20?.setData([]);
      L.ma50?.setData([]);
      L.ma100?.setData([]);
      L.bbUpper?.setData([]);
      L.bbLower?.setData([]);
      L.rsi?.setData([]);
      setRsiValue(null);
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [agentId, candleSource, symbol, interval, limit, detail, tradesInRange, applyIndicatorVisibility]);

  useEffect(() => {
    void loadCandles();
  }, [loadCandles]);

  useEffect(() => {
    const id = window.setInterval(() => void loadCandles(), POLL_MS);
    return () => clearInterval(id);
  }, [loadCandles]);

  const toggleIndicator = (key: IndicatorToggleKey) => {
    setIndVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const runAgentAction = useCallback(
    async (action: 'pause' | 'manualSell', pausedValue?: boolean) => {
      setActionLoading(action);
      setActionMessage(null);
      try {
        if (action === 'pause') {
          if (dataSource === 'woox') await wooxClient.setPaused(agentId, Boolean(pausedValue));
          else if (dataSource === 'woo_real') await wooRealClient.setPaused(agentId, Boolean(pausedValue));
          else if (dataSource === 'bybit') await bybitClient.setPaused(agentId, Boolean(pausedValue));
          else if (dataSource === 'crypto_com') await cryptoComClient.setPaused(agentId, Boolean(pausedValue));
          else await api.postPause(agentId, Boolean(pausedValue));
          setActionMessage(pausedValue ? 'Agent gepauzeerd' : 'Agent hervat');
        } else {
          if (dataSource === 'woox') await wooxClient.manualSell(agentId);
          else if (dataSource === 'woo_real') await wooRealClient.manualSell(agentId);
          else if (dataSource === 'bybit') await bybitClient.manualSell(agentId);
          else if (dataSource === 'crypto_com') await cryptoComClient.manualSell(agentId);
          else await api.postManualSell(agentId);
          setActionMessage('Handmatige verkoop aangevraagd');
        }
        onAction?.();
      } catch (e) {
        setActionMessage(e instanceof Error ? e.message : 'Actie mislukt');
      } finally {
        setActionLoading(null);
      }
    },
    [agentId, dataSource, onAction]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Symbol
          <input
            list="chart-symbol-suggestions"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="NEARUSDT"
            className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 w-40"
          />
          <datalist id="chart-symbol-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Interval
          <select
            value={interval}
            onChange={(e) => setIntervalState(e.target.value)}
            className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
          >
            {INTERVALS.map((iv) => (
              <option key={iv} value={iv}>
                {iv}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Bars
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
          >
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-end gap-2">
          <button
            type="button"
            disabled={actionLoading !== null}
            onClick={() => void runAgentAction('pause', !paused)}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {paused ? 'Hervat agent' : 'Pauzeer agent'}
          </button>
          <button
            type="button"
            disabled={actionLoading !== null}
            onClick={() => void runAgentAction('manualSell')}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
          >
            Verkoop positie
          </button>
        </div>
      </div>
      {actionMessage && <p className="text-xs text-zinc-400">{actionMessage}</p>}

      {noSymbol && (
        <p className="text-sm text-zinc-500 border border-dashed border-zinc-700 rounded-lg p-6 text-center">
          No symbol yet. Open a position or execute a trade, or type a pair (e.g. NEARUSDT).
        </p>
      )}

      {!noSymbol && (
        <>
          {latestDecision && (
            <button
              type="button"
              onClick={() => {
                setSelectedTrade(null);
                setSelectedLogRecord(isSameDecision(selectedLogRecord, latestDecision) ? null : latestDecision);
              }}
              className={`w-full text-left rounded-lg border p-2.5 text-xs transition-colors ${
                isSameDecision(selectedLogRecord, latestDecision)
                  ? 'border-emerald-500/50 bg-zinc-800/70 ring-1 ring-emerald-500/20'
                  : 'border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800/60 hover:border-zinc-700'
              }`}
            >
              <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Latest decision — click to expand
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ActionBadge action={latestDecision.action} />
                <span className="text-zinc-400">{latestDecision.reason}</span>
                <span className="text-zinc-500">{latestDecision.pair}</span>
                <span className="text-zinc-600 font-mono">{formatDecisionTime(latestDecision.timestamp)}</span>
                {latestDecision.context?.trigger != null && latestDecision.context.trigger !== '' && (
                  <span className="text-zinc-500">· {latestDecision.context.trigger}</span>
                )}
                {latestDecision.context?.allow_new_buys != null && (
                  <span className="text-zinc-600">allow_buys={latestDecision.context.allow_new_buys ? 'yes' : 'no'}</span>
                )}
                {latestDecision.context?.trend_bias != null && (
                  <span className="text-zinc-600">{latestDecision.context.trend_bias}</span>
                )}
              </div>
            </button>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 border border-zinc-800 rounded-lg px-2 py-1.5 bg-zinc-900/80">
            <span className="text-zinc-500 font-medium uppercase tracking-wide shrink-0">Indicators</span>
            {(Object.keys(INDICATOR_LABELS) as IndicatorToggleKey[]).map((key) => (
              <label
                key={key}
                className="inline-flex items-center gap-1 cursor-pointer hover:text-zinc-200 whitespace-nowrap"
              >
                <input
                  type="checkbox"
                  checked={indVisible[key]}
                  onChange={() => toggleIndicator(key)}
                  className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30"
                />
                <span
                  className={
                    key === 'sma20'
                      ? 'text-sky-400'
                      : key === 'ma50'
                        ? 'text-violet-400'
                        : key === 'ma100'
                          ? 'text-orange-400'
                          : key === 'rsi'
                            ? 'text-emerald-400'
                            : 'text-zinc-500'
                  }
                >
                  {INDICATOR_LABELS[key]}
                </span>
              </label>
            ))}
            {rsiValue != null && (
              <span className="ml-1 text-[11px] text-emerald-400 font-mono">
                RSI14 {rsiValue.toFixed(1)}
              </span>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setChartExpanded((e) => !e)}
              className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-800/90 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
              title={chartExpanded ? 'Chart verkleinen' : 'Chart vergroten'}
            >
              {chartExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  Verkleinen
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  Vergroten
                </>
              )}
            </button>
            <div
              ref={containerRef}
              className="w-full rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950 transition-[min-height] duration-200"
              style={{ minHeight: chartExpanded ? CHART_HEIGHT_EXPANDED : CHART_HEIGHT }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-b-[7px] border-l-transparent border-r-transparent border-b-emerald-500" />
              Buy (below bar)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-red-400" />
              Sell (above bar)
            </span>
            {lastUpdated && <span className="text-zinc-600 ml-auto">Updated {lastUpdated.slice(11, 19)} UTC</span>}
          </div>
          {(selectedTrade || selectedLogRecord) && (
            <DecisionDetailBlock
              trade={selectedTrade}
              record={selectedLogRecord}
              onClear={() => {
                setSelectedTrade(null);
                setSelectedLogRecord(null);
              }}
            />
          )}
          {loading && <p className="text-sm text-zinc-500">Loading candles…</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!loading && !error && tradesForSymbol.length === 0 && (
            <p className="text-xs text-zinc-600">No trades for this symbol in telemetry.</p>
          )}
          {tradesForSymbol.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
                Trades ({symbol}) — click to see decision context
              </h3>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto text-xs font-mono">
                {[...tradesForSymbol]
                  .sort((a, b) => tradeTimestampMs(b) - tradeTimestampMs(a))
                  .slice(0, 12)
                  .map((t, i) => (
                    <li
                      key={`${t.id ?? i}-${tradeTimestampMs(t)}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedLogRecord(null);
                        setSelectedTrade(selectedTrade?.id === t.id ? null : t);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedLogRecord(null);
                          setSelectedTrade(selectedTrade?.id === t.id ? null : t);
                        }
                      }}
                      className={`border rounded px-2 py-1.5 cursor-pointer hover:bg-zinc-800/60 ${
                        selectedTrade?.id === t.id
                          ? 'border-l-2 border-l-emerald-500/70 bg-zinc-800/70 border-zinc-700'
                          : 'border-zinc-800/80'
                      }`}
                    >
                      <span className={t.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                        {String(t.side).toUpperCase()}
                      </span>{' '}
                      {t.reason ?? '—'} · {t.price != null ? Number(t.price).toFixed(4) : '—'} · qty{' '}
                      {t.qty != null ? Number(t.qty).toFixed(4) : '—'}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {decisionLogRaw.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Decision log (last 20)
                </h3>
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                  className="text-[11px] rounded bg-zinc-800 border border-zinc-700 text-zinc-300 px-1.5 py-0.5"
                >
                  <option value="all">All</option>
                  <option value="trades">Trades only</option>
                  <option value="hold">Holds</option>
                  <option value="skip">Skips</option>
                </select>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto rounded border border-zinc-800">
                <table className="w-full text-[11px] text-left">
                  <thead className="sticky top-0 bg-zinc-900 text-zinc-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-2 py-1 font-medium">Time</th>
                      <th className="px-2 py-1 font-medium">Action</th>
                      <th className="px-2 py-1 font-medium">Pair</th>
                      <th className="px-2 py-1 font-medium">Reason</th>
                      <th className="px-2 py-1 font-medium">Trigger</th>
                      <th className="px-2 py-1 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisionLogFiltered.map((r, i) => {
                      const rowSelected = selectedLogRecord === r || isSameDecision(selectedLogRecord, r);
                      return (
                      <tr
                        key={`${r.timestamp}-${r.pair}-${i}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedTrade(null);
                          setSelectedLogRecord(rowSelected ? null : r);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedTrade(null);
                            setSelectedLogRecord(rowSelected ? null : r);
                          }
                        }}
                        className={`border-t border-zinc-800 cursor-pointer hover:bg-zinc-800/50 ${
                          rowSelected ? 'bg-zinc-800/70' : ''
                        }`}
                      >
                        <td
                          className={`px-2 py-1 font-mono text-zinc-500 whitespace-nowrap ${
                            rowSelected ? 'border-l-2 border-l-emerald-500/60' : ''
                          }`}
                        >
                          {formatDecisionTime(r.timestamp)}
                        </td>
                        <td className="px-2 py-1">
                          <ActionBadge action={r.action} />
                        </td>
                        <td className="px-2 py-1 text-zinc-400">{r.pair}</td>
                        <td className="px-2 py-1 text-zinc-400">{r.reason}</td>
                        <td className="px-2 py-1 text-zinc-500">{r.context?.trigger ?? '—'}</td>
                        <td className="px-2 py-1 text-zinc-500">{r.context?.trend_bias ?? '—'}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
