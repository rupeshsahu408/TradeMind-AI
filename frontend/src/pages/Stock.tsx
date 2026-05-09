import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'wouter';
import {
  TrendingUp, TrendingDown, Minus, Search, Zap, BarChart2,
  AlertCircle, Square, Newspaper, Users, Activity, Building2,
  ExternalLink, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '../lib/utils';
import {
  marketApi, nseApi, technicalApi, newsApi, sentimentApi, aiApi,
  SignalStack, SignalEntry,
} from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';

// ─── Local Types ──────────────────────────────────────────────────────────────

interface QuoteRow {
  ticker: string; company: string; price: number; change: number;
  change_pct: number; volume: number; day_high: number; day_low: number;
  week_52_high: number; week_52_low: number; open: number; prev_close: number;
  currency: string; exchange: string;
}

interface FundRow {
  company: string; sector: string; industry: string;
  pe_ratio: number | null; price_to_book: number | null;
  market_cap_cr: number | null; dividend_yield: number | null;
  roe: number | null; roce: number | null; eps: number | null;
  book_value: number | null; week_52_high: number; week_52_low: number;
  fifty_day_avg: number; two_hundred_day_avg: number;
  screener_raw: Record<string, string>;
}

interface TechRow {
  overall_signal: string;
  rsi: { rsi: number; signal: string; interpretation: string } | null;
  macd: { macd: number; signal: number; histogram: number; trend: string; interpretation: string } | null;
}

interface OptionsRow {
  put_call_ratio: number; atm_strike: number; total_call_oi: number;
  total_put_oi: number; sentiment: string; nearest_expiry: string;
}

interface NewsRow {
  title: string; url: string; source: string; published_at: string; sentiment: string | null;
}

interface RedditRow {
  status: string; mention_count: number; positive: number; negative: number;
  neutral: number; net_sentiment: string; reason?: string;
  top_posts: Array<{ title: string; score: number; sub: string; sentiment: string }>;
}

interface TrendsRow {
  status: string; direction?: string; peak_score?: number; current?: number;
  history?: Array<{ date: string; value: number }>;
}

interface FiiRow { fii_net: number | null; dii_net: number | null; market_mood: string }

interface YouTubeRow {
  status: string;
  total: number;
  videos: Array<{
    title: string; channel: string; published_at: string;
    url: string; thumbnail: string; sentiment: string | null;
  }>;
}

interface EarningsRow {
  quarterly: Array<{ metric: string; data: Record<string, string> }>;
  next_earnings: string | null;
  source: string;
}

interface BollingerRow {
  upper_band:     number;
  middle_band:    number;
  lower_band:     number;
  bandwidth_pct:  number;
  interpretation: string;
  error?:         string;
}

interface CandlestickRow {
  patterns_detected: number;
  patterns:          Array<{ date: string; pattern: string; signal: string; description: string }>;
  latest_pattern:    { date: string; pattern: string; signal: string; description: string } | null;
  signal:            string;
  interpretation:    string;
  error?:            string;
}

interface StockPageData {
  quote:        QuoteRow | null;
  fundamentals: FundRow | null;
  technical:    TechRow | null;
  news:         NewsRow[];
  options:      OptionsRow | null;
  fiiDii:       FiiRow | null;
  reddit:       RedditRow | null;
  trends:       TrendsRow | null;
  youtube:      YouTubeRow | null;
  earnings:     EarningsRow | null;
  bollinger:    BollingerRow | null;
  candlestick:  CandlestickRow | null;
}

// ─── Chart periods ────────────────────────────────────────────────────────────

const CHART_PERIODS = [
  { label: '1W', period: '5d',  interval: '1d'  },
  { label: '1M', period: '1mo', interval: '1d'  },
  { label: '3M', period: '3mo', interval: '1d'  },
  { label: '1Y', period: '1y',  interval: '1wk' },
] as const;

// ─── Popular tickers ──────────────────────────────────────────────────────────

const POPULAR = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HDFC', 'BAJFINANCE', 'WIPRO', 'AXISBANK', 'SBIN',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined) return '--';
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCr(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--';
  const abs = Math.abs(n);
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)}L Cr`;
  if (abs >= 1000)   return `₹${(n / 1000).toFixed(1)}K Cr`;
  return `₹${n.toFixed(0)} Cr`;
}

function fmtVol(n: number): string {
  if (!n) return '--';
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `${(n / 100000).toFixed(2)} L`;
  return n.toLocaleString('en-IN');
}

function fmtDate(ts: string): string {
  try { return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} />;
}

// ─── ChangeChip ───────────────────────────────────────────────────────────────

function ChangeChip({ val, size = 'sm' }: { val: number; size?: 'sm' | 'lg' }) {
  const up = val >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium', up ? 'text-bull' : 'text-bear', size === 'lg' ? 'text-base' : 'text-xs')}>
      <Icon className={size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'} />
      {Math.abs(val).toFixed(2)}%
    </span>
  );
}

// ─── Sentiment Badge ──────────────────────────────────────────────────────────

function SentBadge({ s }: { s: string | null }) {
  if (!s) return null;
  const cfg: Record<string, string> = {
    POSITIVE: 'bg-bull/10 text-bull border-bull/20',
    NEGATIVE: 'bg-bear/10 text-bear border-bear/20',
    NEUTRAL:  'bg-muted text-muted-foreground border-border',
  };
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide flex-shrink-0', cfg[s] ?? cfg.NEUTRAL)}>
      {s}
    </span>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ title, icon: Icon, children, className }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('bg-card border border-border rounded-xl', className)}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Quote Header ─────────────────────────────────────────────────────────────

function QuoteHeader({ quote, fund }: { quote: QuoteRow; fund: FundRow | null }) {
  const up = quote.change_pct >= 0;
  const w52High = fund?.week_52_high || quote.week_52_high;
  const w52Low  = fund?.week_52_low  || quote.week_52_low;
  const rangePos = w52High > w52Low
    ? Math.max(0, Math.min(100, ((quote.price - w52Low) / (w52High - w52Low)) * 100))
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">

      {/* Company + Price */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">
              {quote.ticker?.replace('.NS', '').replace('.BO', '')}
            </span>
            <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-muted-foreground">NSE</span>
            {fund?.sector && fund.sector !== 'N/A' && (
              <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-muted-foreground">{fund.sector}</span>
            )}
          </div>
          <h1 className="text-lg font-bold text-foreground mt-0.5 leading-tight">
            {quote.company || fund?.company || quote.ticker}
          </h1>
          {fund?.industry && fund.industry !== 'N/A' && (
            <p className="text-[11px] text-muted-foreground">{fund.industry}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={cn('text-3xl font-bold font-mono tracking-tight', up ? 'text-bull' : 'text-bear')}>
            ₹{fmt(quote.price, 2)}
          </p>
          <div className="flex items-center gap-2 justify-end mt-0.5">
            <ChangeChip val={quote.change_pct} size="lg" />
            <span className={cn('text-sm font-mono', up ? 'text-bull' : 'text-bear')}>
              {quote.change >= 0 ? '+' : ''}₹{fmt(Math.abs(quote.change), 2)}
            </span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-border/50">
        {[
          { label: 'Open',          value: `₹${fmt(quote.open, 2)}`      },
          { label: 'Prev Close',    value: `₹${fmt(quote.prev_close, 2)}` },
          { label: "Day's Range",   value: `₹${fmt(quote.day_low, 0)} – ₹${fmt(quote.day_high, 0)}` },
          { label: 'Volume',        value: fmtVol(quote.volume)           },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="text-xs font-mono font-semibold text-foreground mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* 52-Week range bar */}
      {w52High > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground">52-Week Range</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              ₹{fmt(w52Low, 0)} — ₹{fmt(w52High, 0)}
            </span>
          </div>
          <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
            {/* Gradient track */}
            <div className="absolute inset-0 rounded-full"
              style={{ background: 'linear-gradient(to right, #ef4444, #f59e0b, #22c55e)', opacity: 0.25 }} />
            {/* Current position marker */}
            {rangePos !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-foreground rounded-full shadow"
                style={{ left: `${rangePos}%` }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
            <span>52W Low</span>
            {rangePos !== null && <span className="font-medium text-foreground">{rangePos.toFixed(0)}% from low</span>}
            <span>52W High</span>
          </div>
          {(fund?.fifty_day_avg ?? 0) > 0 && (
            <div className="flex gap-4 mt-1.5">
              <span className="text-[10px] text-muted-foreground">
                50D avg: <span className="text-foreground font-mono font-medium">₹{fmt(fund!.fifty_day_avg, 0)}</span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                200D avg: <span className="text-foreground font-mono font-medium">₹{fmt(fund!.two_hundred_day_avg, 0)}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Price Chart ──────────────────────────────────────────────────────────────

function PriceChart({ ticker }: { ticker: string }) {
  const [period, setPeriod]   = useState<typeof CHART_PERIODS[number]>(CHART_PERIODS[1]);
  const [points, setPoints]   = useState<Array<{ date: string; close: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const fetchChart = useCallback(async (p: typeof CHART_PERIODS[number]) => {
    setLoading(true);
    setError('');
    try {
      const res = await marketApi.history(`${ticker}.NS`, p.period, p.interval) as unknown as {
        data: Array<{ date?: string; time?: string; close: number }>
      };
      setPoints((res?.data || []).map(c => ({ date: c.date || c.time || '', close: c.close })));
    } catch {
      setError('Chart data unavailable');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { if (ticker) fetchChart(period); }, [ticker, fetchChart]);

  const first = points[0]?.close ?? 0;
  const last  = points[points.length - 1]?.close ?? 0;
  const isUp  = last >= first;
  const color = isUp ? '#22c55e' : '#ef4444';

  function tick(d: string): string {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Price Chart</h2>
          {points.length > 0 && !loading && (
            <span className={cn('text-xs font-medium', isUp ? 'text-bull' : 'text-bear')}>
              {isUp ? '▲' : '▼'} {Math.abs(((last - first) / first) * 100).toFixed(2)}% ({period.label})
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {CHART_PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => { setPeriod(p); fetchChart(p); }}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium rounded transition-colors',
                period.label === p.label
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >{p.label}</button>
          ))}
        </div>
      </div>
      <div className="px-4 pt-3 pb-2">
        {loading && (
          <div className="h-48 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && error && (
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">{error}</div>
        )}
        {!loading && !error && points.length === 0 && (
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No chart data</div>
        )}
        {!loading && !error && points.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={tick}
                tick={{ fontSize: 9, fill: '#888' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 9, fill: '#888' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `₹${Math.round(v).toLocaleString('en-IN')}`}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '11px',
                  padding: '6px 10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
                labelFormatter={l => new Date(String(l)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                formatter={(v: number) => [`₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Close']}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={color}
                strokeWidth={2}
                fill="url(#stockGrad)"
                dot={false}
                activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Technical Card ───────────────────────────────────────────────────────────

