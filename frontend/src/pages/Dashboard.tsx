import React, { useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw,
  ArrowUpRight, ArrowDownRight, Activity, DollarSign,
  BarChart2, Zap, AlertCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useIndices, useFiiDii, useTopMovers, useMacroSnapshot } from '../hooks/useMarketData';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return '--';
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCrore(n: number | null): string {
  if (n === null || n === undefined) return '--';
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const h = ist.getHours();
  const m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 555 && mins <= 930; // 9:15 AM – 3:30 PM IST
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse bg-muted rounded', className)} />
  );
}

function ChangeChip({ val, suffix = '%' }: { val: number; suffix?: string }) {
  const up = val >= 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs font-medium',
      up ? 'text-bull' : 'text-bear',
    )}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(val).toFixed(2)}{suffix}
    </span>
  );
}

// ─── Index Card ───────────────────────────────────────────────────────────────
interface IndexCardProps {
  name: string;
  price: number;
  change: number;
  change_pct: number;
  day_high: number;
  day_low: number;
  loading?: boolean;
  error?: boolean;
}

function IndexCard({ name, price, change, change_pct, day_high, day_low, loading, error }: IndexCardProps) {
  const up = change_pct >= 0;

  if (loading) {
    return (
      <div className="trading-card">
        <Skeleton className="h-3 w-16 mb-2" />
        <Skeleton className="h-7 w-28 mb-1" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (error || price === 0) {
    return (
      <div className="trading-card opacity-50 text-center">
        <p className="text-xs text-muted-foreground mb-1">{name}</p>
        <p className="text-sm text-muted-foreground">Unavailable</p>
      </div>
    );
  }

  return (
    <div className={cn(
      'trading-card transition-all hover:shadow-md',
      up ? 'border-l-2 border-bull/40' : 'border-l-2 border-bear/40',
    )}>
      <p className="text-xs text-muted-foreground mb-1 font-medium">{name}</p>
      <p className={cn('text-2xl font-bold font-mono tracking-tight', up ? 'text-bull' : 'text-bear')}>
        {fmt(price, 2)}
      </p>
      <div className="flex items-center justify-between mt-1">
        <ChangeChip val={change_pct} />
        <span className={cn('text-xs font-mono', up ? 'text-bull' : 'text-bear')}>
          {change >= 0 ? '+' : ''}{fmt(change, 2)}
        </span>
      </div>
      {(day_high > 0 || day_low > 0) && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">H: <span className="text-bull font-mono">{fmt(day_high, 0)}</span></span>
          <span className="text-[10px] text-muted-foreground">L: <span className="text-bear font-mono">{fmt(day_low, 0)}</span></span>
        </div>
      )}
    </div>
  );
}

// ─── FII/DII Widget ───────────────────────────────────────────────────────────
function FiiDiiWidget() {
  const { data, loading, error } = useFiiDii();

  if (loading) {
    return (
      <div className="trading-card space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="trading-card flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">FII / DII Activity</p>
          <p className="text-xs text-muted-foreground mt-1">
            {error || 'NSE India API unavailable. Data loads during market hours.'}
          </p>
        </div>
      </div>
    );
  }

  const fiiNet = data.fii_net;
  const diiNet = data.dii_net;
  const mood   = data.market_mood;

  if (data.error || fiiNet === null) {
    return (
      <div className="trading-card">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">FII / DII Activity</p>
        </div>
        <p className="text-xs text-muted-foreground">{data.error || 'Data unavailable outside market hours.'}</p>
      </div>
    );
  }

  return (
    <div className="trading-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">FII / DII Activity</p>
        </div>
        <span className={cn(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide',
          mood === 'bullish' ? 'bg-bull/10 text-bull' :
          mood === 'bearish' ? 'bg-bear/10 text-bear' :
          'bg-muted text-muted-foreground',
        )}>
          {mood}
        </span>
      </div>
      <div className="space-y-2">
        {[
          { label: 'FII / FPI', net: fiiNet },
          { label: 'DII',       net: diiNet },
        ].map(({ label, net }) => net !== null && (
          <div key={label} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-secondary/50">
            <span className="text-sm text-muted-foreground font-medium">{label}</span>
            <span className={cn(
              'text-sm font-bold font-mono',
              (net ?? 0) >= 0 ? 'text-bull' : 'text-bear',
            )}>
              {fmtCrore(net)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">Source: {data.source}</p>
    </div>
  );
}

// ─── Macro Snapshot Widget ────────────────────────────────────────────────────
function MacroSnapshotWidget() {
  const { data, loading } = useMacroSnapshot();

  if (loading) {
    return (
      <div className="trading-card space-y-3">
        <Skeleton className="h-4 w-28" />
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (!data) return null;

  const forex = data.forex;
  const commodities = data.commodities;
  const giftNifty = data.gift_nifty;

  const macroRows = [
    { label: 'USD / INR',         val: forex?.usd_inr?.rate,          chg: forex?.usd_inr?.change_pct,  decimals: 4, prefix: '₹' },
    { label: 'Crude Oil (WTI)',    val: commodities?.crude_oil_wti?.price, chg: commodities?.crude_oil_wti?.change_pct,  decimals: 2, prefix: '$', suffix: '/bbl' },
    { label: 'Gold',               val: commodities?.gold?.price,       chg: commodities?.gold?.change_pct,           decimals: 2, prefix: '$', suffix: '/oz'  },
    { label: 'GIFT Nifty (est.)',  val: giftNifty?.gift_nifty_approx,   chg: giftNifty?.gap_vs_prev_close_pct,       decimals: 2, prefix: ''  },
  ];

  return (
    <div className="trading-card">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Macro Snapshot</p>
      </div>
      <div className="space-y-1.5">
        {macroRows.map(({ label, val, chg, decimals, prefix, suffix }) => (
          <div key={label} className="flex items-center justify-between py-1 px-3 rounded bg-secondary/40">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-medium text-foreground">
                {prefix}{fmt(val, decimals)}{suffix || ''}
              </span>
              {chg !== undefined && chg !== null && (
                <ChangeChip val={chg} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Top Movers Widget ────────────────────────────────────────────────────────
function TopMoversWidget() {
  const { data, loading } = useTopMovers();
  const [tab, setTab] = React.useState<'gainers' | 'losers'>('gainers');

  if (loading) {
    return (
      <div className="trading-card">
        <Skeleton className="h-4 w-28 mb-3" />
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full mb-1.5" />)}
      </div>
    );
  }

  if (!data) return null;

  const items = tab === 'gainers' ? data.gainers : data.losers;

  return (
    <div className="trading-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Top Movers</p>
        </div>
        <div className="flex rounded-md overflow-hidden border border-border text-xs">
          {(['gainers', 'losers'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-2.5 py-1 font-medium capitalize transition-colors',
                tab === t
                  ? t === 'gainers' ? 'bg-bull text-white' : 'bg-bear text-white'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        {items.slice(0, 5).map((item) => (
          <div key={item.ticker} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/50 transition-colors">
            <div>
              <p className="text-xs font-semibold text-foreground">{item.ticker.replace('.NS', '').replace('.BO', '')}</p>
              <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.company}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono text-foreground">₹{fmt(item.price, 2)}</p>
              <ChangeChip val={item.change_pct} />
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Data unavailable — try during market hours</p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">Source: {data.source}</p>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: indices, loading: indicesLoading, error: indicesError, refetch } = useIndices();
  const marketOpen = useMemo(isMarketOpen, []);

  return (
    <div className="p-5 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Command Center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetch}
            className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
            marketOpen ? 'bg-bull/10 text-bull' : 'bg-muted text-muted-foreground',
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', marketOpen ? 'bg-bull animate-pulse' : 'bg-muted-foreground')} />
            {marketOpen ? 'Market Open' : 'Market Closed'}
          </div>
        </div>
      </div>

      {/* Indices Bar — 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['nifty50', 'sensex', 'banknifty'] as const).map((key) => {
          const idx = indices?.[key];
          return (
            <IndexCard
              key={key}
              name={idx?.name || (key === 'nifty50' ? 'Nifty 50' : key === 'sensex' ? 'Sensex' : 'Bank Nifty')}
              price={idx?.price ?? 0}
              change={idx?.change ?? 0}
              change_pct={idx?.change_pct ?? 0}
              day_high={idx?.day_high ?? 0}
              day_low={idx?.day_low ?? 0}
              loading={indicesLoading}
              error={!!indicesError}
            />
          );
        })}
      </div>

      {/* Indices error banner */}
      {indicesError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-bear/10 border border-bear/20 text-bear text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Live index data unavailable: {indicesError}. Data auto-refreshes every 60 seconds.</span>
        </div>
      )}

      {/* 2×2 Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FiiDiiWidget />
        <MacroSnapshotWidget />
        <TopMoversWidget />

        {/* Phase 4 placeholder — AI Conviction Calls */}
        <div className="trading-card border-dashed">
          <div className="flex items-center gap-3 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">AI Conviction Calls</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Today's top stock picks with confidence scores — powered by NVIDIA AI. Live in Phase 4.
          </p>
          <div className="mt-3 space-y-1.5">
            {['RELIANCE.NS', 'HDFCBANK.NS', 'TCS.NS'].map(t => (
              <div key={t} className="flex items-center justify-between py-1.5 px-3 rounded bg-secondary/40 opacity-40">
                <span className="text-xs text-muted-foreground">{t.replace('.NS', '')}</span>
                <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">Phase 4</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Global Markets preview strip */}
      <GlobalIndicesStrip />
    </div>
  );
}

// ─── Global Indices Strip ─────────────────────────────────────────────────────
function GlobalIndicesStrip() {
  const { data, loading } = useMacroSnapshot();

  if (loading) {
    return (
      <div className="trading-card">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="flex gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 flex-1" />)}
        </div>
      </div>
    );
  }

  const gi = data?.global_indices;
  if (!gi) return null;

  const show = [
    { key: 'sp500',     data: gi.sp500 },
    { key: 'nasdaq',    data: gi.nasdaq },
    { key: 'dow',       data: gi.dow },
    { key: 'vix',       data: gi.vix },
    { key: 'nikkei',    data: gi.nikkei },
    { key: 'hang_seng', data: gi.hang_seng },
  ].filter(d => d.data && d.data.price > 0);

  if (show.length === 0) return null;

  return (
    <div className="trading-card">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Global Markets</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {show.map(({ key, data: idx }) => {
          const up = idx.change_pct >= 0;
          return (
            <div key={key} className="text-center py-2 px-1 rounded-md bg-secondary/40">
              <p className="text-[10px] text-muted-foreground mb-0.5 truncate">{idx.label}</p>
              <p className="text-sm font-mono font-semibold text-foreground">{fmt(idx.price, key === 'vix' ? 2 : 0)}</p>
              <p className={cn('text-[10px] font-medium', up ? 'text-bull' : 'text-bear')}>
                {up ? '+' : ''}{idx.change_pct.toFixed(2)}%
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
