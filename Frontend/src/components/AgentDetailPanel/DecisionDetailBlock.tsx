import React from 'react';
import type { TradeDecisionContext, LatestDecisionRecord } from '../../types/api';
import type { TradeRecord } from './tradesPanelUtils';
import {
  formatDecisionTime,
  formatIndicatorValue,
  formatContextBool,
  TRADES_PANEL_PLACEHOLDER
} from './tradesPanelUtils';

const PH = TRADES_PANEL_PLACEHOLDER;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-300 font-mono text-right break-all">{value ?? PH}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">{title}</h4>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ContextGrid({ ctx }: { ctx: TradeDecisionContext }) {
  return (
    <>
      {ctx.trigger != null && ctx.trigger !== '' && <Row label="trigger" value={ctx.trigger} />}
      <Row label="trend_bias" value={ctx.trend_bias} />
      <Row label="allow_new_buys" value={formatContextBool(ctx.allow_new_buys)} />
      <Row label="higher_tf_ok" value={formatContextBool(ctx.higher_tf_ok)} />
      <Row label="falling_knife_blocked" value={formatContextBool(ctx.falling_knife_blocked)} />
      <Row label="bb_expansion_blocked" value={formatContextBool(ctx.bb_expansion_blocked)} />
      <Row label="sma20" value={formatIndicatorValue(ctx.sma20)} />
      <Row label="ma50" value={formatIndicatorValue(ctx.ma50)} />
      <Row label="ma100" value={formatIndicatorValue(ctx.ma100)} />
      <Row label="bb_upper" value={formatIndicatorValue(ctx.bb_upper)} />
      <Row label="bb_lower" value={formatIndicatorValue(ctx.bb_lower)} />
      <Row label="macd" value={formatIndicatorValue(ctx.macd)} />
      <Row label="macd_signal" value={formatIndicatorValue(ctx.macd_signal)} />
      <Row label="macd_hist" value={formatIndicatorValue(ctx.macd_hist)} />
      <Row label="psar" value={formatIndicatorValue(ctx.psar)} />
      {ctx.bb_width_pct != null && <Row label="bb_width_pct" value={String(ctx.bb_width_pct)} />}
    </>
  );
}

export function ActionBadge({ action }: { action: string }) {
  const a = String(action).toLowerCase();
  const style =
    a === 'buy'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
      : a === 'sell'
        ? 'bg-red-500/20 text-red-400 border-red-500/40'
        : a === 'hold'
          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
          : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase border ${style}`}
    >
      {action || PH}
    </span>
  );
}

interface DecisionDetailBlockProps {
  trade?: TradeRecord | null;
  record?: LatestDecisionRecord | null;
  onClear?: () => void;
}

export function DecisionDetailBlock({ trade, record, onClear }: DecisionDetailBlockProps) {
  const ctx = trade?.decision_context ?? record?.context;
  const title = trade ? 'Trade decision context' : 'Decision context';
  const reason = trade?.reason ?? record?.reason ?? PH;
  const trigger = ctx?.trigger != null && ctx.trigger !== '' ? ctx.trigger : null;
  const candleTime = ctx?.candle_time != null && Number.isFinite(Number(ctx.candle_time)) ? ctx.candle_time : null;

  if (!trade && !record) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-zinc-400 font-medium">{title}</span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-zinc-500 hover:text-zinc-300 text-[10px]"
          >
            Clear
          </button>
        )}
      </div>
      <div className="rounded bg-zinc-800/50 px-2 py-1.5 space-y-0.5 border border-zinc-700/50">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span><span className="text-zinc-500">reason:</span> <span className="text-zinc-300">{reason || PH}</span></span>
          {trigger != null && <span><span className="text-zinc-500">trigger:</span> <span className="text-zinc-300 font-mono">{trigger}</span></span>}
          {candleTime != null && <span><span className="text-zinc-500">candle_time:</span> <span className="text-zinc-400 font-mono">{formatDecisionTime(candleTime)}</span></span>}
        </div>
      </div>
      {trade && (
        <Section title="Trade">
          <Row label="side" value={trade.side} />
          <Row label="Trade time (execution)" value={formatDecisionTime(trade.timestamp)} />
          {candleTime != null && <Row label="Candle time (bar open)" value={formatDecisionTime(candleTime)} />}
          <Row label="pair" value={trade.pair ?? trade.symbol} />
          <Row label="qty" value={trade.qty != null ? String(trade.qty) : PH} />
          <Row label="price" value={trade.price != null ? String(trade.price) : PH} />
          <Row label="reason" value={trade.reason} />
        </Section>
      )}
      {record && !trade && (
        <Section title="Record">
          <Row label="action" value={<ActionBadge action={record.action} />} />
          <Row label="reason" value={record.reason} />
          <Row label="pair" value={record.pair} />
          <Row label="Decision time" value={formatDecisionTime(record.timestamp)} />
          {candleTime != null && <Row label="Candle time (bar open)" value={formatDecisionTime(candleTime)} />}
        </Section>
      )}
      {ctx && Object.keys(ctx).length > 0 && (
        <Section title="Indicators & gates">
          <ContextGrid ctx={ctx} />
        </Section>
      )}
    </div>
  );
}