function TechnicalCard({ tech, quote, fund, bollinger, candlestick }: {
  tech: TechRow | null; quote: QuoteRow | null; fund: FundRow | null;
  bollinger: BollingerRow | null; candlestick: CandlestickRow | null;
}) {
  if (!tech) return (
    <Card title="Technical Indicators" icon={Activity}>
      <p className="text-xs text-muted-foreground">Technical data unavailable. Alpha Vantage key may not be configured.</p>
    </Card>
  );

  const rsi  = tech.rsi;
  const macd = tech.macd;
  const sig  = tech.overall_signal;

  // RSI coloring
  const rsiNum = rsi?.rsi ?? 50;
  const rsiDotColor = rsiNum > 70 ? '#ef4444' : rsiNum < 30 ? '#22c55e' : rsiNum >= 40 ? '#22c55e' : '#f59e0b';
  const rsiTextColor = rsiNum > 70 ? 'text-bear' : rsiNum < 30 ? 'text-bull' : rsiNum >= 40 ? 'text-bull' : 'text-amber-500';

  function rsiLabel(v: number): string {
    if (v > 70) return 'Overbought';
    if (v < 30) return 'Oversold';
    if (v >= 55) return 'Bullish Zone';
    return 'Neutral';
  }

  // ── Trend Direction (price vs 50D / 200D averages) ──
  const price = quote?.price ?? 0;
  const f50D  = fund?.fifty_day_avg ?? 0;
  const f200D = fund?.two_hundred_day_avg ?? 0;
  let trendDir   = '';
  let trendStyle = '';
  if (price > 0 && f50D > 0 && f200D > 0) {
    if      (price > f50D && f50D > f200D) { trendDir = 'UPTREND';   trendStyle = 'bg-bull/10 text-bull'; }
    else if (price < f50D && f50D < f200D) { trendDir = 'DOWNTREND'; trendStyle = 'bg-bear/10 text-bear'; }
    else                                    { trendDir = 'SIDEWAYS';  trendStyle = 'bg-amber-500/10 text-amber-500'; }
  }

  // ── Support & Resistance (Fibonacci on 52-Week range) ──
  const w52H  = (fund?.week_52_high ?? 0) || (quote?.week_52_high ?? 0);
  const w52L  = (fund?.week_52_low  ?? 0) || (quote?.week_52_low  ?? 0);
  const range = w52H - w52L;
  const support    = range > 0 ? w52L + range * 0.382 : null;
  const resistance = range > 0 ? w52L + range * 0.618 : null;

  return (
    <Card title="Technical Indicators" icon={Activity}>
      <div className="space-y-4">

        {/* Overall signal + Trend direction */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50">
          <span className="text-xs text-muted-foreground font-medium flex-1">Overall Signal</span>
          {trendDir && (
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', trendStyle)}>
              {trendDir}
            </span>
          )}
          <span className={cn(
            'text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide',
            sig === 'bullish' ? 'bg-bull/10 text-bull'
            : sig === 'bearish' ? 'bg-bear/10 text-bear'
            : 'bg-muted text-muted-foreground',
          )}>
            {sig?.toUpperCase() || 'NEUTRAL'}
          </span>
        </div>

        {/* RSI */}
        {rsi && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">RSI (14)</span>
              <span className={cn('text-lg font-bold font-mono', rsiTextColor)}>{rsi.rsi}</span>
            </div>
            <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: '30%', background: 'rgba(34,197,94,0.18)' }} />
              <div className="absolute inset-y-0"                        style={{ left: '30%', width: '40%', background: 'rgba(245,158,11,0.08)' }} />
              <div className="absolute inset-y-0 right-0 rounded-r-full" style={{ width: '30%', background: 'rgba(239,68,68,0.18)' }} />
              <div
                className="absolute top-0.5 bottom-0.5 w-2 rounded-full shadow border border-background/60"
                style={{ left: `calc(${Math.min(Math.max(rsi.rsi, 1), 99)}% - 4px)`, backgroundColor: rsiDotColor }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-muted-foreground">Oversold &lt;30</span>
              <span className={cn('text-[9px] font-semibold', rsiTextColor)}>{rsiLabel(rsi.rsi)}</span>
              <span className="text-[9px] text-muted-foreground">Overbought &gt;70</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{rsi.interpretation}</p>
          </div>
        )}

        {/* MACD */}
        {macd && (
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">MACD</span>
              <span className={cn(
                'text-xs font-bold px-2.5 py-0.5 rounded-full',
                macd.trend === 'bullish' ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear',
              )}>
                {macd.trend?.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'MACD',      value: macd.macd      },
                { label: 'Signal',    value: macd.signal    },
                { label: 'Histogram', value: macd.histogram },
              ].map(({ label, value }) => (
                <div key={label} className="text-center py-2 px-1 bg-secondary/40 rounded-md">
                  <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
                  <p className={cn('text-[11px] font-mono font-semibold', value >= 0 ? 'text-bull' : 'text-bear')}>
                    {value.toFixed(4)}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{macd.interpretation}</p>
          </div>
        )}

        {/* Bollinger Bands */}
        {bollinger && !bollinger.error && bollinger.upper_band > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Bollinger Bands (20)
              </p>
              <span className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                bollinger.bandwidth_pct > 10
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-primary/10 text-primary',
              )}>
                {bollinger.bandwidth_pct > 10 ? 'HIGH VOL' : 'SQUEEZE'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { label: 'Upper',  value: bollinger.upper_band,  color: 'text-bear' },
                { label: 'Middle', value: bollinger.middle_band, color: 'text-foreground' },
                { label: 'Lower',  value: bollinger.lower_band,  color: 'text-bull' },
              ] as const).map(({ label, value, color }) => (
                <div key={label} className="text-center py-2 px-1 bg-secondary/40 rounded-md">
                  <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
                  <p className={cn('text-[11px] font-mono font-semibold', color)}>
                    ₹{fmt(value, 0)}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
              Bandwidth: {bollinger.bandwidth_pct.toFixed(1)}% ·{' '}
              {bollinger.bandwidth_pct > 10
                ? 'Wide bands — elevated volatility, trend is established.'
                : 'Narrow bands (squeeze) — breakout may be imminent.'}
            </p>
          </div>
        )}

        {/* Candlestick Pattern */}
        {candlestick && candlestick.latest_pattern && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Candlestick Pattern
              </p>
              <span className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                candlestick.latest_pattern.signal === 'bullish' ? 'bg-bull/10 text-bull'
                : candlestick.latest_pattern.signal === 'bearish' ? 'bg-bear/10 text-bear'
                : 'bg-muted text-muted-foreground',
              )}>
                {candlestick.latest_pattern.signal.toUpperCase()}
              </span>
            </div>
            <div className="py-2.5 px-3 rounded-lg bg-secondary/50 border border-border/50">
              <p className="text-xs font-semibold text-foreground">
                {candlestick.latest_pattern.pattern}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                {candlestick.latest_pattern.description}
              </p>
              <p className="text-[9px] text-muted-foreground/60 mt-1.5">
                Detected: {candlestick.latest_pattern.date}
                {candlestick.patterns_detected > 1 && ` · ${candlestick.patterns_detected} patterns in last 14 sessions`}
              </p>
            </div>
          </div>
        )}

        {/* Support / Resistance */}
        {support !== null && resistance !== null && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Key Levels <span className="font-normal normal-case">(Fibonacci on 52W range)</span>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="py-2 px-3 rounded-md bg-bull/5 border border-bull/20">
                <p className="text-[9px] text-muted-foreground">Support (38.2%)</p>
                <p className="text-xs font-bold font-mono text-bull">₹{fmt(support, 0)}</p>
              </div>
              <div className="py-2 px-3 rounded-md bg-bear/5 border border-bear/20">
                <p className="text-[9px] text-muted-foreground">Resistance (61.8%)</p>
                <p className="text-xs font-bold font-mono text-bear">₹{fmt(resistance, 0)}</p>
              </div>
            </div>
          </div>
        )}

        {!rsi && !macd && (
          <p className="text-xs text-muted-foreground">RSI and MACD data unavailable.</p>
        )}
      </div>
    </Card>
  );
}

