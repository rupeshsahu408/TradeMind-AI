import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Lock, Zap, TrendingUp, Bell,
  ChevronRight, CheckCircle, AlertCircle, Save, Eye, EyeOff,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Preferences {
  trading_style: 'intraday' | 'swing' | 'investing' | 'all';
  risk_appetite: 'conservative' | 'moderate' | 'aggressive';
  min_confidence: number;
  focus_sectors: string[] | null;
  notifications_enabled: boolean;
  briefing_auto: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} />;
}

function SectionCard({ icon: Icon, title, description, children }: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="trading-card">
      <div className="flex items-start gap-3 mb-5 pb-4 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-4 py-3 rounded-xl border text-sm',
      type === 'success' ? 'bg-bull/5 border-bull/20 text-bull' : 'bg-bear/5 border-bear/20 text-bear',
    )}>
      {type === 'success'
        ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
        : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
      {msg}
    </div>
  );
}

// ─── Security Section ─────────────────────────────────────────────────────────

function SecuritySection() {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin]         = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleChangePIN(e: React.FormEvent) {
    e.preventDefault();
    if (newPin !== confirmPin) { showToast('New PINs do not match.', 'error'); return; }
    if (newPin.length < 4)     { showToast('PIN must be at least 4 digits.', 'error'); return; }
    setLoading(true);
    try {
      await api.post('/auth/change-pin', { current_pin: currentPin, new_pin: newPin });
      showToast('PIN changed successfully.', 'success');
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Failed to change PIN.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard icon={Lock} title="Security" description="Change your PIN to protect access to Billionaire AI.">
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <form onSubmit={handleChangePIN} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Current PIN</label>
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter current PIN"
              className="w-full px-3 py-2.5 text-sm bg-accent/40 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 pr-10"
              required
            />
            <button type="button" onClick={() => setShowPin(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">New PIN (4–6 digits)</label>
          <input
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter new PIN"
            className="w-full px-3 py-2.5 text-sm bg-accent/40 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Confirm New PIN</label>
          <input
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            value={confirmPin}
            onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Confirm new PIN"
            className={cn(
              'w-full px-3 py-2.5 text-sm bg-accent/40 border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20',
              confirmPin && confirmPin !== newPin ? 'border-bear/50' : 'border-border focus:border-primary/40',
            )}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading || !currentPin || !newPin || !confirmPin}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <Lock className="w-4 h-4" />
          )}
          {loading ? 'Updating…' : 'Change PIN'}
        </button>
      </form>
    </SectionCard>
  );
}

// ─── AI Behavior Section ──────────────────────────────────────────────────────

const SECTORS = [
  'Banking & NBFC', 'IT & Technology', 'Pharmaceuticals', 'Automobile & Auto Ancillaries',
  'FMCG & Consumer', 'Metals & Mining', 'Energy & Power', 'Real Estate',
];

