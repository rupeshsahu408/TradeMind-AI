import React from 'react';
import { TrendingUp, TrendingDown, Minus, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bull/10 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          <span className="text-xs text-bull font-medium">Market Open</span>
        </div>
      </div>

      {/* Indices bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { name: 'Nifty 50', value: '--', change: '--' },
          { name: 'Sensex', value: '--', change: '--' },
          { name: 'Bank Nifty', value: '--', change: '--' },
        ].map(idx => (
          <div key={idx.name} className="trading-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{idx.name}</p>
            <p className="text-lg font-semibold font-mono text-foreground">{idx.value}</p>
            <p className="text-xs text-muted-foreground">{idx.change}</p>
          </div>
        ))}
      </div>

      {/* Phase 2 notice */}
      <div className="trading-card border-dashed">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Phase 1 Complete — Foundation Ready</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live market data (Nifty, Sensex, FII/DII, news) loads in Phase 2. Database connected. AI connected in Phase 4.
            </p>
          </div>
        </div>
      </div>

      {/* Grid placeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="trading-card min-h-[120px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">FII/DII Activity — Phase 2</p>
        </div>
        <div className="trading-card min-h-[120px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Market Mood — Phase 4</p>
        </div>
        <div className="trading-card min-h-[120px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Top Conviction Calls — Phase 4</p>
        </div>
        <div className="trading-card min-h-[120px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Macro Snapshot — Phase 2</p>
        </div>
      </div>
    </div>
  );
}
