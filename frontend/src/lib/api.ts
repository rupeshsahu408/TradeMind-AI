// Central API client — all calls go through Node.js backend (/api/*)
// Frontend never calls Python service directly.
//
// In development: Vite proxies /api → localhost:3001 (no env var needed)
// In production:  VITE_API_URL must point to the Render backend base URL
//                 e.g. https://billionaire-ai-backend.onrender.com
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

function getToken(): string | null {
  return localStorage.getItem('session_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) {
    headers['x-session-token'] = token;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  get:    <T>(path: string) => request<T>('GET', path),
  post:   <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put:    <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  status: () => api.get<{ isSetup: boolean }>('/auth/status'),
  setup:  (pin: string, language?: string, theme?: string) =>
    api.post<{ success: boolean; token: string; userId: number; language: string; theme: string }>(
      '/auth/setup', { pin, language, theme },
    ),
  verify: (pin: string) =>
    api.post<{ success: boolean; token: string; userId: number; language: string; theme: string }>(
      '/auth/verify', { pin },
    ),
  logout: () => api.post('/auth/logout'),
  me:     () => api.get<{ user: unknown; preferences: unknown }>('/auth/me'),
};

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthApi = {
  check: () => api.get('/health'),
};

// ─── Market Data ──────────────────────────────────────────────────────────────
export interface IndexData {
  name: string;
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  day_high: number;
  day_low: number;
  prev_close: number;
  error?: string;
}

export interface IndicesResponse {
  nifty50:   IndexData;
  sensex:    IndexData;
  banknifty: IndexData;
}

export interface QuoteData {
  ticker: string;
  company: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  market_cap: number;
  day_high: number;
  day_low: number;
  week_52_high: number;
  week_52_low: number;
  open: number;
  prev_close: number;
  currency: string;
  exchange: string;
  timestamp: string;
}

export interface HistoryData {
  ticker: string;
  period: string;
  interval: string;
  count: number;
  data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
}

export interface FundamentalsData {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  market_cap: number;
  pe_ratio: number | null;
  forward_pe: number | null;
  eps: number | null;
  book_value: number | null;
  price_to_book: number | null;
  dividend_yield: number | null;
  week_52_high: number;
  week_52_low: number;
  beta: number | null;
  profit_margins: number | null;
  debt_to_equity: number | null;
  return_on_equity: number | null;
  description: string;
}

export const marketApi = {
  indices:      ()                                         => api.get<IndicesResponse>('/market/indices'),
  quote:        (ticker: string)                           => api.get<QuoteData>(`/market/quote?ticker=${encodeURIComponent(ticker)}`),
  history:      (ticker: string, period = '1mo', interval = '1d') =>
    api.get<HistoryData>(`/market/history?ticker=${encodeURIComponent(ticker)}&period=${period}&interval=${interval}`),
  fundamentals: (ticker: string)                           => api.get<FundamentalsData>(`/market/fundamentals?ticker=${encodeURIComponent(ticker)}`),
  earnings:     (ticker: string)                           => api.get(`/market/earnings?ticker=${encodeURIComponent(ticker)}`),
  intraday:     (ticker: string, interval = '15m')        => api.get(`/market/intraday?ticker=${encodeURIComponent(ticker)}&interval=${interval}`),
};

// ─── NSE ──────────────────────────────────────────────────────────────────────
export interface FiiDiiData {
  source: string;
  fii_net: number | null;
  dii_net: number | null;
  market_mood: string;
  data: Array<{ date: string; category: string; buy: number; sell: number; net: number }>;
  error?: string;
  timestamp: string;
}

export interface TopMoversData {
  gainers: Array<{ ticker: string; company: string; price: number; change_pct: number; volume: number }>;
  losers:  Array<{ ticker: string; company: string; price: number; change_pct: number; volume: number }>;
  source: string;
  timestamp: string;
}

export interface SectorData {
  name:       string;
  index_name: string;
  price:      number;
  change:     number;
  change_pct: number;
  day_high:   number;
  day_low:    number;
}

export interface SectorsResponse {
  sectors:   SectorData[];
  count:     number;
  source:    string;
  timestamp: string;
}

export const nseApi = {
  fiiDii:       ()               => api.get<FiiDiiData>('/nse/fii-dii'),
  options:      (ticker: string) => api.get(`/nse/options?ticker=${encodeURIComponent(ticker)}`),
  topMovers:    ()               => api.get<TopMoversData>('/nse/top-movers'),
  circuitStocks:()               => api.get('/nse/circuit-stocks'),
  sectors:      ()               => api.get<SectorsResponse>('/nse/sectors'),
  bulkDeals:    ()               => api.get('/nse/bulk-deals'),
  blockDeals:   ()               => api.get('/nse/block-deals'),
};

// ─── Technical ────────────────────────────────────────────────────────────────
export const technicalApi = {
  rsi:          (ticker: string, interval = 'daily', period = 14) =>
    api.get(`/technical/rsi?ticker=${encodeURIComponent(ticker)}&interval=${interval}&period=${period}`),
  macd:         (ticker: string, interval = 'daily') =>
    api.get(`/technical/macd?ticker=${encodeURIComponent(ticker)}&interval=${interval}`),
  bollinger:    (ticker: string, interval = 'daily', period = 20) =>
    api.get(`/technical/bollinger?ticker=${encodeURIComponent(ticker)}&interval=${interval}&period=${period}`),
  ema:          (ticker: string, interval = 'daily', period = 20) =>
    api.get(`/technical/ema?ticker=${encodeURIComponent(ticker)}&interval=${interval}&period=${period}`),
  summary:      (ticker: string) =>
    api.get(`/technical/summary?ticker=${encodeURIComponent(ticker)}`),
  candlestick:  (ticker: string, days = 14) =>
    api.get(`/technical/candlestick?ticker=${encodeURIComponent(ticker)}&days=${days}`),
};

// ─── Screener ─────────────────────────────────────────────────────────────────
export const screenerApi = {
  fundamentals: (ticker: string) =>
    api.get(`/screener/fundamentals?ticker=${encodeURIComponent(ticker)}`),
};

// ─── Macro ────────────────────────────────────────────────────────────────────
export interface CommodityItem {
  price: number;
  change: number;
  change_pct: number;
  label: string;
  unit: string;
  ticker: string;
  currency: string;
}

export interface ForexItem {
  rate: number;
  change: number;
  change_pct: number;
  label: string;
  ticker: string;
}

export interface GlobalIndexItem {
  price: number;
  change: number;
  change_pct: number;
  label: string;
  ticker: string;
}

export interface MacroSnapshot {
  commodities:    Record<string, CommodityItem>;
  forex:          Record<string, ForexItem>;
  global_indices: Record<string, GlobalIndexItem>;
  gift_nifty:     {
    gift_nifty_approx: number;
    direction: string;
    gap_vs_prev_close_pct: number;
    sp500_futures_change_pct?: number;
  };
  timestamp: string;
}

export const macroApi = {
  commodities:   () => api.get<Record<string, CommodityItem>>('/macro/commodities'),
  forex:         () => api.get<Record<string, ForexItem>>('/macro/forex'),
  sgxNifty:      () => api.get('/macro/sgx-nifty'),
  globalIndices: () => api.get<Record<string, GlobalIndexItem>>('/macro/global-indices'),
  snapshot:      () => api.get<MacroSnapshot>('/macro/snapshot'),
};

// ─── News ──────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  title:        string;
  url:          string;
  source:       string;
  published_at: string;
  summary:      string;
  sentiment:    'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null;
}

