import React from 'react';
import { History as HistoryIcon } from 'lucide-react';

export default function History() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <HistoryIcon className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Research Log</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        All past chat sessions, morning briefings, and deep dive analyses with full-text search. Live in Phase 8.
      </p>
    </div>
  );
}
