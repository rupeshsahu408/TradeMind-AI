import React from 'react';
import { MessageSquare } from 'lucide-react';

export default function Chat() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold text-foreground">AI Research Chat</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        Full streaming chat with NVIDIA gpt-oss-120b will be live in Phase 4.
        The AI will research 15+ sources and stream its analysis word-by-word.
      </p>
    </div>
  );
}
