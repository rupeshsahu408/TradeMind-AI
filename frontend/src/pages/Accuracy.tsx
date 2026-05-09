import React from 'react';
import { Target } from 'lucide-react';

export default function Accuracy() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <Target className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Accuracy Tracker</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        Every prediction logged and checked post-market. Overall accuracy, hit/miss rates, and trend charts. Live in Phase 7.
      </p>
    </div>
  );
}
