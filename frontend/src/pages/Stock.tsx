import React from 'react';
import { TrendingUp } from 'lucide-react';

export default function Stock() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <TrendingUp className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Stock Deep Dive</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        Full stock analysis with Signal Stack, RSI, MACD, fundamentals, news sentiment,
        and AI verdict will be live in Phase 6.
      </p>
    </div>
  );
}
