import React, { useState, useEffect, useCallback } from 'react';
import {
  Target, CheckCircle2, XCircle, Clock, RefreshCw, AlertCircle,
  TrendingUp, TrendingDown, BarChart2, Filter, ChevronDown, Play,
  Loader2, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { cn } from '../lib/utils';
import { api } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Prediction {
  id: number;
  ticker: string;
  company_name: string;
  verdict: string;
  confidence: number;
  signal_stack_score: number | null;
  reasoning: string | null;
  predicted_at: string;
  market_price_at_prediction: string | null;
  // Joined from accuracy_log
  actual_close_price: string | null;
  actual_change_pct: string | null;
  was_correct: boolean | null;
  checked_at: string | null;
  accuracy_notes: string | null;
}

interface AccuracyStats {
  all_time: {
    total_checked: string;
    hits: string;
    misses: string;
    accuracy_pct: string | null;
    total_predictions: string;
  };
  last_7_days:  { total_checked: string; hits: string; accuracy_pct: string | null };
  last_30_days: { total_checked: string; hits: string; accuracy_pct: string | null };
  by_verdict: Array<{ verdict: string; checked: string; hits: string; accuracy_pct: string | null }>;
  by_ticker:  Array<{ ticker: string; company_name: string; checked: string; hits: string; accuracy_pct: string | null }>;
  trend: Array<{ date: string; checked: string; hits: string; accuracy_pct: string | null }>;
  pending_checks: number;
}

type FilterType = 'all' | 'hits' | 'misses' | 'pending';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: string | number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || n === '') return '--';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} />;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const v = verdict.toUpperCase();
  const map: Record<string, { cls: string; label: string }> = {
    'STRONG BUY':  { cls: 'bg-bull/15 text-bull border-bull/30',      label: 'STRONG BUY' },
    'BUY':         { cls: 'bg-bull/10 text-bull border-bull/20',       label: 'BUY' },
    'MILD BUY':    { cls: 'bg-bull/8 text-bull/80 border-bull/15',     label: 'MILD BUY' },
    'STRONG SELL': { cls: 'bg-bear/15 text-bear border-bear/30',       label: 'STRONG SELL' },
    'SELL':        { cls: 'bg-bear/10 text-bear border-bear/20',       label: 'SELL' },
    'MILD SELL':   { cls: 'bg-bear/8 text-bear/80 border-bear/15',     label: 'MILD SELL' },
    'NEUTRAL':     { cls: 'bg-muted text-muted-foreground border-border', label: 'NEUTRAL' },
    'HOLD':        { cls: 'bg-muted text-muted-foreground border-border', label: 'HOLD' },
  };
  const { cls, label } = map[v] ?? { cls: 'bg-muted text-muted-foreground border-border', label: v };
  return (
    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide', cls)}>
      {label}
    </span>
  );
}

function AccuracyBadge({ wasCorrect }: { wasCorrect: boolean | null }) {
  if (wasCorrect === null || wasCorrect === undefined) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  }
  if (wasCorrect) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-bull">
        <CheckCircle2 className="w-3 h-3" />
        HIT
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-bear">
      <XCircle className="w-3 h-3" />
      MISS
    </span>
  );
}

function AccuracyRing({ pct, size = 80 }: { pct: number | null; size?: number }) {
  const radius = (size / 2) - 8;
  const circ   = 2 * Math.PI * radius;
  const dash   = pct !== null ? (pct / 100) * circ : 0;

  const color = pct === null ? '#64748b'
    : pct >= 70  ? 'hsl(158 64% 42%)'
    : pct >= 50  ? '#f59e0b'
    : '#ef4444';

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={7} />
      <circle
        cx={size/2} cy={size/2} r={radius}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
    </svg>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, highlight,
}: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn('trading-card text-center', highlight && 'border-primary/30 bg-primary/3')}>
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-xl font-bold', highlight ? 'text-primary' : 'text-foreground')}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Prediction row ───────────────────────────────────────────────────────────

