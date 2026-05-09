import React, { useState, useRef } from 'react';
import {
  BarChart2, Zap, Square, AlertCircle, TrendingUp, TrendingDown,
  Building2, Cpu, Pill, Car, ShoppingBag, Factory, Zap as Energy, Home,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { aiApi } from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';

// ─── Sector definitions ───────────────────────────────────────────────────────

interface SectorDef {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
  keywords: string;
}

const SECTORS: SectorDef[] = [
  { id: 'Banking & NBFC',       label: 'Banking & NBFC', icon: Building2,  color: 'text-blue-400',   description: 'HDFC, ICICI, SBI, Bajaj Finance',        keywords: 'NIM, credit growth, NPA, RBI rate' },
  { id: 'IT & Technology',      label: 'IT & Tech',      icon: Cpu,         color: 'text-indigo-400', description: 'TCS, Infosys, Wipro, HCL',               keywords: 'USD/INR, US recession risk, deal wins' },
  { id: 'Pharmaceuticals',      label: 'Pharma',         icon: Pill,        color: 'text-green-400',  description: 'Sun Pharma, Dr Reddy\'s, Cipla, Divi\'s', keywords: 'USFDA, API prices, China+1 theme' },
  { id: 'Automobile & Auto Ancillaries', label: 'Auto',  icon: Car,         color: 'text-amber-400',  description: 'Maruti, M&M, Tata Motors, Bajaj Auto',   keywords: 'EV transition, crude, rural demand' },
  { id: 'FMCG & Consumer',      label: 'FMCG',           icon: ShoppingBag, color: 'text-orange-400', description: 'HUL, ITC, Nestle, Dabur',                 keywords: 'rural demand, monsoon, inflation' },
  { id: 'Metals & Mining',      label: 'Metals',         icon: Factory,     color: 'text-slate-400',  description: 'Tata Steel, JSW, Hindalco, NMDC',        keywords: 'China demand, iron ore, LME prices' },
  { id: 'Energy & Power',       label: 'Energy',         icon: Energy,      color: 'text-yellow-400', description: 'NTPC, Power Grid, Tata Power, Adani Green', keywords: 'crude prices, PLI, green energy capex' },
  { id: 'Real Estate',          label: 'Realty',         icon: Home,        color: 'text-pink-400',   description: 'DLF, Godrej Properties, Prestige, Brigade', keywords: 'RBI rates, inventory, launches' },
];

// ─── Sector selector card ─────────────────────────────────────────────────────

function SectorCard({
  sector, selected, onClick, disabled,
}: {
  sector: SectorDef;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = sector.icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-all',
        selected
          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
          : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('w-3.5 h-3.5', sector.color)} />
        <span className="text-xs font-semibold text-foreground">{sector.label}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">{sector.description}</p>
    </button>
  );
}

// ─── Working status ───────────────────────────────────────────────────────────

const STATUS_CYCLE = [
  'Reading FII sector flows...',
  'Checking macro conditions...',
  'Evaluating sector momentum...',
  'Identifying key catalysts...',
  'Preparing AI sector view...',
];

function StatusCycle({ active }: { active: boolean }) {
  const [idx, setIdx] = useState(0);
  React.useEffect(() => {
    if (!active) { setIdx(0); return; }
    const t = setInterval(() => setIdx(i => (i + 1) % STATUS_CYCLE.length), 1700);
    return () => clearInterval(t);
  }, [active]);
  if (!active) return null;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse flex-shrink-0" />
      <p className="text-xs text-muted-foreground animate-fade-in" key={idx}>{STATUS_CYCLE[idx]}</p>
    </div>
  );
}

// ─── Main Sectors Page ────────────────────────────────────────────────────────

export default function Sectors() {
  const [selectedSector, setSelectedSector] = useState<SectorDef | null>(null);
  const [content, setContent]   = useState('');
  const [fetching, setFetching] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError]       = useState('');
  const abortRef = useRef<AbortController | null>(null);

  function analyze(sector: SectorDef) {
    if (fetching || streaming) return;
    abortRef.current?.abort();

    setSelectedSector(sector);
    setContent('');
    setError('');
    setFetching(true);
    setStreaming(false);

    const abort = new AbortController();
    abortRef.current = abort;

    aiApi.sectorAnalysis(sector.id, {
      signal: abort.signal,

      onMeta: (key) => {
        if (key === 'fetching')     { setFetching(true);  setStreaming(false); }
        if (key === 'stream_start') { setFetching(false); setStreaming(true);  }
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

  const isActive = fetching || streaming;
  const SectorIcon = selectedSector?.icon || BarChart2;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">Sector Radar</h1>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            AI Analysis
          </span>
        </div>
        {isActive && (
          <button
            onClick={stop}
            className="flex items-center gap-1.5 text-xs text-bear px-3 py-1.5 rounded-md border border-bear/20 hover:bg-bear/5 transition-colors"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>
        )}
      </div>

      {/* ── Sector grid ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Select a sector for AI analysis
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SECTORS.map(s => (
            <SectorCard
              key={s.id}
              sector={s}
              selected={selectedSector?.id === s.id}
              onClick={() => analyze(s)}
              disabled={isActive}
            />
          ))}
        </div>
      </div>

      {/* ── Analysis area ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5">

        {/* Idle / empty state */}
        {!selectedSector && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <BarChart2 className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">Sector Intelligence</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Pick any sector above to get a live AI analysis covering outlook, key catalysts, stocks to watch, and rotation signals.
            </p>
          </div>
        )}

        {/* Active section */}
        {selectedSector && (
          <div className="max-w-3xl space-y-4">

            {/* Sector header */}
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0')}>
                <SectorIcon className={cn('w-4.5 h-4.5', selectedSector.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-foreground">{selectedSector.id}</h2>
                <p className="text-[10px] text-muted-foreground">{selectedSector.description}</p>
              </div>
              {streaming && (
                <span className="flex items-center gap-1.5 text-[10px] text-primary bg-primary/10 px-2.5 py-1 rounded-full flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Live
                </span>
              )}
              {!isActive && content && (
                <button
                  onClick={() => analyze(selectedSector)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-md border border-border hover:border-primary/40 transition-colors flex-shrink-0"
                >
                  <Zap className="w-3 h-3" />
                  Refresh
                </button>
              )}
            </div>

            {/* Status message while fetching */}
            {fetching && !content && (
              <div className="flex items-center justify-center py-12 flex-col gap-3">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
                <StatusCycle active={fetching} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-bear/20 bg-bear/5">
                <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-bear">Analysis failed</p>
                  <p className="text-xs text-muted-foreground">{error}</p>
                </div>
              </div>
            )}

            {/* Content */}
            {content && (
              <div className="bg-card border border-border rounded-xl p-5">
                <MarkdownRenderer content={content} streaming={streaming} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
