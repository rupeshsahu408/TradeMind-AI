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

export const nseApi = {
  fiiDii:       ()               => api.get<FiiDiiData>('/nse/fii-dii'),
  options:      (ticker: string) => api.get(`/nse/options?ticker=${encodeURIComponent(ticker)}`),
  topMovers:    ()               => api.get<TopMoversData>('/nse/top-movers'),
  circuitStocks:()               => api.get('/nse/circuit-stocks'),
};

// ─── Technical ────────────────────────────────────────────────────────────────
export const technicalApi = {
  rsi:       (ticker: string, interval = 'daily', period = 14) =>
    api.get(`/technical/rsi?ticker=${encodeURIComponent(ticker)}&interval=${interval}&period=${period}`),
  macd:      (ticker: string, interval = 'daily') =>
    api.get(`/technical/macd?ticker=${encodeURIComponent(ticker)}&interval=${interval}`),
  bollinger: (ticker: string, interval = 'daily', period = 20) =>
    api.get(`/technical/bollinger?ticker=${encodeURIComponent(ticker)}&interval=${interval}&period=${period}`),
  ema:       (ticker: string, interval = 'daily', period = 20) =>
    api.get(`/technical/ema?ticker=${encodeURIComponent(ticker)}&interval=${interval}&period=${period}`),
  summary:   (ticker: string) =>
    api.get(`/technical/summary?ticker=${encodeURIComponent(ticker)}`),
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