export interface NewsSearchResult {
  query:     string;
  hours:     number;
  total:     number;
  articles:  NewsArticle[];
  timestamp: string;
}

export interface NewsFeedResult {
  source:    string;
  total:     number;
  articles:  NewsArticle[];
  timestamp: string;
}

export interface IndiaMarketNewsResult {
  sources:   string[];
  total:     number;
  articles:  NewsArticle[];
  timestamp: string;
}

export const newsApi = {
  search: (q: string, hours = 24, tag = true) =>
    api.get<NewsSearchResult>(`/news/search?q=${encodeURIComponent(q)}&hours=${hours}&tag=${tag}`),

  feed: (source: 'et' | 'mc' | 'mint' | 'bs', tag = false) =>
    api.get<NewsFeedResult>(`/news/feed?source=${source}&tag=${tag}`),

  indiaMarket: (tag = false, limit = 30) =>
    api.get<IndiaMarketNewsResult>(`/news/india-market?tag=${tag}&limit=${limit}`),

  google: (q: string, hours = 6, tag = true) =>
    api.get<NewsSearchResult>(`/news/google?q=${encodeURIComponent(q)}&hours=${hours}&tag=${tag}`),
};

// ─── AI Intelligence — Phase 4 ───────────────────────────────────────────────

export interface SignalEntry {
  name: string;
  value: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  detail: string;
}

