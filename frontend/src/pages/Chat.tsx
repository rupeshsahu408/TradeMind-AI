import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Send, Square, MessageSquare, Plus, TrendingUp,
  TrendingDown, Minus, AlertCircle, ChevronDown,
  History, X, Languages, Clock, ExternalLink,
  Newspaper, BarChart2, BookOpen, LineChart,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { aiApi, SignalStack } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import MarkdownRenderer from '../components/MarkdownRenderer';

const uuidv4 = (): string => crypto.randomUUID();

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceArticle {
  title:        string;
  url:          string;
  source:       string;
  published_at: string;
  sentiment:    'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null;
}

interface SourceLink {
  label: string;
  url:   string;
  icon:  string;
}

interface SourcesData {
  ticker:   string;
  company:  string;
  price:    number | null;
  articles: SourceArticle[];
  links:    SourceLink[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  signalStack?: SignalStack;
  sources?: SourcesData;
  timestamp: Date;
}

interface HistoryMsg {
  id: number;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface SessionItem {
  sid: string;
  preview: string;
  date: string;
  msgCount: number;
}

// ─── Status messages ──────────────────────────────────────────────────────────

const STATUS_POOLS = {
  stock: [
    'Pulling live market data...',
    'Checking technical indicators...',
    'Reading FII/DII flows...',
    'Scanning recent news...',
    'Evaluating signal stack...',
  ],
  market: [
    'Checking market indices...',
    'Scanning today\'s news...',
    'Reading global market cues...',
    'Analysing sector movements...',
  ],
  general: [
    'Processing your question...',
    'Gathering market context...',
    'Preparing analysis...',
  ],
};

function pickStatusMessages(message: string): string[] {
  const isStock  = /\b(stock|buy|sell|rsi|macd|technical|chart|invest|ipo|equity|nse|bse|[A-Z]{3,8})\b/i.test(message);
  const isMarket = /\b(market|nifty|sensex|fii|dii|sector|index|indices|rally|crash|correction)\b/i.test(message);
  const pool = isStock ? STATUS_POOLS.stock : isMarket ? STATUS_POOLS.market : STATUS_POOLS.general;
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
}

// ─── Signal Stack display ─────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: SignalStack['signals'][0] }) {
  const color = signal.value === 'BULLISH'
    ? 'bg-bull/10 text-bull border-bull/20'
    : signal.value === 'BEARISH'
      ? 'bg-bear/10 text-bear border-bear/20'
      : 'bg-muted text-muted-foreground border-border';

  const Icon = signal.value === 'BULLISH' ? TrendingUp : signal.value === 'BEARISH' ? TrendingDown : Minus;

