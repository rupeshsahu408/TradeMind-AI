import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <SettingsIcon className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Settings</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        Change PIN, language preference, trading style, risk appetite, notification settings, and dashboard widgets. Live in Phase 8.
      </p>
    </div>
  );
}