export interface SignalStack {
  signals: SignalEntry[];
  bullishCount: number;
  bearishCount: number;
  confidence: number;
  verdict: string;
}

function getSessionToken(): string {
  return localStorage.getItem('session_token') || '';
}

/**
 * Generic SSE streaming helper.
 * Calls the backend SSE endpoint and dispatches events:
 *   onToken(token)       — each streamed token
 *   onMeta(key, value)   — structured metadata (signal_stack, type events)
 *   onDone()             — stream finished
 *   onError(msg)         — error message from server or network
 */
export function streamSSE(
  path: string,
  body: unknown,
  options: {
    onToken: (token: string) => void;
    onMeta?: (key: string, value: unknown) => void;
    onDone: () => void;
    onError: (msg: string) => void;
    signal?: AbortSignal;
  },
): void {
  const { onToken, onMeta, onDone, onError, signal } = options;
  const url = BASE_URL + path;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-token': getSessionToken(),
    },
    body: JSON.stringify(body),
    signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        onError(err.error || `HTTP ${res.status}`);
        onDone();
        return;
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();

          if (data === '[DONE]') {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;

            if (parsed.error) {
              onError(parsed.error as string);
              continue;
            }
            if (parsed.token != null) {
              onToken(parsed.token as string);
              continue;
            }
            // Structured metadata events
            if (parsed.type && onMeta) {
              onMeta(parsed.type as string, (parsed as { data?: unknown }).data);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      onDone();
    })
    .catch((err: Error) => {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Connection error.');
      }
      onDone();
    });
}

export const aiApi = {
  chat: (
    message: string,
    history: Array<{ role: string; content: string }>,
    sessionId: string,
    options: Parameters<typeof streamSSE>[2],
  ) => streamSSE('/chat', { message, history, sessionId }, options),

  analyze: (
    ticker: string,
    options: Parameters<typeof streamSSE>[2],
  ) => streamSSE('/analyze', { ticker }, options),

  briefing: (options: Parameters<typeof streamSSE>[2]) =>
    streamSSE('/briefing', {}, options),

  macroAnalysis: (options: Parameters<typeof streamSSE>[2]) =>
    streamSSE('/macro-analysis', {}, options),

  sectorAnalysis: (
    sector: string,
    options: Parameters<typeof streamSSE>[2],
  ) => streamSSE('/sector-analysis', { sector }, options),

  chatHistory: (params?: { limit?: number; session_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit)      q.set('limit', String(params.limit));
    if (params?.session_id) q.set('session_id', params.session_id);
    return api.get<{ history: Array<{ id: number; session_id: string; role: string; content: string; created_at: string }> }>(
      `/chat-history${q.toString() ? '?' + q.toString() : ''}`,
    );
  },

  briefings: () =>
    api.get<{ briefings: Array<{ id: number; market_mood: string; fii_net_flow: string; generated_at: string }> }>('/briefings'),

  predictions: () =>
    api.get<{ predictions: unknown[] }>('/predictions'),
};

// ─── Watchlist — Phase 7 ──────────────────────────────────────────────────────