  return (
    <div
      className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium', color)}
      title={signal.detail}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span>{signal.name}</span>
    </div>
  );
}

function SignalStackDisplay({ stack }: { stack: SignalStack }) {
  const [expanded, setExpanded] = useState(false);
  const verdictColor = stack.confidence >= 75 ? 'text-bull'
    : stack.confidence >= 60 ? 'text-amber-500'
      : stack.confidence >= 45 ? 'text-orange-400' : 'text-bear';
  const confBg = stack.confidence >= 75 ? 'bg-bull/10 border-bull/20'
    : stack.confidence >= 60 ? 'bg-amber-500/10 border-amber-500/20'
      : 'bg-bear/10 border-bear/20';

  return (
    <div className="mt-3 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-secondary/40 hover:bg-secondary/70 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Signal Stack</span>
          <div className="flex gap-1">
            {stack.signals.map(s => (
              <span
                key={s.name}
                className={cn('w-2 h-2 rounded-full', s.value === 'BULLISH' ? 'bg-bull' : s.value === 'BEARISH' ? 'bg-bear' : 'bg-muted-foreground')}
              />
            ))}
          </div>
          <span className={cn('text-xs font-bold', verdictColor)}>{stack.verdict}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('px-2 py-0.5 rounded-full border text-xs font-bold', confBg, verdictColor)}>
            {stack.confidence}%
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-1.5 border-t border-border">
          {stack.signals.map(s => (
            <div key={s.name} className="flex items-start gap-2">
              <SignalBadge signal={s} />
              <p className="text-[11px] text-muted-foreground pt-0.5 flex-1">{s.detail}</p>
            </div>
          ))}
          <div className="pt-1 border-t border-border/50 mt-1.5">
            <p className="text-[10px] text-muted-foreground">
              {stack.bullishCount}/5 bullish · {stack.bearishCount}/5 bearish · Confidence: {stack.confidence}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sources Panel ────────────────────────────────────────────────────────────

const LINK_ICONS: Record<string, React.ReactNode> = {
  nse:      <BookOpen className="w-3 h-3" />,
  screener: <BarChart2 className="w-3 h-3" />,
  chart:    <LineChart className="w-3 h-3" />,
  mc:       <Newspaper className="w-3 h-3" />,
};

const SENTIMENT_STYLES: Record<string, string> = {
  POSITIVE: 'bg-bull/10 text-bull border-bull/20',
  NEGATIVE: 'bg-bear/10 text-bear border-bear/20',
  NEUTRAL:  'bg-muted text-muted-foreground border-border',
};

function SourcesPanel({ data }: { data: SourcesData }) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = data.articles.length + data.links.length;

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.floor(ms / 3600000);
    if (h < 1) return 'just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="mt-2 border border-border/60 rounded-lg overflow-hidden text-[11px]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-secondary/30 hover:bg-secondary/60 transition-colors"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <ExternalLink className="w-3 h-3 text-primary/70" />
          <span className="font-medium text-foreground">Sources</span>
          <span className="text-muted-foreground">·</span>
          <span>{data.ticker}</span>
          {data.price && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground font-medium">₹{data.price}</span>
            </>
          )}
          <span className="text-muted-foreground">·</span>
          <span>{totalCount} sources</span>
        </div>
        <ChevronDown className={cn('w-3 h-3 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="border-t border-border/60">
          {/* External data links */}
          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border/40">
            {data.links.map(link => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/60 hover:bg-secondary border border-border/60 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
              >
                {LINK_ICONS[link.icon] || <ExternalLink className="w-3 h-3" />}
                <span>{link.label}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-40" />
              </a>
            ))}
          </div>

          {/* News articles */}
          {data.articles.length > 0 && (
            <div className="divide-y divide-border/30">
              {data.articles.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2.5 px-3 py-2 hover:bg-accent/40 transition-colors group"
                >
                  <Newspaper className="w-3 h-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2">
                      {a.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-muted-foreground">{a.source}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">{timeAgo(a.published_at)}</span>
                      {a.sentiment && (
                        <>
                          <span className="text-muted-foreground/50">·</span>
                          <span className={cn(
                            'px-1.5 py-px rounded border text-[10px] font-medium',
                            SENTIMENT_STYLES[a.sentiment] || SENTIMENT_STYLES.NEUTRAL,
                          )}>
                            {a.sentiment}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/50 flex-shrink-0 mt-0.5 transition-colors" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Working status animation ─────────────────────────────────────────────────

function WorkingStatus({ messages, visible }: { messages: string[]; visible: boolean }) {
  const [shownCount, setShownCount] = useState(0);

  useEffect(() => {
    if (!visible) { setShownCount(0); return; }
    setShownCount(1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    messages.forEach((_, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => setShownCount(i + 1), i * 2000));
    });
    return () => timers.forEach(clearTimeout);
  }, [visible, messages]);

  if (!visible) return null;

  return (
    <div className="space-y-1 py-1">
      {messages.slice(0, shownCount).map((msg, i) => (
        <p
          key={i}
          className="text-xs text-muted-foreground animate-fade-in flex items-center gap-2"
          style={{ animationDuration: '0.8s', animationFillMode: 'both' }}
        >
          <span className="w-1 h-1 rounded-full bg-primary/50 inline-block animate-pulse" />
          {msg}
        </p>
      ))}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[90%] w-full">
        <div className={cn(
          'px-4 py-3 rounded-2xl rounded-tl-sm bg-secondary/60 border border-border/50',
          msg.error && 'border-bear/30 bg-bear/5',
        )}>
          {msg.error ? (
            <div className="flex items-start gap-2 text-bear text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{msg.content}</span>
            </div>
          ) : msg.content ? (
            <MarkdownRenderer content={msg.content} streaming={msg.streaming} />
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
        {msg.signalStack && !msg.streaming && (
          <SignalStackDisplay stack={msg.signalStack} />
        )}
        {msg.sources && !msg.streaming && (
          <SourcesPanel data={msg.sources} />
        )}
        <p className="text-[10px] text-muted-foreground mt-1 ml-1">
          {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

interface HistoryPanelProps {
  sessions: SessionItem[];
  loading: boolean;
  currentSid: string;
  onLoadSession: (sid: string) => void;
  onClose: () => void;
  onNewChat: () => void;
}

function HistoryPanel({ sessions, loading, currentSid, onLoadSession, onClose, onNewChat }: HistoryPanelProps) {
  function relativeDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-card animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold text-foreground">History</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New chat button */}
      <div className="px-3 py-2 border-b border-border/50">
        <button
          onClick={() => { onNewChat(); onClose(); }}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-dashed border-border"
        >
          <Plus className="w-3 h-3" />
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {loading ? (
          <div className="space-y-1.5 px-3 py-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <Clock className="w-7 h-7 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No chat history yet.</p>
            <p className="text-[10px] text-muted-foreground mt-1">Start a conversation to see it here.</p>
          </div>
        ) : (
          <div className="px-2 py-1 space-y-0.5">
            {sessions.map((s) => (
              <button
                key={s.sid}
                onClick={() => onLoadSession(s.sid)}
                className={cn(
                  'flex flex-col items-start w-full px-3 py-2.5 rounded-md text-left transition-colors',
                  s.sid === currentSid
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <p className="text-xs font-medium leading-snug truncate w-full">
                  {s.preview || 'Conversation'}
                </p>
                <p className="text-[10px] mt-0.5 opacity-60">{relativeDate(s.date)} · {s.msgCount} msgs</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Chat Page ───────────────────────────────────────────────────────────

export default function Chat() {
  const { language, setLanguage } = useAuth();

  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [streaming, setStreaming]     = useState(false);
  const [statusMsgs, setStatusMsgs]   = useState<string[]>([]);
  const [showStatus, setShowStatus]   = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [allHistory, setAllHistory]   = useState<HistoryMsg[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const sessionId = useRef(uuidv4());
  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const aiMsgId   = useRef<string>('');

  const isHindi = language === 'hindi';

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load history when panel opens
  useEffect(() => {
    if (historyOpen && allHistory.length === 0 && !historyLoading) {
      fetchHistory();
    }
  }, [historyOpen]);

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const resp = await aiApi.chatHistory({ limit: 200 });
      setAllHistory(resp.history);
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
    }
  }

  // Sessions: group allHistory by session_id (newest first)
  const sessions = useMemo((): SessionItem[] => {
    const map = new Map<string, SessionItem>();
    for (const msg of allHistory) {
      if (!map.has(msg.session_id)) {
        map.set(msg.session_id, {
          sid:      msg.session_id,
          preview:  msg.role === 'user' ? msg.content.slice(0, 55) : 'AI response',
          date:     msg.created_at,
          msgCount: 0,
        });
      }
      map.get(msg.session_id)!.msgCount++;
    }
    return Array.from(map.values());
  }, [allHistory]);

  function loadSession(sid: string) {
    if (streaming) return;
    const sessionMsgs: Message[] = allHistory
      .filter(m => m.session_id === sid)
      .map(m => ({
        id:        String(m.id),
        role:      m.role as 'user' | 'assistant',
        content:   m.content,
        streaming: false,
        timestamp: new Date(m.created_at),
      }));
    sessionId.current = sid;
    setMessages(sessionMsgs);
    setHistoryOpen(false);
  }

  function newChat() {
    if (streaming) return;
    sessionId.current = uuidv4();
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  }

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: uuidv4(), role: 'user', content: text, timestamp: new Date() };

    const aId = uuidv4();
    aiMsgId.current = aId;
    const aiMsg: Message = { id: aId, role: 'assistant', content: '', streaming: true, timestamp: new Date() };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput('');
    setStreaming(true);

    const statusMessages = pickStatusMessages(text);
    setStatusMsgs(statusMessages);
    setShowStatus(true);

    const abort = new AbortController();
    abortRef.current = abort;

    const history = messages.map(m => ({ role: m.role, content: m.content }));

    let streamStarted = false;
    let pendingStack: SignalStack | undefined;
    let pendingSources: SourcesData | undefined;

    aiApi.chat(text, history, sessionId.current, {
      signal: abort.signal,

      onMeta: (key, value) => {
        if (key === 'stream_start') { streamStarted = true; setShowStatus(false); }
        if (key === 'signal_stack') { pendingStack = value as SignalStack; }
        if (key === 'sources')      { pendingSources = value as SourcesData; }
      },

      onToken: (token) => {
        if (!streamStarted) { streamStarted = true; setShowStatus(false); }
        setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: m.content + token } : m));
      },

      onDone: () => {
        setStreaming(false);
        setShowStatus(false);
        abortRef.current = null;
        setMessages(prev => prev.map(m =>
          m.id === aId
            ? { ...m, streaming: false, signalStack: pendingStack, sources: pendingSources }
            : m,
        ));
        inputRef.current?.focus();
        setAllHistory([]);
      },

      onError: (msg) => {
        setMessages(prev => prev.map(m =>
          m.id === aId ? { ...m, content: msg, streaming: false, error: true } : m,
        ));
      },
    });
  }, [input, streaming, messages]);

  function abort() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setShowStatus(false);
    setMessages(prev => prev.map(m =>
      m.id === aiMsgId.current && m.streaming
        ? { ...m, streaming: false, content: m.content + '\n\n*[Response stopped]*' }
        : m,
    ));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const suggestions = isHindi
    ? [
        'RELIANCE aaj kharidna chahiye?',
        'Market mood abhi kaisa hai?',
        'HDFCBANK ka RSI aur MACD batao',
        'Aaj ke top sectors kaun se hain?',
        'FII kya kar raha hai market mein?',
        'INFY pe kya view hai aaj?',
      ]
    : [
        'Is RELIANCE a good buy today?',
        'What is the market mood right now?',
        'Analyse HDFCBANK with RSI and MACD',
        'Give me top sectors to watch today',
        'What is FII doing in the market?',
        'INFY pe kya view hai aaj?',
      ];

  return (
    <div className="flex h-full max-h-[calc(100vh-3.5rem)]">

      {/* History Panel */}
      {historyOpen && (
        <HistoryPanel
          sessions={sessions}
          loading={historyLoading}
          currentSid={sessionId.current}
          onLoadSession={loadSession}
          onClose={() => setHistoryOpen(false)}
          onNewChat={newChat}
        />
      )}

      {/* Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* History toggle */}
            <button
              onClick={() => {
                setHistoryOpen(v => !v);
              }}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                historyOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
              title="Chat history"
            >
              <History className="w-4 h-4" />
            </button>
            <MessageSquare className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-semibold text-foreground">AI Research Chat</h1>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              NVIDIA LLM
            </span>
            {/* Hindi mode indicator */}
            {isHindi && (
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium border border-primary/20">
                हिंदी
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={() => setLanguage(isHindi ? 'english' : 'hindi')}
              className={cn(
                'flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-colors',
                isHindi
                  ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/15'
                  : 'text-muted-foreground border-border hover:bg-accent hover:text-foreground',
              )}
              title={isHindi ? 'Switch to English' : 'Switch to Hindi'}
            >
              <Languages className="w-3 h-3" />
              {isHindi ? 'हिंदी' : 'EN'}
            </button>

            {/* New chat */}
            <button
              onClick={newChat}
              disabled={streaming}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-8">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground mb-1">Billionaire AI</h2>
              <p className="text-xs text-muted-foreground text-center max-w-xs mb-1">
                {isHindi
                  ? 'Senior trader की सोच। Live market data। 15+ signals। Word-by-word streaming।'
                  : 'Senior proprietary trader mindset. Live market data. 15+ signals. Streams word-by-word.'}
              </p>
              {isHindi && (
                <p className="text-[11px] text-primary/70 mb-5">हिंदी / Hinglish में पूछें — AI हिंदी में जवाब देगा।</p>
              )}
              <div className={cn(!isHindi && 'mb-6')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-left text-xs px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-all leading-snug"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div key={msg.id}>
              <MessageBubble msg={msg} />
              {msg.role === 'assistant' && msg.streaming && !msg.content && (
                <div className="ml-0 mb-2 px-4 pb-1">
                  <WorkingStatus messages={statusMsgs} visible={showStatus} />
                </div>
              )}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-border px-4 py-3 bg-background">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
              rows={1}
              placeholder={
                streaming
                  ? 'AI is responding...'
                  : isHindi
                    ? 'कोई भी stock, sector ya market ke baare mein puchho...'
                    : 'Ask about any stock, sector, or market...'
              }
              className={cn(
                'flex-1 resize-none bg-input border border-border rounded-xl px-4 py-3',
                'text-sm text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                'transition-all min-h-[44px] max-h-[160px] overflow-y-auto disabled:opacity-60',
              )}
              style={{ height: 'auto', minHeight: '44px' }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 160) + 'px';
              }}
            />

            {streaming ? (
              <button
                onClick={abort}
                className="w-10 h-10 flex-shrink-0 rounded-xl bg-bear/10 text-bear border border-bear/30 flex items-center justify-center hover:bg-bear/20 transition-colors"
                title="Stop generating"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className={cn(
                  'w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center transition-all',
                  input.trim()
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
                title="Send (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            {isHindi
              ? 'Enter dababein bhejne ke liye · Shift+Enter nai line ke liye · Sirf jankari ke liye'
              : 'Press Enter to send · Shift+Enter for new line · For informational purposes only'}
          </p>
        </div>
      </div>
    </div>
  );
}
