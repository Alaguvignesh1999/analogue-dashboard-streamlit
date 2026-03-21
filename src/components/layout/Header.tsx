'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/store/dashboard';
import { Zap, Settings, Wifi, WifiOff } from 'lucide-react';

function badgeClasses(tone: 'teal' | 'amber' | 'red') {
  if (tone === 'teal') return 'bg-accent-teal/10 text-accent-teal border-accent-teal/20';
  if (tone === 'red') return 'bg-down/10 text-down border-down/20';
  return 'bg-accent-amber/10 text-accent-amber border-accent-amber/20';
}

export function Header() {
  const { live, dataLoaded, lastUpdated, provenance } = useDashboard();

  const historicalBadge = useMemo(() => {
    const label = provenance.historicalSource === 'sample' ? 'Sample historical' : 'Generated historical';
    const detail = provenance.historicalAsOf
      ? new Date(provenance.historicalAsOf).toLocaleDateString()
      : (lastUpdated || 'Unknown');
    return { label, detail, tone: provenance.historicalSource === 'sample' ? 'amber' as const : 'teal' as const };
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
      label: 'Live data',
      detail: provenance.liveAsOf ? new Date(provenance.liveAsOf).toLocaleDateString() : 'Loaded',
      tone: 'teal' as const,
    };
  }, [provenance.liveAsOf, provenance.liveSource]);

  return (
    <header className="h-11 border-b border-border/60 bg-bg-panel/95 flex items-center justify-between px-4 shrink-0 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Zap size={14} className="text-accent-teal" />
            <div className="absolute inset-0 blur-sm bg-accent-teal/20 rounded-full" />
          </div>
          <span className="text-xs font-bold tracking-widest text-text-primary uppercase">
            Analogue
          </span>
          <span className="text-xs font-light tracking-wider text-text-muted">
            Engine
          </span>
        </div>
        <div className="w-px h-4 bg-border-bright/50" />
        <span className="text-2xs text-text-dim hidden sm:inline">
          Cross-Asset Event Dashboard
        </span>
      </div>

      <div className="flex items-center gap-3">
        {live.dayN !== null && (
          <div className="flex items-center gap-2 px-2.5 py-1 bg-live/5 border border-live/20 rounded-sm animate-fade-in">
            <div className="relative w-1.5 h-1.5">
              <div className="absolute inset-0 rounded-full bg-live" />
              <div className="absolute inset-0 rounded-full bg-live animate-ping opacity-60" />
            </div>
            <span className="text-2xs text-live font-semibold tracking-wide">
              {live.name}
            </span>
            <span className="text-2xs text-live/60">D+{live.dayN}</span>
          </div>
        )}

        <div className={`hidden lg:flex items-center gap-1.5 px-2 py-1 border rounded-sm text-2xs ${badgeClasses(historicalBadge.tone)}`}>
          <span>{historicalBadge.label}</span>
          <span className="opacity-70">{historicalBadge.detail}</span>
        </div>

        {liveBadge && (
          <div className={`hidden lg:flex items-center gap-1.5 px-2 py-1 border rounded-sm text-2xs ${badgeClasses(liveBadge.tone)}`}>
            <span>{liveBadge.label}</span>
            <span className="opacity-70">{liveBadge.detail}</span>
          </div>
        )}

        {provenance.warnings.length > 0 && (
          <div className={`hidden xl:flex items-center gap-1.5 px-2 py-1 border rounded-sm text-2xs ${badgeClasses('amber')}`}>
            <span>Warnings</span>
            <span className="opacity-70">{provenance.warnings.length}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-2xs">
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
