import React from 'react';
import { Calendar } from 'lucide-react';

export default function CalendarPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <Calendar className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Event Calendar</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        RBI MPC dates, earnings calendar, US Fed meetings, NSE holidays, and AI pre-event analysis. Live in Phase 8.
      </p>
    </div>
  );
}
