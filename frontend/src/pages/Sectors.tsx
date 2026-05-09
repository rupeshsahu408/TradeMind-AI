import React from 'react';
import { BarChart2 } from 'lucide-react';

export default function Sectors() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <BarChart2 className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Sector Radar</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        Sector heat map, FII sector flows, and AI sector rotation signal. Live in Phase 8.
      </p>
    </div>
  );
}