// ─── Fundamentals Card ────────────────────────────────────────────────────────

function FundamentalsCard({ fund }: { fund: FundRow | null }) {
  if (!fund) return (
    <Card title="Fundamentals" icon={Building2}>
      <p className="text-xs text-muted-foreground">Fundamentals data unavailable.</p>
    </Card>
  );

  const primary = [
    { label: 'P/E Ratio',       val: fund.pe_ratio      != null ? fmt(fund.pe_ratio, 1)         : null },
    { label: 'P/B Ratio',       val: fund.price_to_book != null ? fmt(fund.price_to_book, 2)     : null },
    { label: 'Market Cap',      val: fund.market_cap_cr != null ? fmtCr(fund.market_cap_cr)      : null },
    { label: 'EPS (TTM)',       val: fund.eps           != null ? `₹${fmt(fund.eps, 2)}`         : null },
    { label: 'ROE',             val: fund.roe           != null ? `${fmt(fund.roe, 1)}%`         : null },
    { label: 'ROCE',            val: fund.roce          != null ? `${fmt(fund.roce, 1)}%`        : null },
    { label: 'Dividend Yield',  val: fund.dividend_yield != null ? `${fmt(fund.dividend_yield, 2)}%` : null },
    { label: 'Book Value',      val: fund.book_value    != null ? `₹${fmt(fund.book_value, 0)}`  : null },
  ].filter(r => r.val !== null);

  // Additional screener.in data
  const excludeKeys = new Set([
    'Stock P/E', 'P/E', 'Price to Book value', 'Price to book', 'Market Cap', 'Market cap',
    'Dividend Yield', 'Div yield', 'ROCE', 'Return on capital employed', 'ROE', 'Return on equity',
    'EPS', 'Book Value', 'Book value', 'Current Price', 'High / Low',
  ]);
  const extras = Object.entries(fund.screener_raw || {})
    .filter(([k]) => !excludeKeys.has(k))
    .slice(0, 4);

  const total = primary.length + extras.length;

  return (
    <Card title="Fundamentals" icon={Building2}>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">Screener.in data unavailable for this stock.</p>
      ) : (
        <div className="space-y-0.5">
          {primary.map(({ label, val }) => (
            <div key={label} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/30 transition-colors">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-semibold font-mono text-foreground">{val}</span>
            </div>
          ))}
          {extras.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/30 transition-colors">
              <span className="text-xs text-muted-foreground truncate mr-2">{k}</span>
              <span className="text-xs font-semibold font-mono text-foreground flex-shrink-0">{v}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-2">Source: Screener.in · NSE India · Yahoo Finance</p>
    </Card>
  );
}

// ─── Earnings Card ────────────────────────────────────────────────────────────

function EarningsCard({ earnings }: { earnings: EarningsRow | null }) {
  if (!earnings) return null;

  const salesMetric = earnings.quarterly.find(q => q.metric.startsWith('Sales'));
  if (!salesMetric) return null;

  const allEntries = Object.entries(salesMetric.data);
  const entries = allEntries.slice(-6).map(([q, val]) => ({
    quarter: q.replace(/ 20(\d\d)$/, "'$1"),
    value:   parseInt(val.replace(/,/g, ''), 10),
  })).filter(e => !isNaN(e.value) && e.value > 0);

  if (entries.length < 2) return null;

  const latest    = entries[entries.length - 1];
  const prev      = entries[entries.length - 2];
  const qoqChange = ((latest.value - prev.value) / prev.value) * 100;
  const isGrowing = latest.value >= entries[0].value;

  return (
    <Card title="Quarterly Revenue" icon={BarChart2}>
      <div className="space-y-3">
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={entries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
            <XAxis
              dataKey="quarter"
              tick={{ fontSize: 8, fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '10px',
                padding: '4px 8px',
              }}
              formatter={(v: number) => [fmtCr(v), 'Revenue']}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {entries.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === entries.length - 1
                    ? (isGrowing ? '#22c55e' : '#ef4444')
                    : 'hsl(var(--primary) / 0.35)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[10px] text-muted-foreground">Latest ({latest.quarter})</p>
            <p className="text-sm font-bold font-mono text-foreground">{fmtCr(latest.value)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">QoQ Change</p>
            <p className={cn('text-sm font-bold font-mono', qoqChange >= 0 ? 'text-bull' : 'text-bear')}>
              {qoqChange >= 0 ? '+' : ''}{qoqChange.toFixed(1)}%
            </p>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Source: {earnings.source} · Consolidated quarterly sales (₹ Cr)
        </p>
      </div>
    </Card>
  );
}

// ─── News Card ────────────────────────────────────────────────────────────────

function NewsCard({ news }: { news: NewsRow[] }) {
  return (
    <Card title="Latest News" icon={Newspaper}>
      {news.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recent news found.</p>
      ) : (
        <div className="space-y-0">
          {news.slice(0, 10).map((a, i) => (
            <div key={i} className="py-2.5 border-b border-border/40 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-foreground hover:text-primary transition-colors leading-snug flex-1 group"
                >
                  {a.title}
                  <ExternalLink className="inline w-2.5 h-2.5 ml-0.5 text-muted-foreground group-hover:text-primary" />
                </a>
                <SentBadge s={a.sentiment} />
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <span className="font-semibold">{a.source}</span>
                {a.published_at && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />{fmtDate(a.published_at)}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Social Card ──────────────────────────────────────────────────────────────

function SocialCard({ reddit, trends, youtube }: {
  reddit: RedditRow | null; trends: TrendsRow | null; youtube: YouTubeRow | null;
}) {
  const hasReddit  = reddit  && reddit.status  !== 'unavailable' && reddit.mention_count > 0;
  const hasTrends  = trends  && trends.status  === 'ok';
  const hasYoutube = youtube && youtube.status === 'ok' && (youtube.total ?? 0) > 0;
  const hasSomething = hasReddit || hasTrends || hasYoutube;

  const trendColor = trends?.direction === 'rising'  ? '#22c55e'
                   : trends?.direction === 'falling' ? '#ef4444' : '#f59e0b';

  return (
    <Card title="Social Sentiment" icon={Users}>
      {!hasSomething ? (
        <div>
          <p className="text-xs text-muted-foreground">
            Social data requires API credentials (Reddit, YouTube).
          </p>
          {reddit?.reason && (
            <p className="text-[10px] text-muted-foreground/60 mt-1">{reddit.reason}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">

          {/* Reddit */}
          {hasReddit && reddit && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">Reddit</span>
                <span className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full',
                  reddit.net_sentiment === 'POSITIVE' ? 'bg-bull/10 text-bull'
                  : reddit.net_sentiment === 'NEGATIVE' ? 'bg-bear/10 text-bear'
                  : 'bg-muted text-muted-foreground',
                )}>
                  {reddit.net_sentiment}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[
                  { label: 'Mentions', value: reddit.mention_count, color: 'text-foreground' },
                  { label: 'Positive', value: reddit.positive,     color: 'text-bull'        },
                  { label: 'Negative', value: reddit.negative,     color: 'text-bear'        },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center py-2 bg-secondary/40 rounded-md">
                    <p className="text-[9px] text-muted-foreground">{label}</p>
                    <p className={cn('text-sm font-bold font-mono', color)}>{value}</p>
                  </div>
                ))}
              </div>
              {reddit.top_posts?.slice(0, 2).map((p, i) => (
                <div key={i} className="mt-1.5 py-1.5 px-2 rounded-md bg-secondary/30 text-[10px] text-muted-foreground leading-snug">
                  <span className={cn('font-semibold mr-1',
                    p.sentiment === 'POSITIVE' ? 'text-bull'
                    : p.sentiment === 'NEGATIVE' ? 'text-bear' : 'text-foreground',
                  )}>r/{p.sub}:</span>
                  {p.title.slice(0, 90)}{p.title.length > 90 ? '…' : ''}
                </div>
              ))}
            </div>
          )}

          {/* YouTube */}
          {hasYoutube && youtube && (
            <div className={cn(hasReddit ? 'pt-3 border-t border-border/50' : '')}>
              <span className="text-xs font-semibold text-foreground">YouTube</span>
              <div className="space-y-1.5 mt-2">
                {youtube.videos.slice(0, 3).map((v, i) => (
                  <div key={i} className="py-1.5 px-2 rounded-md bg-secondary/30">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-foreground hover:text-primary transition-colors leading-snug flex-1"
                      >
                        {v.title.slice(0, 80)}{v.title.length > 80 ? '…' : ''}
                        <ExternalLink className="inline w-2.5 h-2.5 ml-0.5 text-muted-foreground" />
                      </a>
                      <SentBadge s={v.sentiment?.toUpperCase() ?? null} />
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      {v.channel} · {fmtDate(v.published_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Google Trends */}
          {hasTrends && trends && (
            <div className={cn((hasReddit || hasYoutube) ? 'pt-3 border-t border-border/50' : '')}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-foreground">Google Trends (7-day)</span>
                {trends.direction && (
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full',
                    trends.direction === 'rising'  ? 'bg-bull/10 text-bull'
                    : trends.direction === 'falling' ? 'bg-bear/10 text-bear'
                    : 'bg-muted text-muted-foreground',
                  )}>
                    {trends.direction.toUpperCase()}
                  </span>
                )}
              </div>
              {/* Sparkline chart */}
              {trends.history && trends.history.length > 1 && (
                <ResponsiveContainer width="100%" height={40}>
                  <AreaChart data={trends.history} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="trendsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={trendColor} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={trendColor} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={trendColor}
                      strokeWidth={1.5}
                      fill="url(#trendsGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              {trends.peak_score != null && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Peak: {trends.peak_score} · Current: {trends.current ?? '--'}
                </p>
              )}
            </div>
          )}

          {/* Twitter/X — always show as unavailable */}
          <div className="pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Twitter / X</span>
              <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">Unavailable</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">OAuth credentials required.</p>
          </div>

        </div>
      )}
    </Card>
  );
}

// ─── Institutional Card ───────────────────────────────────────────────────────

function InstitutionalCard({ fiiDii, options }: { fiiDii: FiiRow | null; options: OptionsRow | null }) {
  const hasFii  = fiiDii && fiiDii.fii_net != null;
  const hasOpts = options && options.put_call_ratio > 0;

  return (
    <Card title="Institutional Activity" icon={Building2}>
      <div className="space-y-4">

        {/* FII / DII */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">FII / DII Flows — Today</p>
          {!hasFii ? (
            <p className="text-xs text-muted-foreground">Institutional flow data unavailable outside market hours.</p>
          ) : (
            <div className="space-y-1.5">
              {([
                { label: 'FII / FPI', net: fiiDii.fii_net },
                { label: 'DII',       net: fiiDii.dii_net },
              ] as const).map(({ label, net }) => net != null && (
                <div key={label} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-secondary/50">
                  <span className="text-xs text-muted-foreground font-medium">{label}</span>
                  <span className={cn('text-xs font-bold font-mono', net >= 0 ? 'text-bull' : 'text-bear')}>
                    {net >= 0 ? '+' : '-'}₹{Math.abs(net).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr
                  </span>
                </div>
              ))}
              {fiiDii.market_mood && (
                <div className="flex items-center justify-between py-1.5 px-3 rounded-md bg-secondary/30">
                  <span className="text-[10px] text-muted-foreground">Market Mood</span>
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                    fiiDii.market_mood === 'bullish' ? 'bg-bull/10 text-bull'
                    : fiiDii.market_mood === 'bearish' ? 'bg-bear/10 text-bear'
                    : 'bg-muted text-muted-foreground',
                  )}>
                    {fiiDii.market_mood}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Options PCR */}
        <div className="pt-3 border-t border-border/50">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Options Chain</p>
          {!hasOpts ? (
            <p className="text-xs text-muted-foreground">Options data unavailable for this stock.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between py-1.5 px-3 rounded-md bg-secondary/50">
                <span className="text-xs text-muted-foreground">Put/Call Ratio</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-foreground">{options.put_call_ratio.toFixed(3)}</span>
                  <span className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                    options.sentiment === 'bullish' ? 'bg-bull/10 text-bull'
                    : options.sentiment === 'bearish' ? 'bg-bear/10 text-bear'
                    : 'bg-muted text-muted-foreground',
                  )}>
                    {options.sentiment?.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="py-2 px-2 bg-secondary/40 rounded-md">
                  <p className="text-[9px] text-muted-foreground">Total Call OI</p>
                  <p className="text-xs font-mono font-semibold text-bear">
                    {options.total_call_oi > 0 ? (options.total_call_oi / 100).toFixed(0) + 'K' : '--'}
                  </p>
                </div>
                <div className="py-2 px-2 bg-secondary/40 rounded-md">
                  <p className="text-[9px] text-muted-foreground">Total Put OI</p>
                  <p className="text-xs font-mono font-semibold text-bull">
                    {options.total_put_oi > 0 ? (options.total_put_oi / 100).toFixed(0) + 'K' : '--'}
                  </p>
                </div>
              </div>
              {options.atm_strike > 0 && (
                <p className="text-[10px] text-muted-foreground px-1">
                  ATM Strike: ₹{options.atm_strike.toLocaleString('en-IN')} · Expiry: {options.nearest_expiry || 'N/A'}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/70 px-1">
                PCR &gt;1.2 = bullish contrarian signal · PCR &lt;0.8 = bearish caution
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Signal Stack ─────────────────────────────────────────────────────────────

function SignalPill({ signal }: { signal: SignalEntry }) {
  const [open, setOpen] = useState(false);
  const isB  = signal.value === 'BULLISH';
  const isBr = signal.value === 'BEARISH';
  const col  = isB  ? 'border-bull/30 bg-bull/5 text-bull'
             : isBr ? 'border-bear/30 bg-bear/5 text-bear'
             : 'border-border bg-muted/30 text-muted-foreground';
  const dot  = isB  ? 'bg-bull' : isBr ? 'bg-bear' : 'bg-muted-foreground';
  const Icon = isB  ? TrendingUp : isBr ? TrendingDown : Minus;

  return (
    <button
      onClick={() => setOpen(v => !v)}
      className={cn('flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all w-full', col, open && 'ring-1 ring-current/20')}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', dot)} />
          <span className="text-[11px] font-semibold uppercase tracking-wide">{signal.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Icon className="w-3 h-3" />
          <span className="text-[10px] font-bold">{signal.value}</span>
        </div>
      </div>
      {open && <p className="text-[10px] leading-snug opacity-80 pt-0.5">{signal.detail}</p>}
    </button>
  );
}

function SignalStackCard({ stack }: { stack: SignalStack }) {
  const isUp   = stack.verdict.includes('BUY');
  const isDown = stack.verdict.includes('SELL');
  const confCol  = stack.confidence >= 80 ? 'text-bull' : stack.confidence >= 60 ? 'text-amber-500' : 'text-bear';
  const verdictBg = isUp   ? 'bg-bull/10 border-bull/20 text-bull'
                 : isDown  ? 'bg-bear/10 border-bear/20 text-bear'
                 : 'bg-muted border-border text-muted-foreground';

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <BarChart2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Signal Stack</span>
        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto font-medium">5-Signal AI</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Confidence</p>
          <span className={cn('text-2xl font-bold', confCol)}>{stack.confidence}%</span>
        </div>
        <span className={cn('px-4 py-1.5 rounded-full border text-sm font-bold', verdictBg)}>
          {stack.verdict}
        </span>
      </div>
      <div className="w-full h-1.5 bg-bear/20 rounded-full overflow-hidden">
        <div className="h-full bg-bull rounded-full transition-all duration-700" style={{ width: `${(stack.bullishCount / 5) * 100}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground">{stack.bullishCount}/5 bullish · {stack.bearishCount}/5 bearish</p>
      {stack.confidence >= 90 && (
        <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs font-bold text-amber-500">Write this down. High conviction call.</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
        {stack.signals.map(s => <SignalPill key={s.name} signal={s} />)}
      </div>
    </div>
  );
}

// ─── Analysis Status ──────────────────────────────────────────────────────────

const STATUSES = [
  'Fetching live price data...',
  'Loading RSI & MACD signals...',
  'Pulling fundamentals from Screener.in...',
  'Scanning recent news...',
  'Reading FII/DII flows...',
  'Checking options chain...',
  'Computing Signal Stack...',
  'Generating AI analysis...',
];

function AnalysisStatus({ active }: { active: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) { setI(0); return; }
    const t = setInterval(() => setI(n => (n + 1) % STATUSES.length), 1600);
    return () => clearInterval(t);
  }, [active]);
  if (!active) return null;
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <BarChart2 className="absolute inset-0 m-auto w-5 h-5 text-primary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground mb-1">Analyzing {'\u2014'} Hang tight</p>
        <p className="text-xs text-muted-foreground animate-fade-in" key={i}>{STATUSES[i]}</p>
      </div>
    </div>
  );
}

// ─── Main Stock Page ──────────────────────────────────────────────────────────

export default function Stock() {
  const params = useParams<{ ticker?: string }>();

  const [input,     setInput]     = useState(params.ticker?.toUpperCase() || '');
  const [ticker,    setTicker]    = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [stockData, setStockData] = useState<StockPageData | null>(null);
  const [content,   setContent]   = useState('');
  const [signalStack, setSignalStack] = useState<SignalStack | null>(null);
  const [fetching,  setFetching]  = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error,     setError]     = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Auto-analyze from URL param
  useEffect(() => {
    if (params.ticker && params.ticker.length >= 2) {
      const sym = params.ticker.toUpperCase();
      setInput(sym);
      runAnalysis(sym);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ticker]);

  async function fetchAllData(sym: string) {
    try {
      const ns = `${sym}.NS`;

      // ── Phase 1: Quote + Fundamentals (fast, determines company name for news) ──
      const [rQuote, rFund] = await Promise.allSettled([
        marketApi.quote(ns),
        marketApi.fundamentals(ns),
      ]);

      const quote = rQuote.status === 'fulfilled' ? rQuote.value as unknown as QuoteRow : null;
      const fund  = rFund.status  === 'fulfilled' ? rFund.value  as unknown as FundRow  : null;

      // Show price data immediately while rest loads
      setStockData({
        quote, fundamentals: fund,
        technical: null, news: [], options: null, fiiDii: null,
        reddit: null, trends: null, youtube: null, earnings: null,
        bollinger: null, candlestick: null,
      });

      // Build the best possible news query using company name
      const rawCo = (fund as unknown as { company?: string })?.company
        ?? (quote as unknown as { company?: string })?.company
        ?? sym;
      const newsQuery = rawCo
        .replace(/\s+(Limited|Ltd\.?|Inc\.?|Corp\.?|Industries|Enterprises|Technologies)$/i, '')
        .trim();

      // ── Phase 2: All remaining data in parallel, with smart news query ──
      const [rTech, rNews, rOpts, rFii, rReddit, rTrends, rYoutube, rEarnings, rBollinger, rCandlestick] =
        await Promise.allSettled([
          technicalApi.summary(ns),
          newsApi.search(newsQuery, 72, true),
          nseApi.options(sym),
          nseApi.fiiDii(),
          sentimentApi.reddit(sym),
          sentimentApi.trends(sym, 7),
          sentimentApi.youtube(sym, 3),
          marketApi.earnings(ns),
          technicalApi.bollinger(ns),
          technicalApi.candlestick(ns),
        ]);

      const g = <T,>(r: PromiseSettledResult<T>): T | null =>
        r.status === 'fulfilled' ? r.value : null;

      setStockData({
        quote,
        fundamentals: fund,
        technical:    g(rTech)        as TechRow        | null,
        news:         ((g(rNews)      as unknown as { articles?: NewsRow[] })?.articles ?? []),
        options:      g(rOpts)        as OptionsRow      | null,
        fiiDii:       g(rFii)         as FiiRow          | null,
        reddit:       g(rReddit)      as RedditRow       | null,
        trends:       g(rTrends)      as TrendsRow       | null,
        youtube:      g(rYoutube)     as YouTubeRow      | null,
        earnings:     g(rEarnings)    as EarningsRow     | null,
        bollinger:    g(rBollinger)   as BollingerRow    | null,
        candlestick:  g(rCandlestick) as CandlestickRow  | null,
      });
    } finally {
      setDataLoading(false);
    }
  }

  function runAnalysis(sym?: string) {
    const target = (sym || input).trim().toUpperCase().replace('.NS', '').replace('.BO', '');
    if (!target || fetching || streaming) return;

    abortRef.current?.abort();

    // Reset all state
    setContent('');
    setSignalStack(null);
    setStockData(null);
    setError('');
    setFetching(true);
    setStreaming(false);
    setDataLoading(true);
    setTicker(target);

    // Fetch data panels in parallel (non-blocking)
    fetchAllData(target);

    // Fire AI analysis SSE
    const abort = new AbortController();
    abortRef.current = abort;

    aiApi.analyze(target, {
      signal: abort.signal,
      onMeta: (key, value) => {
        if (key === 'signal_stack') setSignalStack(value as SignalStack);
        if (key === 'stream_start') { setFetching(false); setStreaming(true); }
      },
      onToken: token => {
        setFetching(false);
        setStreaming(true);
        setContent(prev => prev + token);
      },
      onDone: () => {
        setFetching(false);
        setStreaming(false);
        abortRef.current = null;
      },
      onError: msg => {
        setError(msg);
        setFetching(false);
        setStreaming(false);
      },
    });
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setFetching(false);
    setStreaming(false);
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') runAnalysis();
  };

  const isActive  = fetching || streaming;
  const hasResult = content || signalStack || stockData;
  const showData  = (stockData || dataLoading) && ticker;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── Search Header ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border">
        <div className="flex items-center gap-3 max-w-3xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Enter NSE ticker: RELIANCE, TCS, HDFCBANK..."
              disabled={isActive}
              className="w-full pl-8 pr-4 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring uppercase font-mono tracking-wider disabled:opacity-60"
            />
          </div>
          {isActive ? (
            <button onClick={stop} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-bear border border-bear/30 hover:bg-bear/5 transition-colors flex-shrink-0">
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => runAnalysis()}
              disabled={!input.trim()}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0',
                input.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              {hasResult ? 'Re-analyse' : 'Analyse'}
            </button>
          )}
        </div>
        {/* Popular tickers */}
        {!hasResult && !isActive && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {POPULAR.map(t => (
              <button
                key={t}
                onClick={() => { setInput(t); runAnalysis(t); }}
                className="text-[10px] font-mono px-2 py-1 rounded border border-border hover:border-primary/40 hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* Empty state */}
        {!isActive && !hasResult && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">Stock Deep Dive</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Enter any NSE ticker for live price, interactive chart, technical indicators,
              fundamentals, news with sentiment, social data, and full AI analysis.
            </p>
          </div>
        )}

        {/* Initial loading (no data yet) */}
        {fetching && !stockData && <AnalysisStatus active={fetching} />}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-bear/20 bg-bear/5 max-w-xl">
            <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-bear">Analysis Failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
              <button onClick={() => runAnalysis()} className="text-xs text-primary hover:underline mt-1.5">
                Try again →
              </button>
            </div>
          </div>
        )}

        {/* ── Data Panels ── */}
        {showData && (
          <div className="max-w-5xl space-y-5">

            {/* Quote Header */}
            {dataLoading && !stockData?.quote ? (
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <Sk className="h-4 w-48" /><Sk className="h-10 w-36" />
                <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Sk key={i} className="h-8" />)}</div>
              </div>
            ) : stockData?.quote ? (
              <QuoteHeader quote={stockData.quote} fund={stockData.fundamentals} />
            ) : null}

            {/* Price Chart */}
            <PriceChart ticker={ticker} />

            {/* Technical + Fundamentals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {dataLoading && !stockData?.technical ? (
                <div className="bg-card border border-border rounded-xl">
                  <div className="px-4 py-3 border-b border-border"><Sk className="h-4 w-36" /></div>
                  <div className="p-4 space-y-3">{[1,2,3].map(i => <Sk key={i} className="h-10" />)}</div>
                </div>
              ) : (
                <TechnicalCard
                  tech={stockData?.technical ?? null}
                  quote={stockData?.quote ?? null}
                  fund={stockData?.fundamentals ?? null}
                  bollinger={stockData?.bollinger ?? null}
                  candlestick={stockData?.candlestick ?? null}
                />
              )}
              {dataLoading && !stockData?.fundamentals ? (
                <div className="bg-card border border-border rounded-xl">
                  <div className="px-4 py-3 border-b border-border"><Sk className="h-4 w-36" /></div>
                  <div className="p-4 space-y-2">{[1,2,3,4,5,6,7].map(i => <Sk key={i} className="h-7" />)}</div>
                </div>
              ) : (
                <FundamentalsCard fund={stockData?.fundamentals ?? null} />
              )}
            </div>

            {/* Quarterly Revenue */}
            <EarningsCard earnings={stockData?.earnings ?? null} />

            {/* News */}
            {dataLoading && !stockData?.news?.length ? (
              <div className="bg-card border border-border rounded-xl">
                <div className="px-4 py-3 border-b border-border"><Sk className="h-4 w-28" /></div>
                <div className="p-4 space-y-3">{[1,2,3,4].map(i => <Sk key={i} className="h-12" />)}</div>
              </div>
            ) : (
              <NewsCard news={stockData?.news ?? []} />
            )}

            {/* Social + Institutional */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SocialCard reddit={stockData?.reddit ?? null} trends={stockData?.trends ?? null} youtube={stockData?.youtube ?? null} />
              <InstitutionalCard fiiDii={stockData?.fiiDii ?? null} options={stockData?.options ?? null} />
            </div>

          </div>
        )}

        {/* ── AI Analysis Panels ── */}
        {(signalStack || content || (fetching && stockData)) && (
          <div className="max-w-5xl space-y-5">

            {/* Signal Stack */}
            {signalStack && <SignalStackCard stack={signalStack} />}

            {/* AI generating — after data is loaded */}
            {fetching && !content && stockData && (
              <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-sm text-muted-foreground">Generating AI analysis — reading all signals...</p>
              </div>
            )}

            {/* AI Analysis */}
            {content && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">AI Deep Dive Analysis</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">NVIDIA LLM</span>
                  {streaming && (
                    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Streaming
                    </span>
                  )}
                </div>
                <MarkdownRenderer content={content} streaming={streaming} />
                {!streaming && (
                  <div className="mt-5 pt-3 border-t border-border/50 space-y-1">
                    <p className="text-[10px] text-muted-foreground">
                      For informational purposes only. Not financial advice.
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="text-bull">✓</span>
                      Prediction auto-logged to Accuracy Tracker
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
