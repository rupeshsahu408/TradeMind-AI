import React from 'react';
import { Globe } from 'lucide-react';

export default function Macro() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <Globe className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Macro Pulse</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        USD/INR, Crude Oil, Gold, US markets, and AI impact analysis on Indian sectors. Live in Phase 8.
      </p>
    </div>
  );
}
