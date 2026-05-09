import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../lib/api';
import { Zap, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';

type Mode = 'loading' | 'setup' | 'verify';

export default function Login() {
  const { login, isSetup } = useAuth();
  const [mode, setMode] = useState<Mode>('loading');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMode(isSetup ? 'verify' : 'setup');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [isSetup]);

  function handlePinInput(value: string) {
    if (!/^\d*$/.test(value)) return;
    if (value.length > 6) return;
    setPin(value);
    setError('');
  }

  function handleConfirmInput(value: string) {
    if (!/^\d*$/.test(value)) return;
    if (value.length > 6) return;
    setConfirmPin(value);
    setError('');
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4) return setError('PIN must be at least 4 digits.');
    if (pin !== confirmPin) return setError('PINs do not match.');
    setIsSubmitting(true);
    try {
      const data = await authApi.setup(pin, 'english', 'dark');
      login(data.token, data.userId, data.language, data.theme);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return setError('Please enter your PIN.');
    setIsSubmitting(true);
    try {
      const data = await authApi.verify(pin);
      login(data.token, data.userId, data.language, data.theme);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect PIN.');
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (mode === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 mb-4">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Billionaire AI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Research like a hedge fund. Trade like a billionaire.
          </p>
        </div>

        {/* Card */}
        <div className="trading-card">
          <h2 className="text-base font-semibold text-foreground mb-1">
            {mode === 'setup' ? 'Create your PIN' : 'Enter your PIN'}
          </h2>
          <p className="text-xs text-muted-foreground mb-6">
            {mode === 'setup'
              ? 'Set a 4–6 digit PIN to secure your trading assistant.'
              : 'Enter your PIN to access your trading assistant.'}
          </p>

          <form onSubmit={mode === 'setup' ? handleSetup : handleVerify} className="space-y-4">
            {/* PIN dots display */}
            <div className="flex justify-center gap-3 mb-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-3 h-3 rounded-full border-2 transition-all duration-150',
                    i < pin.length
                      ? 'bg-primary border-primary'
                      : 'bg-transparent border-border'
                  )}
                />
              ))}
            </div>

            {/* Hidden actual input */}
            <div className="relative">
              <input
                ref={inputRef}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={e => handlePinInput(e.target.value)}
                placeholder="Enter PIN"
                className={cn(
                  'w-full bg-input border border-border rounded-md px-4 py-3 text-center text-lg font-mono tracking-[0.5em] text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  'placeholder:tracking-normal placeholder:text-sm placeholder:font-sans placeholder:text-muted-foreground',
                  error && 'border-destructive focus:ring-destructive'
                )}
                autoComplete="off"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {mode === 'setup' && (
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                value={confirmPin}
                onChange={e => handleConfirmInput(e.target.value)}
                placeholder="Confirm PIN"
                className={cn(
                  'w-full bg-input border border-border rounded-md px-4 py-3 text-center text-lg font-mono tracking-[0.5em] text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  'placeholder:tracking-normal placeholder:text-sm placeholder:font-sans placeholder:text-muted-foreground',
                  error && 'border-destructive focus:ring-destructive'
                )}
                autoComplete="off"
                disabled={isSubmitting}
              />
            )}

            {error && (
              <p className="text-xs text-destructive text-center animate-fade-in">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !pin || (mode === 'setup' && !confirmPin)}
              className={cn(
                'w-full py-3 rounded-md text-sm font-medium transition-all duration-200',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
              )}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  {mode === 'setup' ? 'Setting up...' : 'Verifying...'}
                </span>
              ) : (
                mode === 'setup' ? 'Set PIN & Enter' : 'Enter'
              )}
            </button>
          </form>
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-6">
          Personal use only. All data is stored locally. Not financial advice.
        </p>
      </div>
    </div>
  );
}
