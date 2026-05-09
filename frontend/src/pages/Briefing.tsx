import React from 'react';
import { Newspaper } from 'lucide-react';

export default function Briefing() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <Newspaper className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Morning Briefing</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        AI-generated morning briefing with global cues, SGX Nifty, top 10 stock picks,
        and sector focus will be live in Phase 6.
      </p>
    </div>
  );
}