function PreferencesSection({ prefs, onSaved }: { prefs: Preferences; onSaved: (p: Preferences) => void }) {
  const [form, setForm]   = useState<Preferences>(prefs);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleSector(s: string) {
    const cur = form.focus_sectors || [];
    setForm(f => ({
      ...f,
      focus_sectors: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s],
    }));
  }

  async function save() {
    setLoading(true);
    try {
      const { preferences } = await api.put<{ preferences: Preferences }>('/preferences', {
        trading_style:         form.trading_style,
        risk_appetite:         form.risk_appetite,
        min_confidence:        form.min_confidence,
        focus_sectors:         form.focus_sectors,
        notifications_enabled: form.notifications_enabled,
        briefing_auto:         form.briefing_auto,
      });
      onSaved(preferences);
      showToast('Preferences saved.', 'success');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Failed to save preferences.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* AI Behavior */}
      <SectionCard icon={Zap} title="AI Behavior" description="Customize how the AI analyst behaves and what it prioritizes.">
        {toast && <Toast msg={toast.msg} type={toast.type} />}

        {/* Min confidence */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-foreground">Minimum Confidence Threshold</label>
            <span className="text-sm font-bold text-primary">{form.min_confidence}%</span>
          </div>
          <input
            type="range" min={40} max={90} step={5}
            value={form.min_confidence}
            onChange={e => setForm(f => ({ ...f, min_confidence: parseInt(e.target.value) }))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>40% — show speculative calls</span>
            <span>90% — high conviction only</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The AI will flag calls below this threshold. Currently: {
              form.min_confidence >= 90 ? 'High conviction only' :
              form.min_confidence >= 75 ? 'Strong signals required' :
              form.min_confidence >= 60 ? 'Moderate confidence (recommended)' : 'Show all signals including speculative'
            }.
          </p>
        </div>
      </SectionCard>

      {/* Trading Preferences */}
      <SectionCard icon={TrendingUp} title="Trading Preferences" description="Tell the AI how you trade so it can tailor its analysis and risk guidance.">
        {/* Trading style */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-2">Trading Style</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['intraday', 'swing', 'investing', 'all'] as const).map(s => (
              <button
                key={s}
                onClick={() => setForm(f => ({ ...f, trading_style: s }))}
                className={cn(
                  'py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-all',
                  form.trading_style === s
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
                )}
              >
                {s === 'all' ? 'All Styles' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {form.trading_style === 'intraday'  && 'AI will emphasize same-day momentum, level-to-level setups, and OI data.'}
            {form.trading_style === 'swing'     && 'AI will focus on 3–15 day setups, technical breakouts, and short-term catalysts.'}
            {form.trading_style === 'investing' && 'AI will emphasize fundamentals, valuation, promoter activity, and long-term trends.'}
            {form.trading_style === 'all'       && 'AI will cover all timeframes with balanced analysis.'}
          </p>
        </div>

        {/* Risk appetite */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-2">Risk Appetite</label>
          <div className="grid grid-cols-3 gap-2">
            {(['conservative', 'moderate', 'aggressive'] as const).map(r => (
              <button
                key={r}
                onClick={() => setForm(f => ({ ...f, risk_appetite: r }))}
                className={cn(
                  'py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-all',
                  form.risk_appetite === r
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
                )}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {form.risk_appetite === 'conservative' && 'AI will emphasize risk-reward ratio, stop-loss levels, and capital preservation.'}
            {form.risk_appetite === 'moderate'     && 'Balanced approach — AI weighs upside against realistic downside risks.'}
            {form.risk_appetite === 'aggressive'   && 'AI will highlight high-upside setups with higher volatility tolerance.'}
          </p>
        </div>

        {/* Focus sectors */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-2">
            Focus Sectors
            <span className="text-muted-foreground font-normal ml-1">(optional — select all that apply)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SECTORS.map(s => {
              const active = (form.focus_sectors || []).includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSector(s)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-all',
                    active
                      ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30',
                  )}
                >
                  {s.split(' & ')[0]}
                </button>
              );
            })}
          </div>
          {(form.focus_sectors || []).length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">No sectors selected — AI covers all sectors equally.</p>
          )}
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard icon={Bell} title="Notifications" description="Control which alerts reach you via browser push notifications.">
        <div className="space-y-3">
          {[
            { key: 'notifications_enabled', label: 'All Notifications', desc: 'Master switch for all push notifications.' },
            { key: 'briefing_auto', label: 'Auto Morning Briefing', desc: 'Generate and push a briefing automatically each morning.' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between py-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, [key]: !f[key as keyof Preferences] as boolean }))}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                  form[key as keyof Preferences] ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  form[key as keyof Preferences] ? 'translate-x-[22px]' : 'translate-x-0.5',
                )} />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Save button */}
      <button
        onClick={save}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {loading ? 'Saving…' : 'Save Preferences'}
      </button>
    </>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function SettingsPage() {
  const { language, setLanguage } = useAuth();
  const [prefs, setPrefs]     = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get<{ preferences: Preferences }>('/preferences')
      .then(d => setPrefs(d.preferences))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-5 space-y-5 max-w-2xl mx-auto pb-10">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Configure PIN, AI behavior, trading preferences, and notifications.</p>
      </div>

      {/* Security */}
      <SecuritySection />

      {/* Preferences */}
      {loading && (
        <div className="trading-card space-y-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-4 bg-bear/5 border border-bear/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-bear flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && prefs && (
        <PreferencesSection prefs={prefs} onSaved={setPrefs} />
      )}

      <p className="text-[10px] text-muted-foreground text-center pb-2">
        Billionaire AI — Personal use only. All data is stored locally in your Neon database.
      </p>
    </div>
  );
}
