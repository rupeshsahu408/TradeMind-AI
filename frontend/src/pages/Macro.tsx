import React from 'react';
import { Globe, TrendingUp, TrendingDown, DollarSign, BarChart2, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useCommodities, useForex, useGlobalIndices, useMacroSnapshot } from '../hooks/useMarketData';

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || n === 0) return '--';
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} />;
}

function ChangeChip({ val }: { val: number }) {
  const up = val >= 0;
  return (
    <span className={cn('text-xs font-medium', up ? 'text-bull' : 'text-bear')}>
      {up ? '▲' : '▼'} {Math.abs(val).toFixed(2)}%
    </span>
  );
}

function DataRow({
  label, value, change_pct, unit = '', decimals = 2, prefix = '',
}: {
  label: string; value: number; change_pct: number; unit?: string; decimals?: number; prefix?: string;
}) {
  const up = change_pct >= 0;
  return (
    <div className="flex items-center justify-between py-2.5 px-4 border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors">
      <span className="text-sm text-foreground font-medium">{label}</span>
      <div className="flex items-center gap-4">
        <span className={cn('text-sm font-mono font-semibold', up ? 'text-bull' : 'text-bear')}>
          {prefix}{fmt(value, decimals)}{unit}
        </span>
        <ChangeChip val={change_pct} />
      </div>
    </div>
  );
}

