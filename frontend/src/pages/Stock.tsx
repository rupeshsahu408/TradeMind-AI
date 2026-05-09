import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'wouter';
import {
  TrendingUp, TrendingDown, Minus, Search, Zap, BarChart2,
  AlertCircle, ChevronDown, ChevronUp, RefreshCw, Square,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { aiApi, SignalStack, SignalEntry } from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';

// ─── Signal badge ─────────────────────────────────────────────────────────────

function SignalPill({ signal }: { signal: SignalEntry }) {
  const [open, setOpen] = useState(false);
  const isB = signal.value === 'BULLISH';
  const isBr = signal.value === 'BEARISH';

  const color = isB
    ? 'border-bull/30 bg-bull/5 text-bull'
    : isBr
      ? 'border-bear/30 bg-bear/5 text-bear'
      : 'border-border bg-muted/30 text-muted-foreground';

  const dot = isB ? 'bg-bull' : isBr ? 'bg-bear' : 'bg-muted-foreground';
  const Icon = isB ? TrendingUp : isBr ? TrendingDown : Minus;

  return (
    <button
      onClick={() => setOpen(v => !v)}
      className={cn(
        'flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all w-full',
        color, open ? 'ring-1 ring-current/20' : 'hover:brightness-105',
      )}
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
      {open && (
        <p className="text-[10px] leading-snug opacity-80 pt-0.5">{signal.detail}</p>
      )}
    </button>
  );
}

// ─── Signal Stack Card ────────────────────────────────────────────────────────

function SignalStackCard({ stack }: { stack: SignalStack }) {
  const isUp   = stack.verdict.includes('BUY');
  const isDown = stack.verdict.includes('SELL');

  const confColor = stack.confidence >= 80
    ? 'text-bull'
    : stack.confidence >= 60
      ? 'text-amber-500'
      : 'text-bear';

  const verdictBg = isUp
    ? 'bg-bull/10 border-bull/20 text-bull'
    : isDown
      ? 'bg-bear/10 border-bear/20 text-bear'
      : 'bg-muted border-border text-muted-foreground';

  // Progress bar
  const progress = (stack.bullishCount / 5) * 100;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
            Signal Stack
          </p>
          <div className="flex items-center gap-2">
            <span className={cn('text-lg font-bold', confColor)}>
              {stack.confidence}%
            </span>
            <span className={cn('px-2.5 py-0.5 rounded-full border text-xs font-bold', verdictBg)}>
              {stack.verdict}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">{stack.bullishCount}/5 bullish</p>
          <p className="text-[10px] text-muted-foreground">{stack.bearishCount}/5 bearish</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-bear/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-bull rounded-full transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 5 signal pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
        {stack.signals.map(s => (
          <SignalPill key={s.name} signal={s} />
        ))}
      </div>
    </div>
  );
}

// ─── Working status ───────────────────────────────────────────────────────────

const ANALYSIS_STATUSES = [
  'Fetching live price data...',
  'Loading RSI & MACD signals...',
  'Pulling fundamentals...',
  'Scanning recent news...',
  'Reading FII/DII flows...',
  'Computing Signal Stack...',
  'Preparing AI analysis...',
];

function AnalysisStatus({ active }: { active: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) { setIndex(0); return; }
    const t = setInterval(() => {
      setIndex(i => (i + 1) % ANALYSIS_STATUSES.length);
    }, 1600);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <BarChart2 className="absolute inset-0 m-auto w-5 h-5 text-primary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground mb-1">Analyzing...</p>
        <p className="text-xs text-muted-foreground animate-fade-in" key={index}>
          {ANALYSIS_STATUSES[index]}
        </p>
      </div>
    </div>
  );
}

// ─── Popular tickers ──────────────────────────────────────────────────────────

const POPULAR = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HDFC', 'BAJFINANCE', 'WIPRO', 'AXISBANK', 'SBIN',
];

// ─── Main Stock Page ──────────────────────────────────────────────────────────

