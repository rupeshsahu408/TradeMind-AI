import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toString();
}

export function formatChange(change: number): string {
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
}

export function getChangeColor(change: number): string {
  if (change > 0) return 'text-bull';
  if (change < 0) return 'text-bear';
  return 'text-muted-foreground';
}

export function getVerdictColor(verdict: string): string {
  switch (verdict) {
    case 'STRONG_BUY': return 'text-bull';
    case 'BUY': return 'text-bull';
    case 'HOLD': return 'text-neutral-signal';
    case 'AVOID': return 'text-bear';
    default: return 'text-muted-foreground';
  }
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return 'text-bull';
  if (confidence >= 75) return 'text-bull';
  if (confidence >= 60) return 'text-neutral-signal';
  if (confidence >= 40) return 'text-orange-400';
  return 'text-bear';
}
