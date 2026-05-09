import React from 'react';
import { Star } from 'lucide-react';

export default function Watchlist() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <Star className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Watchlist</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        Track your NSE stocks with live prices, sentiment pulse, and one-click deep dive.
        Live in Phase 7.
      </p>
    </div>
  );
}
