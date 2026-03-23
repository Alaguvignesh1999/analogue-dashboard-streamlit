'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/store/dashboard';
import { Zap, Settings, Wifi, WifiOff } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { THEME_COLORS } from '@/theme/chart';
import { getLiveDisplayDay } from '@/engine/live';

function badgeClasses(tone: 'teal' | 'amber' | 'red' | 'purple') {
  if (tone === 'teal') return 'bg-accent-teal/10 text-accent-teal border-accent-teal/20';
  if (tone === 'purple') return 'bg-accent-purple/10 text-accent-purple border-accent-purple/20';
  if (tone === 'red') return 'bg-down/10 text-down border-down/20';
  return 'bg-accent-amber/10 text-accent-amber border-accent-amber/20';
}

export function Header() {
  const { live, dataLoaded, lastUpdated, provenance } = useDashboard();
  const liveDisplayDay = getLiveDisplayDay(live);
  const hasLiveData = !!live.returns && Object.keys(live.returns).length > 0 && !!live.name;

  const historicalBadge = useMemo(() => {
    const label = provenance.historicalSource === 'sample' ? 'Sample historical' : 'Generated historical';
    const detail = provenance.historicalAsOf
      ? new Date(provenance.historicalAsOf).toLocaleDateString()
      : (lastUpdated || 'Unknown');
    return { label, detail, tone: 'amber' as const };
  }, [lastUpdated, provenance.historicalAsOf, provenance.historicalSource]);

  const liveBadge = useMemo(() => {
    if (provenance.liveSource === 'none') return null;
    if (provenance.liveSource === 'demo') {
      return {
        label: 'Demo live',
        detail: provenance.liveAsOf ? new Date(provenance.liveAsOf).toLocaleDateString() : 'Manual',
        tone: 'amber' as const,
      };
    }
    return {
      label: provenance.liveMode === 'shared' ? 'Shared live' : 'Private live',
      detail: provenance.liveSnapshotDate
        ? `snapshot ${new Date(provenance.liveSnapshotDate).toLocaleDateString()}`
        : (provenance.liveAsOf ? new Date(provenance.liveAsOf).toLocaleDateString() : 'Loaded'),
      tone: 'purple' as const,
    };
  }, [provenance.liveAsOf, provenance.liveMode, provenance.liveSnapshotDate, provenance.liveSource]);

  return (
    <header className="h-11 border-b border-border/60 bg-bg-chrome/95 flex items-center justify-between px-4 shrink-0 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Zap size={14} style={{ color: THEME_COLORS.uiAccent }} />
            <div className="absolute inset-0 blur-sm rounded-full" style={{ backgroundColor: THEME_COLORS.uiAccent, opacity: 0.15 }} />
          </div>
          <span className="text-xs font-semibold font-mono uppercase text-text-primary" style={{ letterSpacing: '0.12em' }}>
            Analogue
          </span>
          <span className="text-xs font-sans font-light tracking-wide text-text-muted">
            Engine
          </span>
        </div>
        <div className="w-px h-4 bg-border-bright/50" />
        <span className="text-2xs text-text-dim hidden sm:inline font-sans">
          Cross-Asset Event Dashboard
        </span>
      </div>

      <div className="flex items-center gap-3">
        {hasLiveData && (
          <div className="flex items-center gap-2 px-2.5 py-1 bg-live/5 border border-live/20 rounded-sm animate-fade-in">
            <div className="relative w-1.5 h-1.5">
              <div className="absolute inset-0 rounded-full bg-live" />
              <div className="absolute inset-0 rounded-full bg-live animate-ping opacity-60" />
            </div>
            <span className="text-2xs text-live font-medium font-mono tracking-[0.08em] uppercase">
              {live.name}
            </span>
            <span className="text-2xs text-live/60 font-mono">D+{liveDisplayDay}</span>
          </div>
        )}

        <ThemeToggle />

        <div className={`hidden lg:flex items-center gap-1.5 px-2 py-1 border rounded-sm text-2xs font-mono ${badgeClasses(historicalBadge.tone)}`}>
          <span>{historicalBadge.label}</span>
          <span className="opacity-70">{historicalBadge.detail}</span>
        </div>

        {liveBadge && (
          <div className={`hidden lg:flex items-center gap-1.5 px-2 py-1 border rounded-sm text-2xs font-mono ${badgeClasses(liveBadge.tone)}`}>
            <span>{liveBadge.label}</span>
            <span className="opacity-70">{liveBadge.detail}</span>
          </div>
        )}

        {provenance.warnings.length > 0 && (
          <div className={`hidden xl:flex items-center gap-1.5 px-2 py-1 border rounded-sm text-2xs font-mono ${badgeClasses('amber')}`}>
            <span>Warnings</span>
            <span className="opacity-70">{provenance.warnings.length}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-2xs font-sans">
          {dataLoaded ? (
            <Wifi size={10} className="text-up/60" />
          ) : (
            <WifiOff size={10} className="text-text-dim" />
          )}
          <span className="text-text-dim">
            {dataLoaded ? (lastUpdated || 'Ready') : 'Loading...'}
          </span>
        </div>

        <button className="p-1.5 hover:bg-bg-hover rounded-sm transition-colors group" aria-label="Settings">
          <Settings size={13} className="text-text-dim group-hover:text-text-muted transition-colors" />
        </button>
      </div>
    </header>
  );
}
