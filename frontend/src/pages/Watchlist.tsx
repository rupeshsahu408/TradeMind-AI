import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Star, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw,
  Search, ArrowUpRight, ArrowDownRight, ExternalLink, AlertCircle,
  BarChart2, X, Loader2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { useLocation } from 'wouter';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WatchlistItem {
  id: number;
  ticker: string;
  company_name: string;
  added_at: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  day_high: number | null;
  day_low: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  volume: number | null;
  market_cap: number | null;
  prev_close: number | null;
  sentiment_pulse: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  news_count: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return '--';
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtVol(n: number | null | undefined): string {
  if (!n) return '--';
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000)    return `${(n / 1_00_000).toFixed(2)} L`;
  return n.toLocaleString('en-IN');
}

function fmtMktCap(n: number | null | undefined): string {
  if (!n) return '--';
  const cr = n / 1_00_00_000;
  if (cr >= 1_00_000) return `₹${(cr / 1_00_000).toFixed(2)} L Cr`;
  if (cr >= 1_000)    return `₹${(cr / 1_000).toFixed(2)}K Cr`;
  return `₹${cr.toFixed(0)} Cr`;
}

function SentimentPill({ pulse }: { pulse: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' }) {
  const map = {
    POSITIVE: { label: 'Positive', cls: 'bg-bull/10 text-bull border-bull/20' },
    NEGATIVE: { label: 'Negative', cls: 'bg-bear/10 text-bear border-bear/20' },
    NEUTRAL:  { label: 'Neutral',  cls: 'bg-muted text-muted-foreground border-border' },
  };
  const { label, cls } = map[pulse];
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide', cls)}>
      {label}
    </span>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} />;
}

// ─── Add Stock Dialog ─────────────────────────────────────────────────────────

interface AddStockDialogProps {
  onAdd: (ticker: string) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
}

function AddStockDialog({ onAdd, onClose }: AddStockDialogProps) {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError(null);
    const result = await onAdd(sym);
    setLoading(false);
    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Failed to add stock.');
    }
  }

  const POPULAR = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'WIPRO', 'BAJFINANCE', 'ADANIENT'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Stock to Watchlist</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Enter any NSE ticker symbol</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={ticker}
              onChange={e => { setTicker(e.target.value.toUpperCase()); setError(null); }}
              placeholder="e.g. RELIANCE, TCS, HDFCBANK"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-bear/8 border border-bear/20">
              <AlertCircle className="w-3.5 h-3.5 text-bear mt-0.5 flex-shrink-0" />
              <p className="text-xs text-bear">{error}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">Popular stocks:</p>
            <div className="flex flex-wrap gap-1">
              {POPULAR.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setTicker(s); setError(null); }}
                  className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-muted hover:border-primary/40 hover:text-primary text-muted-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!ticker.trim() || loading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Verifying ticker...
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Add to Watchlist
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Watchlist Row ────────────────────────────────────────────────────────────

interface WatchlistRowProps {
  item: WatchlistItem;
  onRemove: (id: number, ticker: string) => void;
  onDeepDive: (ticker: string) => void;
}

