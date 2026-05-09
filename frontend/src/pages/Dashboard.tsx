import React, { useMemo } from 'react';
import {
  RefreshCw, ArrowUpRight, ArrowDownRight,
  Activity, DollarSign, BarChart2, Zap,
  AlertCircle, Newspaper, Target,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useIndices, useFiiDii, useTopMovers, useMacroSnapshot,
  useSectorIndices, useIndiaMarketNews, usePredictions,
} from '../hooks/useMarketData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Prediction {
  id: number;
  ticker: string;
  company_name: string;
  verdict: string;
  confidence: number;
  signal_stack_score?: number;
  reasoning?: string;
  predicted_at: string;
}

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
  return mins >= 555 && mins <= 930;
}

// ─── Base Sub-components ──────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} />;
}

function ChangeChip({ val, suffix = '%' }: { val: number; suffix?: string }) {
  const up = val >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', up ? 'text-bull' : 'text-bear')}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(val).toFixed(2)}{suffix}
    </span>
  );
}

// ─── Index Card ───────────────────────────────────────────────────────────────

interface IndexCardProps {
  name: string; price: number; change: number; change_pct: number;
  day_high: number; day_low: number; loading?: boolean; error?: boolean;
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
    <div className={cn('trading-card transition-all hover:shadow-md', up ? 'border-l-2 border-bull/40' : 'border-l-2 border-bear/40')}>
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

// ─── Market Mood Strip ────────────────────────────────────────────────────────

function MarketMoodStrip() {
  const { data: fiiData } = useFiiDii();
  const { data: indices } = useIndices();

  const niftyChange = indices?.nifty50?.change_pct ?? null;
  const fiiNet = fiiData?.fii_net ?? null;
  const rawMood = fiiData?.market_mood ?? (niftyChange !== null ? (niftyChange >= 0 ? 'bullish' : 'bearish') : null);

  if (!rawMood) return null;

  const mood = rawMood === 'bullish' ? 'bullish' : rawMood === 'bearish' ? 'bearish' : 'mixed';

  function moodText(): string {
    if (mood === 'bullish') {
      if (fiiNet !== null && fiiNet > 500)
        return `FII net buyers ₹${Math.round(Math.abs(fiiNet)).toLocaleString('en-IN')} Cr today. Institutional support is firm — bullish bias for the session.`;
      if (niftyChange !== null && niftyChange > 0.5)
        return `Market breadth is positive (Nifty +${niftyChange.toFixed(2)}%). Momentum favours buyers — maintain positions, watch resistance.`;
      return 'Broad market trending bullish. Maintain positions and watch for key resistance levels.';
    }
    if (mood === 'bearish') {
      if (fiiNet !== null && fiiNet < -500)
        return `FII net sellers ₹${Math.round(Math.abs(fiiNet)).toLocaleString('en-IN')} Cr today. Institutional selling — caution on fresh longs.`;
      if (niftyChange !== null && niftyChange < -0.5)
        return `Market under pressure (Nifty ${niftyChange.toFixed(2)}%). Risk-off mode — avoid aggressive entries today.`;
      return 'Selling pressure visible in broad market. Stock-specific approach — avoid broad exposure.';
    }
    return 'Mixed institutional flows. Divergence between FII and DII. Selective, high-conviction entries only today.';
  }

  const palette = {
    bullish: { outer: 'bg-bull/8 border-bull/20', dot: 'bg-bull animate-pulse', label: 'text-bull', badge: 'BULLISH' },
    bearish: { outer: 'bg-bear/8 border-bear/20', dot: 'bg-bear animate-pulse', label: 'text-bear', badge: 'BEARISH' },
    mixed:   { outer: 'bg-amber-500/8 border-amber-500/20', dot: 'bg-amber-500', label: 'text-amber-500', badge: 'MIXED' },
  }[mood];

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5 rounded-lg border', palette.outer)}>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', palette.dot)} />
        <span className={cn('text-xs font-bold tracking-wider uppercase', palette.label)}>{palette.badge}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">{moodText()}</p>
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
          <p className="text-xs text-muted-foreground mt-1">{error || 'NSE India API unavailable. Data loads during market hours.'}</p>
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
            <span className={cn('text-sm font-bold font-mono', (net ?? 0) >= 0 ? 'text-bull' : 'text-bear')}>
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

  const forex       = data.forex;
  const commodities = data.commodities;
  const giftNifty   = data.gift_nifty;

  const macroRows = [
    { label: 'USD / INR',        val: forex?.usd_inr?.rate,              chg: forex?.usd_inr?.change_pct,          decimals: 4, prefix: '₹' },
    { label: 'Crude Oil (WTI)',  val: commodities?.crude_oil_wti?.price, chg: commodities?.crude_oil_wti?.change_pct, decimals: 2, prefix: '$', suffix: '/bbl' },
    { label: 'Gold',             val: commodities?.gold?.price,          chg: commodities?.gold?.change_pct,         decimals: 2, prefix: '$', suffix: '/oz'  },
    { label: 'GIFT Nifty (est.)',val: giftNifty?.gift_nifty_approx,     chg: giftNifty?.gap_vs_prev_close_pct,     decimals: 2, prefix: '' },
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
              {chg !== undefined && chg !== null && <ChangeChip val={chg} />}
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

// ─── AI Conviction Calls Widget ───────────────────────────────────────────────

const VERDICT_COLORS: Record<string, string> = {
  BUY:   'bg-bull/10 text-bull border-bull/20',
  SELL:  'bg-bear/10 text-bear border-bear/20',
  HOLD:  'bg-amber-500/10 text-amber-500 border-amber-500/20',
  WATCH: 'bg-muted text-muted-foreground border-border',
};

function ConvictionCallsWidget() {
  const { data, loading } = usePredictions();

  if (loading) {
    return (
      <div className="trading-card space-y-3">
        <Skeleton className="h-4 w-32" />
        {[1,2,3].map(i => <Skeleton key={i} className="h-11 w-full" />)}
      </div>
    );
  }

  const predictions = (data?.predictions ?? []) as Prediction[];
  const top3 = predictions.slice(0, 3);

  return (
    <div className="trading-card">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">AI Conviction Calls</p>
      </div>

      {top3.length === 0 ? (
        <div className="py-5 text-center">
          <Zap className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No predictions yet.</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Analyse a stock in AI Chat to generate predictions.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {top3.map((pred) => {
            const ticker = (pred.ticker || '').replace('.NS', '').replace('.BO', '');
            const verdictClass = VERDICT_COLORS[pred.verdict] ?? VERDICT_COLORS.WATCH;
            const conf = pred.confidence ?? 0;
            const confClass = conf >= 75 ? 'text-bull' : conf >= 60 ? 'text-amber-500' : 'text-bear';
            return (
              <div key={pred.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-secondary/50 hover:bg-accent/50 transition-colors">
                <div>
                  <p className="text-xs font-semibold text-foreground">{ticker}</p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[110px]">{pred.company_name || ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-bold font-mono tabular-nums', confClass)}>{conf}%</span>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide', verdictClass)}>
                    {pred.verdict}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-2">5-signal AI analysis · Not financial advice</p>
    </div>
  );
}

// ─── Sector Heat Map ──────────────────────────────────────────────────────────

function sectorColor(pct: number): string {
  if (pct >= 2)    return 'bg-bull/20 border-bull/40 text-bull';
  if (pct >= 0.3)  return 'bg-bull/8 border-bull/20 text-bull';
  if (pct >= -0.3) return 'bg-muted/40 border-border/60 text-muted-foreground';
  if (pct >= -2)   return 'bg-bear/8 border-bear/20 text-bear';
  return                  'bg-bear/20 border-bear/40 text-bear';
}

function SectorHeatMap() {
  const { data, loading } = useSectorIndices();

  if (loading) {
    return (
      <div className="trading-card">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  if (!data || data.sectors.length === 0) return null;

  return (
    <div className="trading-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Sector Heat Map</p>
        </div>
        <span className="text-[10px] text-muted-foreground">NSE India · {data.sectors.length} sectors</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {data.sectors.map((sector) => (
          <div
            key={sector.name}
            className={cn(
              'flex flex-col items-center justify-center py-3 px-2 rounded-md border text-center transition-colors',
              sectorColor(sector.change_pct),
            )}
          >
            <p className="text-[11px] font-semibold leading-tight">{sector.name}</p>
            <p className="text-sm font-bold font-mono mt-1">
              {sector.change_pct >= 0 ? '+' : ''}{sector.change_pct.toFixed(2)}%
            </p>
          </div>
        ))}
      </div>
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

// ─── Live News Ticker ─────────────────────────────────────────────────────────

function NewsTickerStrip() {
  const { data, loading } = useIndiaMarketNews();

  if (loading || !data || data.articles.length === 0) return null;

  const articles = data.articles.filter(a => a.title).slice(0, 25);
  if (articles.length === 0) return null;

  const tickerItems = articles.map((a, i) => {
    const sentDot =
      a.sentiment === 'POSITIVE' ? 'bg-bull' :
      a.sentiment === 'NEGATIVE' ? 'bg-bear' :
      'bg-muted-foreground/50';
    return (
      <span key={i} className="inline-flex items-center gap-1.5 mr-10 flex-shrink-0">
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', sentDot)} />
        <span className="text-[11px] font-semibold text-foreground/70 whitespace-nowrap">{a.source}:</span>
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
        >
          {a.title}
        </a>
      </span>
    );
  });

  return (
    <div className="flex items-center gap-0 bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-primary/10 border-r border-border/60">
        <Newspaper className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-[10px] font-bold text-primary uppercase tracking-wider whitespace-nowrap">Live</span>
      </div>
      <div className="overflow-hidden flex-1 py-2">
        <div className="flex animate-marquee">
          {tickerItems}
          {tickerItems}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: indices, loading: indicesLoading, error: indicesError, refetch } = useIndices();
  const marketOpen = useMemo(isMarketOpen, []);

  return (
    <div className="p-5 space-y-4 max-w-7xl mx-auto">

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

      {/* Index Cards — 3 cols */}
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

      {/* Market Mood Strip */}
      <MarketMoodStrip />

      {/* Indices error banner */}
      {indicesError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-bear/10 border border-bear/20 text-bear text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Live index data unavailable: {indicesError}. Auto-refreshes every 60 seconds.</span>
        </div>
      )}

      {/* 2×2 Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FiiDiiWidget />
        <ConvictionCallsWidget />
        <MacroSnapshotWidget />
        <TopMoversWidget />
      </div>

      {/* Sector Heat Map */}
      <SectorHeatMap />

      {/* Global Markets */}
      <GlobalIndicesStrip />

      {/* Live News Ticker */}
      <NewsTickerStrip />

    </div>
  );
}