export interface WatchlistItem {
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

export const watchlistApi = {
  get:    () =>
    api.get<{ watchlist: WatchlistItem[] }>('/watchlist'),

  add:    (ticker: string) =>
    api.post<{ success: boolean; item: WatchlistItem }>('/watchlist', { ticker }),

  remove: (id: number) =>
    api.delete<{ success: boolean; removed: string }>(`/watchlist/${id}`),
};

// ─── Accuracy Tracker — Phase 7 ───────────────────────────────────────────────

export interface PredictionRow {
  id: number;
  ticker: string;
  company_name: string;
  verdict: string;
  confidence: number;
  signal_stack_score: number | null;
  reasoning: string | null;
  predicted_at: string;
  market_price_at_prediction: string | null;
  actual_close_price: string | null;
  actual_change_pct: string | null;
  was_correct: boolean | null;
  checked_at: string | null;
  accuracy_notes: string | null;
}

export interface AccuracyStats {
  all_time: {
    total_checked: string;
    hits: string;
    misses: string;
    accuracy_pct: string | null;
    total_predictions: string;
  };
  last_7_days:  { total_checked: string; hits: string; accuracy_pct: string | null };
  last_30_days: { total_checked: string; hits: string; accuracy_pct: string | null };
  by_verdict:   Array<{ verdict: string; checked: string; hits: string; accuracy_pct: string | null }>;
  by_ticker:    Array<{ ticker: string; company_name: string; checked: string; hits: string; accuracy_pct: string | null }>;
  trend:        Array<{ date: string; checked: string; hits: string; accuracy_pct: string | null }>;
  pending_checks: number;
}

export type AccuracyFilter = 'all' | 'hits' | 'misses' | 'pending';

export const accuracyApi = {
  predictions: (filter: AccuracyFilter = 'all', ticker?: string, limit = 100) => {
    const q = new URLSearchParams({ filter, limit: String(limit) });
    if (ticker) q.set('ticker', ticker.toUpperCase());
    return api.get<{ predictions: PredictionRow[]; total: number }>(`/accuracy/predictions?${q}`);
  },

  stats: () =>
    api.get<AccuracyStats>('/accuracy/stats'),

  checkOne: (predictionId: number) =>
    api.post<{ success: boolean; was_correct: boolean | null; actual_close: number; ticker: string }>(`/accuracy/check/${predictionId}`),

  runAll: () =>
    api.post<{ success: boolean; checked: number; hits: number; misses: number; errors: number }>('/accuracy/run'),
};

// ─── Push Notifications — Phase 7 ────────────────────────────────────────────

export const pushApi = {
  vapidKey: () =>
    api.get<{ publicKey: string }>('/push/vapid-key'),

  subscribe: (subscription: PushSubscriptionJSON) =>
    api.post<{ success: boolean }>('/push/subscribe', subscription),

  unsubscribe: (endpoint: string) =>
    api.delete<{ success: boolean }>('/push/unsubscribe'),

  test: () =>
    api.post<{ success: boolean; sent: number }>('/push/test'),
};

// ─── Events Calendar — Phase 8 ────────────────────────────────────────────────

export interface CalendarEvent {
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

export const eventsApi = {
  list: (from?: string, to?: string, type?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to)   q.set('to', to);
    if (type) q.set('type', type);
    return api.get<{ events: CalendarEvent[]; total: number }>(`/events${q.toString() ? '?' + q.toString() : ''}`);
  },
};

// ─── Preferences — Phase 8 ────────────────────────────────────────────────────

export interface UserPreferences {
  trading_style: 'intraday' | 'swing' | 'investing' | 'all';
  risk_appetite: 'conservative' | 'moderate' | 'aggressive';
  min_confidence: number;
  focus_sectors: string[] | null;
  notifications_enabled: boolean;
  briefing_auto: boolean;
}

export const preferencesApi = {
  get:    () => api.get<{ preferences: UserPreferences }>('/preferences'),
  update: (prefs: Partial<UserPreferences>) => api.put<{ preferences: UserPreferences; updated: boolean }>('/preferences', prefs),
};

// ─── History / Research Log — Phase 8 ────────────────────────────────────────

export const historyApi = {
  sessions: () =>
    api.get<{ sessions: Array<{ session_id: string; started_at: string; last_message_at: string; message_count: number; preview: string }> }>('/history/sessions'),

  session: (sid: string) =>
    api.get<{ messages: Array<{ id: number; role: string; content: string; created_at: string }>; session_id: string }>(`/history/session/${sid}`),

  briefings: (limit?: number) =>
    api.get<{ briefings: Array<{ id: number; market_mood: string; fii_net_flow: string; generated_at: string; preview: string; picks_count: number }> }>(`/history/briefings${limit ? '?limit=' + limit : ''}`),

  briefing: (id: number) =>
    api.get<{ briefing: { id: number; content: string; market_mood: string; fii_net_flow: string; generated_at: string; top_picks: string[] } }>(`/history/briefing/${id}`),

  analyses: (ticker?: string, limit?: number) => {
    const q = new URLSearchParams();
    if (ticker) q.set('ticker', ticker);
    if (limit)  q.set('limit', String(limit));
    return api.get<{ analyses: Array<{ id: number; ticker: string; company_name: string; verdict: string; confidence: number; signal_stack_score: number; market_price_at_prediction: string; timeframe: string; predicted_at: string; reasoning_preview: string }> }>(`/history/analyses${q.toString() ? '?' + q.toString() : ''}`);
  },

  search: (q: string) =>
    api.get<{ results: Array<{ source_type: string; id: number; session_id: string | null; role: string | null; created_at: string; excerpt: string; ticker: string | null }>; total: number; query: string }>(`/history/search?q=${encodeURIComponent(q)}`),
};

// ─── Auth extension — Phase 8 ─────────────────────────────────────────────────
export const authChangePin = (current_pin: string, new_pin: string) =>
  api.post<{ success: boolean; message: string }>('/auth/change-pin', { current_pin, new_pin });

// ─── Sentiment ────────────────────────────────────────────────────────────────

export interface RedditSentiment {
  ticker:        string;
  status:        'ok' | 'unavailable' | 'error';
  reason?:       string;
  mention_count: number;
  positive:      number;
  negative:      number;
  neutral:       number;
  net_sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  top_posts:     Array<{
    title:     string;
    text:      string;
    score:     number;
    url:       string;
    sub:       string;
    sentiment: string;
    created:   string;
  }>;
  timestamp: string;
}

export interface TwitterSentiment {
  query:         string;
  status:        'ok' | 'unavailable' | 'error';
  reason?:       string;
  tweet_count:   number;
  positive:      number;
  negative:      number;
  neutral:       number;
  net_sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  tweets:        Array<{
    text:      string;
    timestamp: string;
    source:    string;
    sentiment: string;
  }>;
  timestamp: string;
}

export interface YouTubeSentiment {
  ticker:  string;
  status:  'ok' | 'unavailable' | 'error';
  reason?: string;
  total:   number;
  videos:  Array<{
    title:        string;
    channel:      string;
    published_at: string;
    description:  string;
    url:          string;
    thumbnail:    string;
    sentiment:    string | null;
  }>;
  timestamp: string;
}

export interface TrendsSentiment {
  ticker:     string;
  days:       number;
  status:     'ok' | 'no_data' | 'error';
  direction?: 'rising' | 'falling' | 'stable';
  peak_score?: number;
  current?:   number;
  average?:   number;
  history?:   Array<{ date: string; value: number }>;
  timestamp:  string;
}

export const sentimentApi = {
  reddit:  (ticker: string) =>
    api.get<RedditSentiment>(`/sentiment/reddit?ticker=${encodeURIComponent(ticker)}`),

  twitter: (query: string) =>
    api.get<TwitterSentiment>(`/sentiment/twitter?query=${encodeURIComponent(query)}`),

  youtube: (ticker: string, limit = 5) =>
    api.get<YouTubeSentiment>(`/sentiment/youtube?ticker=${encodeURIComponent(ticker)}&limit=${limit}`),

  trends:  (ticker: string, days = 7) =>
    api.get<TrendsSentiment>(`/sentiment/trends?ticker=${encodeURIComponent(ticker)}&days=${days}`),

  aiTag:   (text: string, context = '') =>
    api.post<{ sentiment: string; model: string }>('/sentiment/ai-tag', { text, context }),
};
