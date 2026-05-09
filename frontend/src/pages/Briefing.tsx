import React, { useState, useRef, useEffect } from 'react';
import {
  Newspaper, RefreshCw, Clock, TrendingUp, TrendingDown,
  AlertCircle, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { aiApi } from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';

// ─── Status messages — cycled during data fetch ───────────────────────────────

const FETCH_STATUSES = [
  'Pulling Nifty & Sensex data...',
  'Checking FII/DII institutional flows...',
  'Reading global market cues...',
  'Scanning Rupee & Crude levels...',
  'Loading today\'s top headlines...',
  'Evaluating macro conditions...',
  'Preparing morning briefing...',
];

function StatusLine({ text, index }: { text: string; index: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 1500);
    return () => clearTimeout(t);
  }, [index]);

  return visible ? (
    <p
      className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in"
      style={{ animationDuration: '0.7s', animationFillMode: 'both' }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse flex-shrink-0" />
      {text}
    </p>
  ) : null;
}

// ─── Past briefing card ───────────────────────────────────────────────────────

interface PastBriefing {
  id: number;
  market_mood: string;
  fii_net_flow: string | null;
  generated_at: string;
}

function PastBriefingCard({ b }: { b: PastBriefing }) {
  const mood      = (b.market_mood || '').toLowerCase();
  const moodColor = mood === 'bullish' ? 'text-bull' : mood === 'bearish' ? 'text-bear' : 'text-amber-500';
  const fii       = b.fii_net_flow ? parseFloat(b.fii_net_flow) : null;
  const date      = new Date(b.generated_at).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
          <Newspaper className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div>
          <p className={cn('text-xs font-semibold capitalize', moodColor)}>
            {b.market_mood || 'Neutral'} Day
          </p>
          {fii != null && (
            <p className="text-[10px] text-muted-foreground">
              FII: {fii >= 0 ? '+' : ''}₹{fii.toLocaleString('en-IN')} Cr
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3" />
        {date}
      </div>
    </div>
  );
}

// ─── Main Briefing Page ───────────────────────────────────────────────────────

export default function Briefing() {
  const [content, setContent]           = useState('');
  const [streaming, setStreaming]       = useState(false);
  const [fetching, setFetching]         = useState(false);
  const [error, setError]               = useState('');
  const [generated, setGenerated]       = useState(false);
  const [pastBriefings, setPastBriefings] = useState<PastBriefing[]>([]);
  const [showPast, setShowPast]         = useState(false);
  const abortRef    = useRef<AbortController | null>(null);
  const contentRef  = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Auto-scroll as content streams in
  useEffect(() => {
    if (streaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, streaming]);

  // Load past briefings on mount
  useEffect(() => {
    aiApi.briefings()
      .then(data => setPastBriefings(data.briefings || []))
      .catch(() => {});
  }, []);

  function generate() {
    if (streaming || fetching) return;

    setContent('');
    setError('');
    setFetching(true);
    setStreaming(false);
    setGenerated(false);

    const abort = new AbortController();
    abortRef.current = abort;

    aiApi.briefing({
      signal: abort.signal,

      onMeta: (key) => {
        if (key === 'fetching')      { setFetching(true);  setStreaming(false); }
        if (key === 'stream_start')  { setFetching(false); setStreaming(true);  }
        if (key === 'briefing_start'){ setFetching(false); setStreaming(true);  }
      },

      onToken: (token) => {
        setFetching(false);
        setStreaming(true);
        setContent(prev => prev + token);
      },

      onDone: () => {
        setStreaming(false);
        setFetching(false);
        setGenerated(true);
        abortRef.current = null;
        // Refresh history list
        aiApi.briefings()
          .then(data => setPastBriefings(data.briefings || []))
          .catch(() => {});
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
    setStreaming(false);
    setFetching(false);
    setGenerated(!!content);
  }

  const isActive = streaming || fetching;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">Morning Briefing</h1>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            AI Generated
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* History toggle */}
          {pastBriefings.length > 0 && (
            <button
              onClick={() => setShowPast(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
            >
              <Clock className="w-3 h-3" />
              History
              {showPast
                ? <ChevronUp className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {/* Action button */}
          {isActive ? (
            <button
              onClick={stop}
              className="flex items-center gap-1.5 text-xs text-bear hover:text-bear/80 px-3 py-1.5 rounded-md border border-bear/20 hover:bg-bear/5 transition-colors"
            >
              <span className="w-2 h-2 rounded-sm bg-bear inline-block" />
              Stop
            </button>
          ) : (
            <button
              onClick={generate}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors font-medium active:scale-95"
            >
              <RefreshCw className={cn('w-3 h-3', isActive && 'animate-spin')} />
              {generated ? 'Regenerate' : 'Generate Briefing'}
            </button>
          )}
        </div>
      </div>

      {/* ── Past briefings drawer ───────────────────────────────────────────── */}
      {showPast && pastBriefings.length > 0 && (
        <div className="flex-shrink-0 border-b border-border px-5 py-3 bg-secondary/20">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Previous Briefings
          </p>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {pastBriefings.map(b => (
              <PastBriefingCard key={b.id} b={b} />
            ))}
          </div>
        </div>
      )}

      {/* ── Scrollable content area ─────────────────────────────────────────── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-5">

        {/* Empty / idle state */}
        {!content && !fetching && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
              <Newspaper className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground mb-1">Morning Market Briefing</h2>
            <p className="text-xs text-muted-foreground mb-1">{today}</p>
            <p className="text-sm text-muted-foreground max-w-sm mb-7 leading-relaxed mt-2">
              Get a complete AI-powered briefing covering market mood, global cues, FII flows, macro conditions, stocks to watch, and key risks.
            </p>

            <button
              onClick={generate}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-7 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all active:scale-95 shadow-sm"
            >
              <Zap className="w-4 h-4" />
              Generate Today's Briefing
            </button>

            {/* What's included preview */}
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-3 text-center max-w-md w-full">
              {[
                { icon: TrendingUp,   label: 'Market Mood',   color: 'text-bull'    },
                { icon: RefreshCw,    label: 'Global Cues',   color: 'text-primary' },
                { icon: Newspaper,    label: 'FII/DII Flows', color: 'text-primary' },
                { icon: Clock,        label: 'Macro Watch',   color: 'text-amber-500' },
                { icon: TrendingUp,   label: 'Stocks to Watch', color: 'text-bull'  },
                { icon: TrendingDown, label: 'Key Risks',     color: 'text-bear'    },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border bg-card">
                  <Icon className={cn('w-4 h-4', color)} />
                  <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fetching / loading state */}
        {fetching && !content && (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <div className="relative w-14 h-14 mb-5">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <Newspaper className="absolute inset-0 m-auto w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Compiling Today's Briefing</h3>
            <p className="text-xs text-muted-foreground mb-5">Gathering live data from multiple sources...</p>
            <div className="space-y-2 text-left">
              {FETCH_STATUSES.map((status, i) => (
                <StatusLine key={i} text={status} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-bear/20 bg-bear/5 mt-4 max-w-lg">
            <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-bear mb-1">Generation Failed</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
              <button
                onClick={generate}
                className="text-xs text-primary hover:underline mt-2 inline-block"
              >
                Try again →
              </button>
            </div>
          </div>
        )}

        {/* Streaming / completed content */}
        {content && (
          <div className="max-w-3xl">

            {/* Briefing header bar */}
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Newspaper className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Morning Briefing</p>
                <p className="text-[10px] text-muted-foreground">{today}</p>
              </div>
              {streaming ? (
                <span className="flex items-center gap-1.5 text-[10px] text-primary bg-primary/10 px-2.5 py-1 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Live
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[10px] text-bull bg-bull/10 px-2.5 py-1 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-bull" />
                  Complete
                </span>
              )}
            </div>

            {/* Rendered markdown content */}
            <MarkdownRenderer
              content={content}
              streaming={streaming}
              className="space-y-0.5"
            />

            {/* Footer */}
            {generated && !streaming && (
              <div className="mt-8 pt-4 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-[10px] text-muted-foreground">
                  For informational purposes only. Not financial advice.
                </p>
                <button
                  onClick={generate}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md border border-border hover:border-primary/40 hover:bg-accent transition-all"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