interface PredictionRowProps {
  pred: Prediction;
  onCheck: (id: number) => Promise<void>;
}

function PredictionRow({ pred, onCheck }: PredictionRowProps) {
  const [checking, setChecking] = useState(false);
  const isPending = pred.was_correct === null || pred.was_correct === undefined;
  const canCheck  = isPending && pred.verdict !== 'NEUTRAL' && pred.verdict !== 'HOLD';

  const predictedPrice = pred.market_price_at_prediction ? parseFloat(pred.market_price_at_prediction) : null;
  const actualPrice    = pred.actual_close_price ? parseFloat(pred.actual_close_price) : null;
  const actualChangePct = pred.actual_change_pct ? parseFloat(pred.actual_change_pct) : null;

  async function handleCheck() {
    setChecking(true);
    await onCheck(pred.id);
    setChecking(false);
  }

  return (
    <div className={cn(
      'trading-card transition-all',
      pred.was_correct === true  && 'border-bull/20 bg-bull/3',
      pred.was_correct === false && 'border-bear/20 bg-bear/3',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-primary text-xs">{pred.ticker}</span>
            <VerdictBadge verdict={pred.verdict} />
            <span className="text-[10px] font-medium text-muted-foreground">
              {pred.confidence}% confidence
            </span>
            {pred.signal_stack_score !== null && (
              <span className="text-[10px] text-muted-foreground">
                {pred.signal_stack_score}/5 signals
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {pred.company_name || pred.ticker}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Predicted: {fmtDate(pred.predicted_at)}
          </p>
        </div>

        <AccuracyBadge wasCorrect={pred.was_correct} />
      </div>

      {/* Price comparison row */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Predicted At</p>
          <p className="text-[11px] font-mono font-semibold text-foreground">
            {predictedPrice ? `₹${fmt(predictedPrice)}` : '--'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Actual Close</p>
          <p className="text-[11px] font-mono font-semibold text-foreground">
            {actualPrice ? `₹${fmt(actualPrice)}` : '--'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Move</p>
          {actualChangePct !== null ? (
            <div className={cn(
              'flex items-center justify-center gap-0.5 text-[11px] font-mono font-semibold',
              actualChangePct >= 0 ? 'text-bull' : 'text-bear',
            )}>
              {actualChangePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(actualChangePct).toFixed(2)}%
            </div>
          ) : (
            <p className="text-[11px] font-mono text-muted-foreground">--</p>
          )}
        </div>
      </div>

      {/* Check button for pending predictions */}
      {canCheck && (
        <div className="mt-3 pt-3 border-t border-border">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:bg-primary/8 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            {checking ? (
              <><Loader2 className="w-3 h-3 animate-spin" />Checking...</>
            ) : (
              <><Play className="w-3 h-3" />Check Now</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Accuracy Page ───────────────────────────────────────────────────────

export default function Accuracy() {
  const [predictions, setPredictions]   = useState<Prediction[]>([]);
  const [stats, setStats]               = useState<AccuracyStats | null>(null);
  const [loadingPred, setLoadingPred]   = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);
  const [filter, setFilter]             = useState<FilterType>('all');
  const [tickerFilter, setTickerFilter] = useState('');
  const [showFilters, setShowFilters]   = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const fetchPredictions = useCallback(async () => {
    setLoadingPred(true);
    try {
      const params = new URLSearchParams({ filter, limit: '100' });
      if (tickerFilter) params.set('ticker', tickerFilter.toUpperCase());
      const res = await api.get<{ predictions: Prediction[] }>(`/accuracy/predictions?${params}`);
      setPredictions(res.predictions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch predictions.');
    } finally {
      setLoadingPred(false);
    }
  }, [filter, tickerFilter]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await api.get<AccuracyStats>('/accuracy/stats');
      setStats(res);
    } catch {
      // non-fatal
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function handleCheck(predId: number) {
    try {
      await api.post(`/accuracy/check/${predId}`);
      // Refresh both
      await Promise.all([fetchPredictions(), fetchStats()]);
    } catch (err: unknown) {
      console.error('Check failed:', err);
    }
  }

  async function handleRunAll() {
    setRunningCheck(true);
    try {
      await api.post('/accuracy/run');
      await Promise.all([fetchPredictions(), fetchStats()]);
    } catch (err: unknown) {
      console.error('Run all failed:', err);
    } finally {
      setRunningCheck(false);
    }
  }

  const overallPct = stats?.all_time?.accuracy_pct ? parseFloat(stats.all_time.accuracy_pct) : null;
  const totalPred  = stats?.all_time?.total_predictions ? parseInt(stats.all_time.total_predictions) : 0;
  const totalChecked = stats?.all_time?.total_checked ? parseInt(stats.all_time.total_checked) : 0;
  const hits       = stats?.all_time?.hits ? parseInt(stats.all_time.hits) : 0;
  const misses     = stats?.all_time?.misses ? parseInt(stats.all_time.misses) : 0;

  // Chart data
  const chartData = (stats?.trend ?? []).map(row => ({
    date:     fmtDateShort(row.date),
    accuracy: row.accuracy_pct ? parseFloat(row.accuracy_pct) : 0,
    checked:  parseInt(row.checked),
  }));

  const filterOptions: Array<{ value: FilterType; label: string }> = [
    { value: 'all',     label: 'All Predictions' },
    { value: 'hits',    label: 'Hits Only ✅' },
    { value: 'misses',  label: 'Misses Only ❌' },
    { value: 'pending', label: 'Pending Check ⏳' },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Accuracy Tracker
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every AI prediction logged and verified at market close.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(stats?.pending_checks ?? 0) > 0 && (
            <button
              onClick={handleRunAll}
              disabled={runningCheck}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {runningCheck ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running...</>
              ) : (
                <><Play className="w-3.5 h-3.5" />Run Check ({stats?.pending_checks})</>
              )}
            </button>
          )}
          <button
            onClick={() => { fetchPredictions(); fetchStats(); }}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-bear/8 border border-bear/20 mb-4">
          <AlertCircle className="w-4 h-4 text-bear mt-0.5 flex-shrink-0" />
          <p className="text-sm text-bear">{error}</p>
        </div>
      )}

      {/* Stats overview */}
      {loadingStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : stats ? (
        <>
          {/* Main accuracy ring + stats */}
          <div className="trading-card mb-4">
            <div className="flex flex-col lg:flex-row items-center gap-6">
              {/* Ring */}
              <div className="relative flex-shrink-0">
                <AccuracyRing pct={overallPct} size={120} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className={cn(
                    'text-2xl font-bold',
                    overallPct === null ? 'text-muted-foreground'
                    : overallPct >= 70  ? 'text-bull'
                    : overallPct >= 50  ? 'text-amber-500'
                    : 'text-bear',
                  )}>
                    {overallPct !== null ? `${overallPct}%` : '--'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Overall</p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex-1 grid grid-cols-3 gap-3 w-full">
                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">{totalPred}</p>
                  <p className="text-[11px] text-muted-foreground">Total Predictions</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-bull">{hits}</p>
                  <p className="text-[11px] text-muted-foreground">Hits ✅</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-bear">{misses}</p>
                  <p className="text-[11px] text-muted-foreground">Misses ❌</p>
                </div>
              </div>

              {/* Period stats */}
              <div className="flex-shrink-0 grid grid-cols-2 gap-3">
                <div className="trading-card text-center py-2 px-3">
                  <p className={cn('text-lg font-bold', stats.last_7_days.accuracy_pct ? 'text-primary' : 'text-muted-foreground')}>
                    {stats.last_7_days.accuracy_pct ? `${stats.last_7_days.accuracy_pct}%` : '--'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Last 7 days</p>
                  <p className="text-[10px] text-muted-foreground">{stats.last_7_days.total_checked} checked</p>
                </div>
                <div className="trading-card text-center py-2 px-3">
                  <p className={cn('text-lg font-bold', stats.last_30_days.accuracy_pct ? 'text-primary' : 'text-muted-foreground')}>
                    {stats.last_30_days.accuracy_pct ? `${stats.last_30_days.accuracy_pct}%` : '--'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Last 30 days</p>
                  <p className="text-[10px] text-muted-foreground">{stats.last_30_days.total_checked} checked</p>
                </div>
              </div>
            </div>
          </div>

          {/* Trend chart */}
          {chartData.length >= 2 && (
            <div className="trading-card mb-4">
              <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
                Accuracy Trend (Last 30 Days)
              </p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [`${v}%`, 'Accuracy']}
                    />
                    <ReferenceLine y={70} stroke="hsl(158 64% 42%)" strokeDasharray="4 4" strokeOpacity={0.4} />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Green dashed line = 70% target accuracy</p>
            </div>
          )}

          {/* By verdict breakdown */}
          {stats.by_verdict.length > 0 && (
            <div className="trading-card mb-4">
              <p className="text-xs font-semibold text-foreground mb-3">Accuracy by Verdict Type</p>
              <div className="space-y-2">
                {stats.by_verdict.map(row => {
                  const pct = row.accuracy_pct ? parseFloat(row.accuracy_pct) : 0;
                  return (
                    <div key={row.verdict} className="flex items-center gap-3">
                      <div className="w-24 flex-shrink-0">
                        <VerdictBadge verdict={row.verdict} />
                      </div>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', pct >= 70 ? 'bg-bull' : pct >= 50 ? 'bg-amber-500' : 'bg-bear')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-medium text-foreground w-10 text-right">
                        {row.accuracy_pct ? `${row.accuracy_pct}%` : '--'}
                      </span>
                      <span className="text-[10px] text-muted-foreground w-16">
                        {row.hits}/{row.checked} hits
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Best tickers */}
          {stats.by_ticker.length > 0 && (
            <div className="trading-card mb-4">
              <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                Best Performing Tickers (min 2 checks)
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                {stats.by_ticker.slice(0, 10).map(row => {
                  const pct = row.accuracy_pct ? parseFloat(row.accuracy_pct) : 0;
                  return (
                    <div key={row.ticker} className="text-center p-2 rounded-lg bg-muted/50 border border-border">
                      <p className="font-mono font-bold text-xs text-primary">{row.ticker}</p>
                      <p className={cn('text-sm font-bold mt-0.5', pct >= 70 ? 'text-bull' : pct >= 50 ? 'text-amber-500' : 'text-bear')}>
                        {row.accuracy_pct ? `${row.accuracy_pct}%` : '--'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{row.hits}/{row.checked}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {filterOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                filter === opt.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setShowFilters(v => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Filter className="w-3 h-3" />
          Filter
          <ChevronDown className={cn('w-3 h-3 transition-transform', showFilters && 'rotate-180')} />
        </button>
      </div>

      {/* Ticker filter */}
      {showFilters && (
        <div className="mb-4">
          <input
            type="text"
            value={tickerFilter}
            onChange={e => setTickerFilter(e.target.value.toUpperCase())}
            placeholder="Filter by ticker, e.g. RELIANCE"
            className="w-full max-w-xs bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      )}

      {/* Predictions list */}
      {loadingPred ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4">
            <Target className="w-6 h-6 text-primary/60" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {filter === 'all' ? 'No predictions yet' : `No ${filter} predictions`}
          </h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
            {filter === 'all'
              ? 'Run a Stock Deep Dive analysis to generate your first prediction. Each analysis is logged here automatically.'
              : 'Change the filter to view other predictions.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {predictions.map(pred => (
            <PredictionRow
              key={pred.id}
              pred={pred}
              onCheck={handleCheck}
            />
          ))}
        </div>
      )}
    </div>
  );
}
