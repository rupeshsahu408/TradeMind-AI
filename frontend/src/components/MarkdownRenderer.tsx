import React from 'react';
import { cn } from '../lib/utils';

interface Props {
  content: string;
  className?: string;
  streaming?: boolean;
}

/**
 * Lightweight markdown renderer — no external dependencies.
 * Handles: bold, italic, headers (h2/h3), bullet lists, inline code, code blocks, hr, paragraphs.
 */
export default function MarkdownRenderer({ content, className, streaming = false }: Props) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="list-none space-y-1 my-2">
        {listBuffer.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            <span>{inlineRender(item)}</span>
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  function inlineRender(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    // Pattern: **bold**, *italic*, `code`
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(<strong key={match.index} className="font-semibold text-foreground">{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(<em key={match.index} className="italic">{match[3]}</em>);
      } else if (match[4]) {
        parts.push(
          <code key={match.index} className="px-1.5 py-0.5 rounded text-xs bg-secondary font-mono text-primary">
            {match[4]}
          </code>,
        );
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts.length === 1 ? parts[0] : parts;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={`hr-${i}`} className="border-border my-3" />);
      i++;
      continue;
    }

    // H2
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${i}`} className="text-sm font-semibold text-foreground mt-4 mb-1.5 tracking-tight">
          {inlineRender(trimmed.slice(3))}
        </h2>,
      );
      i++;
      continue;
    }

    // H3
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className="text-xs font-semibold text-foreground/80 mt-3 mb-1 uppercase tracking-wider">
          {inlineRender(trimmed.slice(4))}
        </h3>,
      );
      i++;
      continue;
    }

    // H1 (treat as h2)
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={`h1-${i}`} className="text-base font-bold text-foreground mt-4 mb-2 tracking-tight">
          {inlineRender(trimmed.slice(2))}
        </h2>,
      );
      i++;
      continue;
    }

    // Bullet list items (-, *, •)
    if (/^[-*•] /.test(trimmed)) {
      listBuffer.push(trimmed.slice(2));
      i++;
      continue;
    }

    // Numbered list (1. 2. etc)
    if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        elements.push(
          <div key={`num-${i}`} className="flex items-start gap-2 text-sm text-foreground leading-relaxed my-0.5">
            <span className="font-mono text-primary text-xs font-semibold mt-0.5 w-5 flex-shrink-0">{numMatch[1]}.</span>
            <span>{inlineRender(numMatch[2])}</span>
          </div>,
        );
      }
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      flushList();
      const lang = trimmed.slice(3);
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={`code-${i}`} className="my-2 p-3 rounded-md bg-secondary text-xs font-mono text-foreground overflow-x-auto">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      i++;
      continue;
    }

    // Empty line
    if (!trimmed) {
      flushList();
      i++;
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="text-sm text-foreground leading-relaxed my-1">
        {inlineRender(trimmed)}
      </p>,
    );
    i++;
  }

  flushList();

  return (
    <div className={cn('markdown-content', className)}>
      {elements}
      {streaming && (
        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  );
}
