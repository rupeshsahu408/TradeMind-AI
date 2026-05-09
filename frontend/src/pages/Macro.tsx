import React, { useState, useRef } from 'react';
import { Globe, TrendingUp, TrendingDown, DollarSign, BarChart2, RefreshCw, AlertCircle, Zap, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { useCommodities, useForex, useGlobalIndices, useMacroSnapshot } from '../hooks/useMarketData';
import { aiApi } from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';

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

// ─── Rupee Impact Analyzer ────────────────────────────────────────────────────
// User enters a USD/INR % change → AI calculates which sectors benefit or suffer.

function RupeeImpactAnalyzer() {
  const [inputVal, setInputVal]   = useState('');
  const [content, setContent]     = useState('');
  const [fetching, setFetching]   = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError]         = useState('');
  const abortRef = useRef<AbortController | null>(null);

  function run() {
    const pct = parseFloat(inputVal);
    if (isNaN(pct) || inputVal.trim() === '') return;
    abortRef.current?.abort();
    setContent(''); setError(''); setFetching(true); setStreaming(false);
    const abort = new AbortController();
    abortRef.current = abort;

    aiApi.chat(
      `Rupee Impact Analysis: USD/INR moves by ${pct >= 0 ? '+' : ''}${pct}% (i.e., the Indian Rupee ${pct >= 0 ? 'depreciates' : 'appreciates'} by ${Math.abs(pct)}% against the USD). Analyse the sector-by-sector impact on NSE-listed Indian stocks. For each major sector (IT, Banking, Pharma, Auto, FMCG, Metals, Energy, Real Estate), state whether this move is POSITIVE, NEGATIVE, or NEUTRAL — and give the specific reason with 1–2 key stock examples per sector. Use a professional trader tone. Be concise and precise. No filler.`,
      [],
      'rupee-impact-' + Date.now(),
      {
        signal:  abort.signal,
        onMeta:  (key) => {
          if (key === 'fetching')     { setFetching(true);  setStreaming(false); }
          if (key === 'stream_start') { setFetching(false); setStreaming(true);  }
        },
        onToken: (t) => { setFetching(false); setStreaming(true); setContent(p => p + t); },
        onDone:  ()  => { setStreaming(false); setFetching(false); abortRef.current = null; },
        onError: (m) => { setError(m); setFetching(false); setStreaming(false); },
      },
    );
  }

  function stop() {
    abortRef.current?.abort(); abortRef.current = null;
    setFetching(false); setStreaming(false);
  }

  const isActive = fetching || streaming;
  const pctNum   = parseFloat(inputVal);

  return (
    <section className="trading-card space-y-3">
      <div className="flex items-center gap-2 px-1 mb-1">
        <DollarSign className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Rupee Impact Analyzer</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Enter a USD/INR movement (%) to see which Indian sectors and stocks benefit or suffer.
      </p>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
          <input
            type="number"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            placeholder="e.g. +2 (rupee falls) or -2 (rupee rises)"
            step="0.5"
            className="w-full pl-7 pr-3 py-2.5 text-sm bg-accent/40 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
            onKeyDown={e => { if (e.key === 'Enter' && !isActive) run(); }}
          />
        </div>
        {isActive ? (
          <button onClick={stop} className="flex items-center gap-1 text-xs text-bear border border-bear/20 px-3 py-2.5 rounded-lg hover:bg-bear/5 transition-colors flex-shrink-0">
            <Square className="w-3 h-3 fill-current" /> Stop
          </button>
        ) : (
          <button
            onClick={run}
            disabled={!inputVal.trim() || isNaN(pctNum)}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-2.5 rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Zap className="w-3 h-3" /> Analyse
          </button>
        )}
      </div>

      {/* Quick presets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground">Quick:</span>
        {['+1', '+2', '+5', '-1', '-2', '-5'].map(v => (
          <button
            key={v}
            onClick={() => setInputVal(v)}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded border transition-colors',
              parseFloat(v) > 0
                ? 'border-bear/30 text-bear hover:bg-bear/5'
                : 'border-bull/30 text-bull hover:bg-bull/5',
              inputVal === v && 'ring-1 ring-primary',
            )}
          >
            {v}%
          </button>
        ))}
      </div>

      {fetching && !content && (
        <div className="flex items-center gap-2 py-2">
          <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-xs text-muted-foreground">Calculating sector impact…</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-bear/20 bg-bear/5">
          <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      )}

      {content && <MarkdownRenderer content={content} streaming={streaming} />}
    </section>
  );
}

// ─── AI Macro Analysis section ───────────────────────────────────────────────

function MacroAISection() {
  const [content, setContent]     = useState('');
  const [fetching, setFetching]   = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const STATUS = ['Reading Rupee levels...', 'Checking crude oil impact...', 'Analysing global risk signals...', 'Preparing AI verdict...'];
  const [statusIdx, setStatusIdx] = useState(0);

  React.useEffect(() => {
    if (!fetching) { setStatusIdx(0); return; }
    const t = setInterval(() => setStatusIdx(i => (i + 1) % STATUS.length), 1800);
    return () => clearInterval(t);
  }, [fetching]);

  function run() {
    if (fetching || streaming) return;
    abortRef.current?.abort();
    setContent(''); setError(''); setDone(false);
    setFetching(true); setStreaming(false);
    const abort = new AbortController();
    abortRef.current = abort;

    aiApi.macroAnalysis({
      signal: abort.signal,
      onMeta: (key) => {
        if (key === 'fetching')     { setFetching(true);  setStreaming(false); }
        if (key === 'stream_start') { setFetching(false); setStreaming(true);  }
      },
      onToken: (t) => { setFetching(false); setStreaming(true); setContent(prev => prev + t); },
      onDone:  ()  => { setStreaming(false); setFetching(false); setDone(true); abortRef.current = null; },
      onError: (m) => { setError(m); setFetching(false); setStreaming(false); },
    });
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setFetching(false); setStreaming(false); setDone(!!content);
  }

  const isActive = fetching || streaming;

  return (
    <section className="trading-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">AI Macro Impact Analysis</h2>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">NVIDIA LLM</span>
        </div>
        {isActive ? (
          <button onClick={stop} className="flex items-center gap-1 text-xs text-bear border border-bear/20 px-2.5 py-1 rounded-md hover:bg-bear/5 transition-colors">
            <Square className="w-3 h-3 fill-current" /> Stop
          </button>
        ) : (
          <button onClick={run} className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors font-medium active:scale-95">
            <Zap className="w-3 h-3" />{done ? 'Re-analyse' : 'Analyse Macro'}
          </button>
        )}
      </div>

      {!content && !fetching && !error && (
        <p className="text-xs text-muted-foreground">
          Click "Analyse Macro" to get an AI-powered breakdown of how current Rupee, crude, and global conditions affect Indian equity sectors.
        </p>
      )}

      {fetching && !content && (
        <div className="flex items-center gap-2 py-2">
          <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-xs text-muted-foreground animate-fade-in" key={statusIdx}>{STATUS[statusIdx]}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-bear/20 bg-bear/5">
          <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      )}

      {content && <MarkdownRenderer content={content} streaming={streaming} />}
    </section>
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

      {/* AI Macro Analysis */}
      <MacroAISection />

      {/* Rupee Impact Analyzer */}
      <RupeeImpactAnalyzer />

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
