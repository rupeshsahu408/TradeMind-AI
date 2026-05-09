import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar, ChevronRight, AlertCircle, Zap, Square,
  Building2, Globe, Flag, TrendingUp, Sun, BarChart2,
  RefreshCw, Clock, Filter,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  type: 'rbi' | 'fed' | 'holiday' | 'budget' | 'expiry' | 'earnings';
  type_label: string;
  date: string;
  title: string;
  description: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  days_until: number;
  ticker?: string;
}

type FilterType = 'all' | 'rbi' | 'fed' | 'holiday' | 'budget' | 'expiry' | 'earnings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} />;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  rbi:      { icon: Building2,   color: 'text-blue-400',   bg: 'bg-blue-400/10' },
  fed:      { icon: Globe,       color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  holiday:  { icon: Sun,         color: 'text-amber-400',  bg: 'bg-amber-400/10' },
  budget:   { icon: Flag,        color: 'text-rose-400',   bg: 'bg-rose-400/10' },
  expiry:   { icon: BarChart2,   color: 'text-orange-400', bg: 'bg-orange-400/10' },
  earnings: { icon: TrendingUp,  color: 'text-emerald-400',bg: 'bg-emerald-400/10' },
};

const IMPACT_COLOR: Record<string, string> = {
  LOW:      'text-muted-foreground bg-muted',
  MEDIUM:   'text-amber-400 bg-amber-400/10',
  HIGH:     'text-orange-400 bg-orange-400/10',
  CRITICAL: 'text-rose-400 bg-rose-400/10',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function DaysUntilBadge({ days }: { days: number }) {
  if (days < 0)  return <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">Past</span>;
  if (days === 0) return <span className="text-[10px] text-rose-400 px-2 py-0.5 rounded-full bg-rose-400/10 font-bold">TODAY</span>;
  if (days === 1) return <span className="text-[10px] text-orange-400 px-2 py-0.5 rounded-full bg-orange-400/10 font-bold">Tomorrow</span>;
  if (days <= 7)  return <span className="text-[10px] text-amber-400 px-2 py-0.5 rounded-full bg-amber-400/10 font-semibold">In {days} days</span>;
  return <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">In {days} days</span>;
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event, selected, onClick,
}: {
  event: CalendarEvent;
  selected: boolean;
  onClick: () => void;
}) {
  const cfg  = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.earnings;
  const Icon = cfg.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-xl border transition-all group hover:border-primary/40 hover:bg-accent/30',
        selected
          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
          : 'border-border bg-card',
        event.days_until < 0 && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
          <Icon className={cn('w-4 h-4', cfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground leading-snug">{event.title}</p>
            <DaysUntilBadge days={event.days_until} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(event.date)}</p>
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{event.description}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
              {event.type_label}
            </span>
            <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', IMPACT_COLOR[event.impact])}>
              {event.impact} impact
            </span>
          </div>
        </div>
        <ChevronRight className={cn(
          'w-4 h-4 text-muted-foreground flex-shrink-0 mt-2 transition-colors',
          selected ? 'text-primary' : 'group-hover:text-foreground',
        )} />
      </div>
    </button>
  );
}

// ─── AI Analysis Panel ────────────────────────────────────────────────────────

