import { useState, useEffect, useCallback } from 'react';
import {
  marketApi, nseApi, macroApi,
  IndicesResponse, FiiDiiData, TopMoversData, MacroSnapshot,
} from '../lib/api';

// ─── Generic fetch hook ───────────────────────────────────────────────────────
function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  autoRefreshMs?: number,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
    if (autoRefreshMs) {
      const timer = setInterval(fetch, autoRefreshMs);
      return () => clearInterval(timer);
    }
  }, [fetch, autoRefreshMs]);

  return { data, loading, error, refetch: fetch };
}

// ─── Market Indices ───────────────────────────────────────────────────────────
export function useIndices(autoRefreshMs = 60_000) {
  return useFetch<IndicesResponse>(() => marketApi.indices(), [], autoRefreshMs);
}

// ─── Single quote ─────────────────────────────────────────────────────────────
export function useQuote(ticker: string, autoRefreshMs = 60_000) {
  return useFetch(
    () => marketApi.quote(ticker),
    [ticker],
    autoRefreshMs,
  );
}

// ─── OHLCV history ────────────────────────────────────────────────────────────
export function useHistory(ticker: string, period = '1mo', interval = '1d') {
  return useFetch(
    () => marketApi.history(ticker, period, interval),
    [ticker, period, interval],
  );
}

// ─── Intraday candles ─────────────────────────────────────────────────────────
export function useIntraday(ticker: string, interval = '15m') {
  return useFetch(
    () => marketApi.intraday(ticker, interval),
    [ticker, interval],
    300_000, // refresh every 5 min
  );
}

// ─── Fundamentals ─────────────────────────────────────────────────────────────
export function useFundamentals(ticker: string) {
  return useFetch(
    () => marketApi.fundamentals(ticker),
    [ticker],
  );
}

// ─── FII / DII ────────────────────────────────────────────────────────────────
export function useFiiDii(autoRefreshMs = 300_000) {
  return useFetch<FiiDiiData>(() => nseApi.fiiDii(), [], autoRefreshMs);
}

// ─── Top Movers ───────────────────────────────────────────────────────────────
export function useTopMovers(autoRefreshMs = 300_000) {
  return useFetch<TopMoversData>(() => nseApi.topMovers(), [], autoRefreshMs);
}

// ─── Macro Snapshot ───────────────────────────────────────────────────────────
export function useMacroSnapshot(autoRefreshMs = 300_000) {
  return useFetch<MacroSnapshot>(() => macroApi.snapshot(), [], autoRefreshMs);
}

// ─── Macro Forex ─────────────────────────────────────────────────────────────
export function useForex(autoRefreshMs = 300_000) {
  return useFetch(() => macroApi.forex(), [], autoRefreshMs);
}

// ─── Macro Commodities ────────────────────────────────────────────────────────
export function useCommodities(autoRefreshMs = 300_000) {
  return useFetch(() => macroApi.commodities(), [], autoRefreshMs);
}

// ─── Global Indices ───────────────────────────────────────────────────────────
export function useGlobalIndices(autoRefreshMs = 300_000) {
  return useFetch(() => macroApi.globalIndices(), [], autoRefreshMs);
}