function WatchlistRow({ item, onRemove, onDeepDive }: WatchlistRowProps) {
  const up = (item.change_pct ?? 0) >= 0;
  const hasPrice = item.price !== null;

  // 52-week position percentage
  const position52w = (item.week_52_high && item.week_52_low && item.price)
    ? Math.round(((item.price - item.week_52_low) / (item.week_52_high - item.week_52_low)) * 100)
    : null;

  return (
    <div className="trading-card group hover:border-primary/20 transition-all">
      {/* Top row: company + price */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold font-mono text-primary">{item.ticker}</span>
            <SentimentPill pulse={item.sentiment_pulse} />
            {item.news_count > 0 && (
              <span className="text-[10px] text-muted-foreground">{item.news_count} news</span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground mt-0.5 truncate">{item.company_name}</p>
        </div>

        {/* Price */}
        <div className="text-right flex-shrink-0">
          {hasPrice ? (
            <>
              <p className="text-base font-bold text-foreground font-mono">₹{fmt(item.price)}</p>
              <div className={cn('flex items-center justify-end gap-0.5 text-xs font-medium', up ? 'text-bull' : 'text-bear')}>
                {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(item.change_pct ?? 0).toFixed(2)}%
                <span className="text-muted-foreground ml-1 font-normal">
                  ({up ? '+' : ''}₹{fmt(item.change, 2)})
                </span>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3.5 w-14 ml-auto" />
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      {hasPrice && (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Day Low</p>
            <p className="text-[11px] font-mono font-medium text-foreground">₹{fmt(item.day_low)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Day High</p>
            <p className="text-[11px] font-mono font-medium text-foreground">₹{fmt(item.day_high)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Volume</p>
            <p className="text-[11px] font-mono font-medium text-foreground">{fmtVol(item.volume)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Mkt Cap</p>
            <p className="text-[11px] font-mono font-medium text-foreground">{fmtMktCap(item.market_cap)}</p>
          </div>
        </div>
      )}

      {/* 52-week range bar */}
      {position52w !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>52W Low ₹{fmt(item.week_52_low)}</span>
            <span>{position52w}% of range</span>
            <span>52W High ₹{fmt(item.week_52_high)}</span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                position52w > 70 ? 'bg-bull' : position52w < 30 ? 'bg-bear' : 'bg-amber-500'
              )}
              style={{ width: `${Math.min(100, Math.max(0, position52w))}%` }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex items-center gap-2 pt-3 border-t border-border">
        <button
          onClick={() => onDeepDive(item.ticker)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-primary hover:bg-primary/8 py-1.5 rounded-lg transition-colors font-medium"
        >
          <BarChart2 className="w-3 h-3" />
          Deep Dive
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={() => onRemove(item.id, item.ticker)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-bear hover:bg-bear/8 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Remove
        </button>
      </div>
    </div>
  );
}

// ─── Main Watchlist Page ──────────────────────────────────────────────────────

export default function Watchlist() {
  const [, navigate] = useLocation();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWatchlist = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await api.get<{ watchlist: WatchlistItem[] }>('/watchlist');
      setWatchlist(res.watchlist);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load watchlist.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist(false);
    // Auto-refresh every 5 minutes
    refreshTimerRef.current = setInterval(() => fetchWatchlist(true), 5 * 60 * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchWatchlist]);

  async function handleAdd(ticker: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await api.post<{ success: boolean; item: WatchlistItem }>('/watchlist', { ticker });
      // Optimistically add to top of list, then refresh for live prices
      setWatchlist(prev => [res.item, ...prev]);
      // Background refresh to get full live data
      setTimeout(() => fetchWatchlist(true), 1500);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to add stock.' };
    }
  }

  async function handleRemove(id: number, ticker: string) {
    try {
      await api.delete(`/watchlist/${id}`);
      setWatchlist(prev => prev.filter(item => item.id !== id));
    } catch (err: unknown) {
      console.error('Remove failed:', err);
    }
  }

  function handleDeepDive(ticker: string) {
    navigate(`/stock/${ticker}`);
  }

  // ─── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-32 mb-1" />
            <Skeleton className="h-3.5 w-48" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="trading-card space-y-3">
            <div className="flex justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="space-y-1.5 items-end flex flex-col">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1,2,3,4].map(j => <Skeleton key={j} className="h-8" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            Watchlist
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {watchlist.length === 0
              ? 'No stocks added yet'
              : `${watchlist.length} stock${watchlist.length !== 1 ? 's' : ''} tracked`}
            {lastRefresh && (
              <span className="ml-2">
                · Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchWatchlist(true)}
            disabled={refreshing}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            title="Refresh prices"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Stock
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-bear/8 border border-bear/20 mb-4">
          <AlertCircle className="w-4 h-4 text-bear mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-bear font-medium">Failed to load watchlist</p>
            <p className="text-xs text-bear/80 mt-0.5">{error}</p>
            <button onClick={() => fetchWatchlist(false)} className="text-xs text-primary hover:underline mt-1">
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!error && watchlist.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4">
            <Star className="w-6 h-6 text-primary/60" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Watchlist is empty</h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
            Add NSE stocks to track live prices, sentiment pulse, and get one-click access to deep dive analysis.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Your First Stock
          </button>
          <div className="mt-6 flex flex-wrap justify-center gap-1.5 max-w-sm">
            {['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'].map(t => (
              <button
                key={t}
                onClick={async () => { await handleAdd(t); }}
                className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-muted hover:border-primary/40 hover:text-primary text-muted-foreground transition-colors"
              >
                + {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Watchlist grid */}
      {watchlist.length > 0 && (
        <>
          {/* Sentiment summary bar */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const).map(pulse => {
              const count = watchlist.filter(w => w.sentiment_pulse === pulse).length;
              const map = {
                POSITIVE: { label: 'Positive Sentiment', cls: 'text-bull', bg: 'bg-bull/8 border-bull/20' },
                NEUTRAL:  { label: 'Neutral Sentiment',  cls: 'text-muted-foreground', bg: 'bg-muted border-border' },
                NEGATIVE: { label: 'Negative Sentiment', cls: 'text-bear', bg: 'bg-bear/8 border-bear/20' },
              };
              const { label, cls, bg } = map[pulse];
              return (
                <div key={pulse} className={cn('rounded-xl border p-3 text-center', bg)}>
                  <p className={cn('text-xl font-bold', cls)}>{count}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              );
            })}
          </div>

          {/* Market movers summary */}
          {watchlist.some(w => w.change_pct !== null) && (() => {
            const withPrices = watchlist.filter(w => w.change_pct !== null);
            const topGainer = withPrices.reduce((a, b) => (b.change_pct! > a.change_pct! ? b : a), withPrices[0]);
            const topLoser  = withPrices.reduce((a, b) => (b.change_pct! < a.change_pct! ? b : a), withPrices[0]);
            return (
              <div className="grid grid-cols-2 gap-3 mb-5">
                {topGainer.change_pct !== null && topGainer.change_pct > 0 && (
                  <div className="rounded-xl border border-bull/20 bg-bull/5 p-3">
                    <div className="flex items-center gap-1.5 text-bull text-[10px] font-medium mb-1">
                      <TrendingUp className="w-3 h-3" />
                      Top Gainer Today
                    </div>
                    <p className="font-mono font-bold text-foreground text-sm">{topGainer.ticker}</p>
                    <p className="text-xs text-bull font-medium">+{topGainer.change_pct!.toFixed(2)}%</p>
                  </div>
                )}
                {topLoser.change_pct !== null && topLoser.change_pct < 0 && (
                  <div className="rounded-xl border border-bear/20 bg-bear/5 p-3">
                    <div className="flex items-center gap-1.5 text-bear text-[10px] font-medium mb-1">
                      <TrendingDown className="w-3 h-3" />
                      Top Loser Today
                    </div>
                    <p className="font-mono font-bold text-foreground text-sm">{topLoser.ticker}</p>
                    <p className="text-xs text-bear font-medium">{topLoser.change_pct!.toFixed(2)}%</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Stock cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {watchlist.map(item => (
              <WatchlistRow
                key={item.id}
                item={item}
                onRemove={handleRemove}
                onDeepDive={handleDeepDive}
              />
            ))}
          </div>

          {/* Add more */}
          <button
            onClick={() => setShowAdd(true)}
            className="w-full mt-3 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/30 hover:bg-primary/3 text-muted-foreground hover:text-primary text-xs font-medium transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add another stock
          </button>
        </>
      )}

      {/* Add stock dialog */}
      {showAdd && (
        <AddStockDialog
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