function AIAnalysisPanel({ event }: { event: CalendarEvent }) {
  const [content, setContent]   = useState('');
  const [fetching, setFetching] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError]       = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const prevEventId = useRef('');

  const STATUS = [
    'Reading macro context...',
    'Analysing historical precedent...',
    'Identifying sector impact...',
    'Building pre-event view...',
  ];
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    if (!fetching) { setStatusIdx(0); return; }
    const t = setInterval(() => setStatusIdx(i => (i + 1) % STATUS.length), 1800);
    return () => clearInterval(t);
  }, [fetching]);

  const analyze = useCallback(() => {
    abortRef.current?.abort();
    setContent(''); setError(''); setFetching(true); setStreaming(false);

    const abort = new AbortController();
    abortRef.current = abort;
    const token = localStorage.getItem('session_token') || '';
    const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

    fetch(`${BASE}/events/${event.id}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token },
      body:    JSON.stringify({ event }),
      signal:  abort.signal,
    }).then(res => {
      if (!res.ok || !res.body) throw new Error('Connection failed');
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';

      function pump(): Promise<void> {
        return reader.read().then(({ done, value }) => {
          if (done) { setFetching(false); setStreaming(false); abortRef.current = null; return; }
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const obj = JSON.parse(line.slice(6));
              if (obj.meta === 'fetching')     { setFetching(true);  setStreaming(false); }
              if (obj.meta === 'stream_start') { setFetching(false); setStreaming(true);  }
              if (obj.token) { setFetching(false); setStreaming(true); setContent(p => p + obj.token); }
              if (obj.error) { setError(obj.error); setFetching(false); setStreaming(false); }
              if (obj.done)  { setFetching(false); setStreaming(false); abortRef.current = null; }
            } catch { /* skip malformed */ }
          }
          return pump();
        });
      }
      return pump();
    }).catch(err => {
      if (err.name !== 'AbortError') {
        setError('Analysis failed. Please try again.');
        setFetching(false); setStreaming(false);
      }
    });
  }, [event]);

  // Auto-analyze when event changes
  useEffect(() => {
    if (event.id !== prevEventId.current) {
      prevEventId.current = event.id;
      analyze();
    }
    return () => { abortRef.current?.abort(); };
  }, [event.id, analyze]);

  const cfg  = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.earnings;
  const Icon = cfg.icon;
  const isActive = fetching || streaming;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', cfg.bg)}>
            <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{event.title}</p>
            <p className="text-[10px] text-muted-foreground">{formatDate(event.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {streaming && (
            <span className="flex items-center gap-1.5 text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              Live
            </span>
          )}
          {isActive ? (
            <button
              onClick={() => { abortRef.current?.abort(); setFetching(false); setStreaming(false); }}
              className="flex items-center gap-1 text-xs text-bear border border-bear/20 px-2.5 py-1 rounded-md hover:bg-bear/5 transition-colors"
            >
              <Square className="w-3 h-3 fill-current" /> Stop
            </button>
          ) : (
            <button
              onClick={analyze}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-2.5 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Zap className="w-3 h-3" />{content ? 'Re-analyse' : 'Analyse'}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* Event details */}
        <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>

        {/* Loading state */}
        {fetching && !content && (
          <div className="flex items-center gap-2 py-6 justify-center flex-col">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-xs text-muted-foreground animate-fade-in" key={statusIdx}>{STATUS[statusIdx]}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-bear/20 bg-bear/5">
            <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        {/* AI content */}
        {content && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">AI Pre-Event Analysis</span>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">NVIDIA LLM</span>
            </div>
            <MarkdownRenderer content={content} streaming={streaming} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Filter Chips ─────────────────────────────────────────────────────────────

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all',      label: 'All Events' },
  { value: 'rbi',      label: 'RBI MPC' },
  { value: 'fed',      label: 'US Fed' },
  { value: 'expiry',   label: 'F&O Expiry' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'holiday',  label: 'Holidays' },
  { value: 'budget',   label: 'Budget' },
];

// ─── Main Calendar Page ───────────────────────────────────────────────────────

export default function CalendarPage() {
  const [events, setEvents]         = useState<CalendarEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [filter, setFilter]         = useState<FilterType>('all');
  const [selected, setSelected]     = useState<CalendarEvent | null>(null);
  const [showPast, setShowPast]     = useState(false);

  async function fetchEvents() {
    setLoading(true); setError('');
    try {
      const { events: data } = await api.get<{ events: CalendarEvent[] }>('/events');
      setEvents(data);
      // Auto-select first upcoming event
      const upcoming = data.find(e => e.days_until >= 0);
      if (upcoming && !selected) setSelected(upcoming);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchEvents(); }, []);

  const filtered = events.filter(e => {
    if (filter !== 'all' && e.type !== filter) return false;
    if (!showPast && e.days_until < 0) return false;
    return true;
  });

  // Group by month
  const byMonth: Record<string, CalendarEvent[]> = {};
  for (const evt of filtered) {
    const key = new Date(evt.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(evt);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">Event Calendar</h1>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            {events.filter(e => e.days_until >= 0 && e.days_until <= 30).length} events this month
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPast(p => !p)}
            className={cn(
              'text-[10px] px-2.5 py-1 rounded-md border transition-colors',
              showPast
                ? 'border-primary/40 text-primary bg-primary/5'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {showPast ? 'Hide past' : 'Show past'}
          </button>
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-md hover:bg-accent transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex-shrink-0 px-5 py-2.5 border-b border-border flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
        <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors flex-shrink-0',
              filter === f.value
                ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Event list */}
        <div className="w-full lg:w-2/5 xl:w-1/3 border-r border-border overflow-y-auto scrollbar-thin">
          {loading && (
            <div className="p-4 space-y-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
            </div>
          )}

          {error && (
            <div className="p-4">
              <div className="flex items-start gap-2 p-3 bg-bear/5 border border-bear/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-center p-6">
              <Calendar className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-foreground">No events found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {filter !== 'all' ? 'Try changing the filter.' : 'No upcoming events in the next 90 days.'}
              </p>
            </div>
          )}

          {!loading && !error && Object.entries(byMonth).map(([month, evts]) => (
            <div key={month}>
              <div className="px-4 py-2 border-b border-border bg-card/50 sticky top-0 z-10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{month}</p>
              </div>
              <div className="p-4 space-y-3">
                {evts.map(evt => (
                  <EventCard
                    key={evt.id}
                    event={evt}
                    selected={selected?.id === evt.id}
                    onClick={() => setSelected(evt)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* AI Analysis panel — desktop */}
        <div className="hidden lg:flex flex-1 p-4 overflow-hidden">
          {selected ? (
            <AIAnalysisPanel key={selected.id} event={selected} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Calendar className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-base font-bold text-foreground mb-2">Select an event</h2>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Click any event in the list to get an AI-powered pre-event analysis — what to expect, which stocks to watch, and how to position.
              </p>
            </div>
          )}
        </div>

        {/* Mobile: Selected event AI panel below list */}
        {selected && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 bg-background border-t border-border z-40 h-[55vh] overflow-hidden">
            <div className="h-full flex flex-col">
              <button
                onClick={() => setSelected(null)}
                className="flex-shrink-0 text-xs text-muted-foreground px-4 py-2 text-right border-b border-border hover:text-foreground"
              >
                Close ×
              </button>
              <div className="flex-1 overflow-hidden">
                <AIAnalysisPanel key={selected.id} event={selected} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