// ─── Forex Section ────────────────────────────────────────────────────────────
function ForexSection() {
  const { data, loading, error } = useForex();

  return (
    <section className="trading-card">
      <div className="flex items-center gap-2 px-1 mb-3">
        <DollarSign className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Foreign Exchange</h2>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}
      {error && (
        <div className="flex gap-2 p-3 bg-bear/10 rounded text-bear text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {data && !loading && (
        <div className="rounded-md border border-border overflow-hidden">
          {[
            { key: 'usd_inr', label: 'USD / INR', prefix: '₹', decimals: 4 },
            { key: 'eur_inr', label: 'EUR / INR', prefix: '₹', decimals: 4 },
            { key: 'gbp_inr', label: 'GBP / INR', prefix: '₹', decimals: 4 },
            { key: 'jpy_inr', label: 'JPY / INR', prefix: '₹', decimals: 4 },
            { key: 'dxy',     label: 'Dollar Index (DXY)', prefix: '', decimals: 2 },
          ].map(({ key, label, prefix, decimals }) => {
            const item = (data as Record<string, { rate: number; change_pct: number }>)[key];
            if (!item) return null;
            return (
              <DataRow
                key={key}
                label={label}
                value={item.rate}
                change_pct={item.change_pct}
                prefix={prefix}
                decimals={decimals}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Commodities Section ──────────────────────────────────────────────────────
function CommoditiesSection() {
  const { data, loading, error } = useCommodities();

  return (
    <section className="trading-card">
      <div className="flex items-center gap-2 px-1 mb-3">
        <BarChart2 className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Commodities</h2>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}
      {error && (
        <div className="flex gap-2 p-3 bg-bear/10 rounded text-bear text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {data && !loading && (
        <div className="rounded-md border border-border overflow-hidden">
          {[
            { key: 'crude_oil_wti',   label: 'Crude Oil — WTI',   prefix: '$', decimals: 2, unit: '/bbl' },
            { key: 'crude_oil_brent', label: 'Crude Oil — Brent', prefix: '$', decimals: 2, unit: '/bbl' },
            { key: 'gold',            label: 'Gold',               prefix: '$', decimals: 2, unit: '/oz'  },
            { key: 'silver',          label: 'Silver',             prefix: '$', decimals: 3, unit: '/oz'  },
            { key: 'natural_gas',     label: 'Natural Gas',        prefix: '$', decimals: 3, unit: '/MMBtu' },
            { key: 'aluminum',        label: 'Aluminum',           prefix: '$', decimals: 4, unit: '/lb'  },
          ].map(({ key, label, prefix, decimals, unit }) => {
            const item = (data as Record<string, { price: number; change_pct: number }>)[key];
            if (!item || item.price === 0) return null;
            return (
              <DataRow
                key={key}
                label={label}
                value={item.price}
                change_pct={item.change_pct}
                prefix={prefix}
                decimals={decimals}
                unit={unit}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Global Indices ───────────────────────────────────────────────────────────
function GlobalIndicesSection() {
  const { data, loading, error } = useGlobalIndices();

  const specs = [
    { key: 'sp500',     decimals: 2 },
    { key: 'nasdaq',    decimals: 2 },
    { key: 'dow',       decimals: 2 },
    { key: 'vix',       decimals: 2 },
    { key: 'ftse100',   decimals: 2 },
    { key: 'nikkei',    decimals: 0 },
    { key: 'hang_seng', decimals: 0 },
    { key: 'shanghai',  decimals: 2 },
  ];

  return (
    <section className="trading-card">
      <div className="flex items-center gap-2 px-1 mb-3">
        <Globe className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Global Indices</h2>
      </div>

      {loading && (
        <div className="space-y-2">
          {specs.map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}
      {error && (
        <div className="flex gap-2 p-3 bg-bear/10 rounded text-bear text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {data && !loading && (
        <div className="rounded-md border border-border overflow-hidden">
          {specs.map(({ key, decimals }) => {
            const item = (data as Record<string, { label: string; price: number; change_pct: number }>)[key];
            if (!item || item.price === 0) return null;
            return (
              <DataRow
                key={key}
                label={item.label}
                value={item.price}
                change_pct={item.change_pct}
                decimals={decimals}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── GIFT Nifty / SGX ─────────────────────────────────────────────────────────
function GiftNiftyCard() {
  const { data, loading } = useMacroSnapshot();
  const gn = data?.gift_nifty;

  if (loading || !gn) return null;

  const up = gn.direction === 'positive';
  const flat = gn.direction === 'flat';

  return (
    <div className={cn(
      'trading-card flex items-center gap-4',
      up ? 'border border-bull/20 bg-bull/5' : flat ? '' : 'border border-bear/20 bg-bear/5',
    )}>
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
        up ? 'bg-bull/20' : flat ? 'bg-muted' : 'bg-bear/20',
      )}>
        {up ? <TrendingUp className="w-5 h-5 text-bull" /> :
         flat ? <TrendingUp className="w-5 h-5 text-muted-foreground" /> :
         <TrendingDown className="w-5 h-5 text-bear" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">GIFT Nifty (estimated)</p>
        <p className={cn('text-2xl font-bold font-mono', up ? 'text-bull' : flat ? 'text-foreground' : 'text-bear')}>
          {fmt(gn.gift_nifty_approx, 2)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Gap: {gn.gap_vs_prev_close_pct >= 0 ? '+' : ''}{gn.gap_vs_prev_close_pct}% vs prev close •{' '}
          {gn.sp500_futures_change_pct != null && (
            <>S&P 500 futures: {gn.sp500_futures_change_pct >= 0 ? '+' : ''}{gn.sp500_futures_change_pct}%</>
          )}
        </p>
      </div>
      <div className={cn(
        'text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide',
        up ? 'bg-bull/20 text-bull' : flat ? 'bg-muted text-muted-foreground' : 'bg-bear/20 text-bear',
      )}>
        {gn.direction}
      </div>
    </div>
  );
}

// ─── Main Macro Page ──────────────────────────────────────────────────────────
export default function Macro() {
  const { refetch: refreshAll } = useMacroSnapshot();

  return (
    <div className="p-5 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Macro Pulse</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Global markets, forex, commodities, and GIFT Nifty indicator
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* GIFT Nifty Indicator */}
      <GiftNiftyCard />

      {/* 2-column grid for wider screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ForexSection />
        <CommoditiesSection />
      </div>

      <GlobalIndicesSection />

      <p className="text-[10px] text-muted-foreground text-center pb-2">
        Data sourced via Yahoo Finance. Refreshes every 5 minutes. For informational purposes only.
      </p>
    </div>
  );
}
