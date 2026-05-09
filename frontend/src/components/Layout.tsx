import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import {
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  Newspaper,
  Star,
  BarChart2,
  Globe,
  Target,
  Calendar,
  History,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  Languages,
  Zap,
} from 'lucide-react';

const navItems = [
  { label: 'Command Center',  href: '/',          icon: LayoutDashboard },
  { label: 'AI Research Chat', href: '/chat',      icon: MessageSquare },
  { label: 'Stock Deep Dive', href: '/stock',      icon: TrendingUp },
  { label: 'Morning Briefing',href: '/briefing',   icon: Newspaper },
  { label: 'Watchlist',       href: '/watchlist',  icon: Star },
  { label: 'Sector Radar',    href: '/sectors',    icon: BarChart2 },
  { label: 'Macro Pulse',     href: '/macro',      icon: Globe },
  { label: 'Accuracy Tracker',href: '/accuracy',   icon: Target },
  { label: 'Event Calendar',  href: '/calendar',   icon: Calendar },
  { label: 'Research Log',    href: '/history',    icon: History },
  { label: 'Settings',        href: '/settings',   icon: Settings },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { logout, language, setLanguage } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isHindi = language === 'hindi';

  function toggleLanguage() {
    setLanguage(isHindi ? 'english' : 'hindi');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-60 flex flex-col bg-card border-r border-border transition-transform duration-200',
          'lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground tracking-tight">Billionaire AI</p>
            <p className="text-[10px] text-muted-foreground leading-none">NSE/BSE Research</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2">
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive = location === href || (href !== '/' && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <a
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="border-t border-border p-3 space-y-1">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors',
              isHindi
                ? 'bg-primary/10 text-primary hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
            title={isHindi ? 'Switch to English' : 'हिंदी में बदलें'}
          >
            <Languages className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">{isHindi ? 'हिंदी मोड' : 'Language'}</span>
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono',
              isHindi ? 'bg-primary/20 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border',
            )}>
              {isHindi ? 'HI' : 'EN'}
            </span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-bear hover:bg-bear/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile only) */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden bg-card">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-foreground flex-1">Billionaire AI</span>
          {/* Language indicator on mobile */}
          <button
            onClick={toggleLanguage}
            className={cn(
              'text-[10px] font-bold px-2 py-1 rounded border font-mono transition-colors',
              isHindi
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'text-muted-foreground border-border hover:bg-accent',
            )}
          >
            {isHindi ? 'HI' : 'EN'}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>

        {/* Disclaimer */}
        <div className="px-4 py-1.5 border-t border-border bg-card">
          <p className="text-[10px] text-muted-foreground text-center">
            For informational purposes only. Not financial advice. Data may be delayed.
          </p>
        </div>
      </div>
    </div>
  );
}
