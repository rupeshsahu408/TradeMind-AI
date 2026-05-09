import React, { useState, useEffect, useRef } from 'react';
import {
  History as HistoryIcon, MessageSquare, Newspaper, TrendingUp,
  Search, ChevronRight, AlertCircle, ArrowLeft, X,
  CheckCircle, XCircle, Clock, Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatSession {
  session_id: string;
  started_at: string;
  last_message_at: string;
  message_count: number;
  preview: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Briefing {
  id: number;
  market_mood: string;
  fii_net_flow: string;
  generated_at: string;
  preview: string;
  picks_count: number;
}

interface FullBriefing {
  id: number;
  content: string;
  market_mood: string;
  fii_net_flow: string;
  generated_at: string;
  top_picks: string[];
}

interface Analysis {
  id: number;
  ticker: string;
  company_name: string;
  verdict: string;
  confidence: number;
  signal_stack_score: number;
  market_price_at_prediction: string;
  timeframe: string;
  predicted_at: string;
  reasoning_preview: string;
}

interface SearchResult {
  source_type: 'chat' | 'briefing' | 'analysis';
  id: number;
  session_id: string | null;
  role: string | null;
  created_at: string;
  excerpt: string;
  ticker: string | null;
}

type Tab = 'sessions' | 'briefings' | 'analyses';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} />;
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fullDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const MOOD_COLOR: Record<string, string> = {
  bullish: 'text-bull bg-bull/10',
  bearish: 'text-bear bg-bear/10',
  neutral: 'text-amber-400 bg-amber-400/10',
};

const VERDICT_COLOR: Record<string, string> = {
  STRONG_BUY:  'text-bull bg-bull/10',
  BUY:         'text-bull bg-bull/10',
  HOLD:        'text-amber-400 bg-amber-400/10',
  AVOID:       'text-bear bg-bear/10',
  STRONG_SELL: 'text-bear bg-bear/10',
};

// ─── Chat Sessions Tab ────────────────────────────────────────────────────────

function ChatSessionsList({ onOpen }: { onOpen: (sid: string) => void }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get<{ sessions: ChatSession[] }>('/history/sessions')
      .then(d => setSessions(d.sessions))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>;
  if (error)   return <ErrorState msg={error} />;
  if (!sessions.length) return <EmptyState icon={MessageSquare} title="No chat sessions yet" desc="Start a conversation in the AI Chat to see history here." />;

  return (
    <div className="divide-y divide-border">
      {sessions.map(s => (
        <button key={s.session_id} onClick={() => onOpen(s.session_id)}
          className="w-full text-left px-5 py-4 hover:bg-accent/30 transition-colors group flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground font-medium leading-snug line-clamp-1">{s.preview || 'Chat session'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.message_count} messages</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(s.started_at)}</p>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto mt-1 group-hover:text-foreground transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );
}

function ChatSessionDetail({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get<{ messages: ChatMessage[] }>(`/history/session/${sessionId}`)
      .then(d => setMessages(d.messages))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-5 py-3 border-b border-border flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-foreground">Chat Session</p>
        <p className="text-xs text-muted-foreground ml-auto">{messages.length} messages</p>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
        {loading && <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>}
        {error && <ErrorState msg={error} />}
        {messages.map(m => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[80%] rounded-2xl px-4 py-3 text-sm',
              m.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-card border border-border text-foreground rounded-bl-sm',
            )}>
              {m.role === 'assistant'
                ? <MarkdownRenderer content={m.content} streaming={false} />
                : <p>{m.content}</p>
              }
              <p className={cn('text-[10px] mt-1', m.role === 'user' ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground')}>
                {fullDate(m.created_at)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Briefings Tab ────────────────────────────────────────────────────────────

function BriefingsList({ onOpen }: { onOpen: (id: number) => void }) {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    api.get<{ briefings: Briefing[] }>('/history/briefings')
      .then(d => setBriefings(d.briefings))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>;
  if (error)   return <ErrorState msg={error} />;
  if (!briefings.length) return <EmptyState icon={Newspaper} title="No briefings saved yet" desc="Generate a Morning Briefing to see it saved here." />;

  return (
    <div className="divide-y divide-border">
      {briefings.map(b => (
        <button key={b.id} onClick={() => onOpen(b.id)}
          className="w-full text-left px-5 py-4 hover:bg-accent/30 transition-colors group flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Newspaper className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {b.market_mood && (
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full capitalize', MOOD_COLOR[b.market_mood] || 'text-muted-foreground bg-muted')}>
                  {b.market_mood}
                </span>
              )}
              {b.picks_count > 0 && (
                <span className="text-[10px] text-muted-foreground">{b.picks_count} top picks</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{b.preview}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(b.generated_at)}</p>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto mt-1 group-hover:text-foreground transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );
}

function BriefingDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [briefing, setBriefing] = useState<FullBriefing | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get<{ briefing: FullBriefing }>(`/history/briefing/${id}`)
      .then(d => setBriefing(d.briefing))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-5 py-3 border-b border-border flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-foreground">Morning Briefing</p>
        {briefing && <p className="text-xs text-muted-foreground ml-auto">{fullDate(briefing.generated_at)}</p>}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        {loading && <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>}
        {error && <ErrorState msg={error} />}
        {briefing && (
          <div className="space-y-4">
            {briefing.market_mood && (
              <span className={cn('text-xs font-bold px-3 py-1.5 rounded-full capitalize', MOOD_COLOR[briefing.market_mood] || 'text-muted-foreground bg-muted')}>
                {briefing.market_mood} market
              </span>
            )}
            <MarkdownRenderer content={briefing.content} streaming={false} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Analyses Tab ─────────────────────────────────────────────────────────────

function AnalysesList() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get<{ analyses: Analysis[] }>('/history/analyses')
      .then(d => setAnalyses(d.analyses))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>;
  if (error)   return <ErrorState msg={error} />;
  if (!analyses.length) return <EmptyState icon={TrendingUp} title="No analyses saved yet" desc="Run a Stock Deep Dive analysis — it will appear here automatically." />;

  return (
    <div className="divide-y divide-border">
      {analyses.map(a => (
        <div key={a.id} className="px-5 py-4 flex items-start gap-3 hover:bg-accent/20 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-foreground">{a.ticker}</span>
              {a.company_name && <span className="text-xs text-muted-foreground truncate max-w-[160px]">{a.company_name}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', VERDICT_COLOR[a.verdict] || 'text-muted-foreground bg-muted')}>
                {a.verdict.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] text-muted-foreground">{a.confidence}% confidence</span>
              {a.signal_stack_score != null && (
                <span className="text-[10px] text-muted-foreground">{a.signal_stack_score}/5 signals</span>
              )}
              {a.market_price_at_prediction && (
                <span className="text-[10px] text-muted-foreground">@ ₹{parseFloat(a.market_price_at_prediction).toFixed(2)}</span>
              )}
            </div>
            {a.reasoning_preview && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1 leading-relaxed">{a.reasoning_preview}</p>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">{relativeTime(a.predicted_at)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Search Results ───────────────────────────────────────────────────────────

function SearchResults({ results, query }: { results: SearchResult[]; query: string }) {
  if (!results.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center p-6">
        <Search className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium text-foreground">No results for "{query}"</p>
        <p className="text-xs text-muted-foreground mt-1">Try a different search term.</p>
      </div>
    );
  }

  const iconMap: Record<string, React.ElementType> = { chat: MessageSquare, briefing: Newspaper, analysis: TrendingUp };
  const labelMap: Record<string, string> = { chat: 'Chat', briefing: 'Briefing', analysis: 'Analysis' };

  return (
    <div className="divide-y divide-border">
      {results.map((r, i) => {
        const Icon = iconMap[r.source_type] || MessageSquare;
        return (
          <div key={`${r.source_type}-${r.id}-${i}`} className="px-5 py-4 flex items-start gap-3 hover:bg-accent/20 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {labelMap[r.source_type]}
                </span>
                {r.ticker && <span className="text-[10px] font-bold text-foreground">{r.ticker}</span>}
                {r.role && <span className="text-[10px] text-muted-foreground capitalize">{r.role}</span>}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{r.excerpt}</p>
            </div>
            <p className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">{relativeTime(r.created_at)}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="p-4">
      <div className="flex items-start gap-2 p-3 bg-bear/5 border border-bear/20 rounded-xl">
        <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">{msg}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center p-8">
      <Icon className="w-10 h-10 text-muted-foreground mb-3" />
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{desc}</p>
    </div>
  );
}

// ─── Main History Page ────────────────────────────────────────────────────────

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: 'sessions',  label: 'Chat',      icon: MessageSquare },
  { value: 'briefings', label: 'Briefings', icon: Newspaper },
  { value: 'analyses',  label: 'Analyses',  icon: TrendingUp },
];

export default function History() {
  const [tab, setTab]                   = useState<Tab>('sessions');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching]       = useState(false);
  const [openSession, setOpenSession]   = useState<string | null>(null);
  const [openBriefing, setOpenBriefing] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(val: string) {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim() || val.trim().length < 2) { setSearchResults(null); setSearchQuery(''); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get<{ results: SearchResult[] }>(`/history/search?q=${encodeURIComponent(val.trim())}`);
        setSearchResults(data.results);
        setSearchQuery(val.trim());
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 500);
  }

  // Detail views
  if (openSession) return <ChatSessionDetail sessionId={openSession} onBack={() => setOpenSession(null)} />;
  if (openBriefing) return <BriefingDetail id={openBriefing} onBack={() => setOpenBriefing(null)} />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <HistoryIcon className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">Research Log</h1>
        </div>
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search all history..."
            className="w-full pl-9 pr-9 py-2 text-sm bg-accent/40 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          {searchInput && !searching && (
            <button onClick={() => { setSearchInput(''); setSearchResults(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search results */}
      {searchResults !== null ? (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-5 py-2 border-b border-border bg-card/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {searchResults.length} results for "{searchQuery}"
            </p>
          </div>
          <SearchResults results={searchResults} query={searchQuery} />
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex-shrink-0 flex border-b border-border px-5">
            {TABS.map(t => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
                  tab === t.value
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {tab === 'sessions'  && <ChatSessionsList onOpen={setOpenSession} />}
            {tab === 'briefings' && <BriefingsList onOpen={setOpenBriefing} />}
            {tab === 'analyses'  && <AnalysesList />}
          </div>
        </>
      )}
    </div>
  );
}