export default function Stock() {
  const params = useParams<{ ticker?: string }>();
  const [ticker, setTicker]     = useState(params.ticker?.toUpperCase() || '');
  const [input, setInput]       = useState(params.ticker?.toUpperCase() || '');
  const [content, setContent]   = useState('');
  const [signalStack, setSignalStack] = useState<SignalStack | null>(null);
  const [fetching, setFetching] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError]       = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Auto-analyze if ticker in URL
  useEffect(() => {
    if (params.ticker && params.ticker.length >= 2) {
      const sym = params.ticker.toUpperCase();
      setInput(sym);
      setTicker(sym);
      startAnalysis(sym);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ticker]);

  function startAnalysis(sym?: string) {
    const target = (sym || input).trim().toUpperCase().replace('.NS', '').replace('.BO', '');
    if (!target || fetching || streaming) return;

    abortRef.current?.abort();
    setContent('');
    setSignalStack(null);
    setError('');
    setFetching(true);
    setStreaming(false);
    setTicker(target);

    const abort = new AbortController();
    abortRef.current = abort;

    aiApi.analyze(target, {
      signal: abort.signal,

      onMeta: (key, value) => {
        if (key === 'fetching')      { setFetching(true);  }
        if (key === 'signal_stack')  { setSignalStack(value as SignalStack); }
        if (key === 'stream_start')  { setFetching(false); setStreaming(true); }
      },

      onToken: (token) => {
        setFetching(false);
        setStreaming(true);
        setContent(prev => prev + token);
      },

      onDone: () => {
        setFetching(false);
        setStreaming(false);
        abortRef.current = null;
      },

      onError: (msg) => {
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
    if (e.key === 'Enter') startAnalysis();
  };

  const isActive = fetching || streaming;
  const hasResult = content || signalStack;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── Header / Search ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border">
        <div className="flex items-center gap-3 max-w-3xl">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Enter ticker: RELIANCE, TCS, HDFCBANK..."
              className="w-full pl-8 pr-4 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring uppercase font-mono tracking-wider"
              disabled={isActive}
            />
          </div>

          {/* Action button */}
          {isActive ? (
            <button
              onClick={stop}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-bear border border-bear/30 hover:bg-bear/5 transition-colors flex-shrink-0"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => startAnalysis()}
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
                onClick={() => { setInput(t); startAnalysis(t); }}
                className="text-[10px] font-mono px-2 py-1 rounded border border-border hover:border-primary/40 hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5">

        {/* Empty state */}
        {!isActive && !hasResult && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-1">Stock Deep Dive</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Enter any NSE ticker above to get a complete AI analysis with live Signal Stack, RSI, MACD, fundamentals, FII flows, and AI verdict.
            </p>
          </div>
        )}

        {/* Fetching / loading state */}
        {fetching && !content && <AnalysisStatus active={fetching} />}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-bear/20 bg-bear/5 mt-4 max-w-xl">
            <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-bear">Analysis Failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Results area */}
        {(signalStack || content) && (
          <div className="max-w-4xl space-y-5">

            {/* Ticker header */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-bold text-foreground font-mono tracking-wider">{ticker}</h1>
                <p className="text-[10px] text-muted-foreground">NSE · Deep Dive Analysis · Phase 4 AI</p>
              </div>
              {streaming && (
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Streaming
                </span>
              )}
            </div>

            {/* Signal Stack (shown as soon as it arrives, even before AI text) */}
            {signalStack && <SignalStackCard stack={signalStack} />}

            {/* AI Analysis text */}
            {content && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">AI Analysis</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto">
                    NVIDIA LLM
                  </span>
                </div>
                <MarkdownRenderer content={content} streaming={streaming} />
              </div>
            )}

            {/* Fetching indicator when signal stack is ready but text still loading */}
            {signalStack && !content && fetching && (
              <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-sm text-muted-foreground">Generating AI analysis...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
