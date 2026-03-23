'use client';

import { useDashboard, TabGroup } from '@/store/dashboard';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  BarChart3, Activity, Search, Shield, Wrench,
  ChevronDown
} from 'lucide-react';
import { GROUP_ACCENTS } from '@/config/theme';
import { alphaThemeColor } from '@/theme/chart';

interface TabDef { id: string; label: string }
interface GroupDef { id: TabGroup; label: string; icon: React.ReactNode; accent: string; tabs: TabDef[] }

const GROUPS: GroupDef[] = [
  {
    id: 'historical', label: 'Historical', accent: GROUP_ACCENTS.historical,
    icon: <BarChart3 size={12} />,
    tabs: [
      { id: 'events', label: 'Events' },
      { id: 'overlay', label: 'Overlay' },
      { id: 'cross-asset', label: 'Cross-Asset' },
      { id: 'heatmap', label: 'Heatmap' },
      { id: 'scatter', label: 'Scatter' },
      { id: 'vix', label: 'VIX' },
      { id: 'box', label: 'Box Plot' },
      { id: 'summary', label: 'Summary' },
      { id: 'stepin', label: 'Step-In' },
    ],
  },
  {
    id: 'live', label: 'Live Engine', accent: GROUP_ACCENTS.live,
    icon: <Activity size={12} />,
    tabs: [
      { id: 'l1-config', label: 'Config' },
      { id: 'l2-analogues', label: 'Analogues' },
      { id: 'l3-paths', label: 'Paths' },
      { id: 'l4-ideas', label: 'Trade Ideas' },
      { id: 'l5-detail', label: 'Detail' },
    ],
  },
  {
    id: 'analysis', label: 'Analysis', accent: GROUP_ACCENTS.analysis,
    icon: <Search size={12} />,
    tabs: [
      { id: 'l6-screener', label: 'Screener' },
      { id: 'l7-leadlag', label: 'Lead-Lag' },
      { id: 'l8-reverse', label: 'Reverse' },
      { id: 'l9-prepos', label: 'Pre-Position' },
      { id: 'l10-rotation', label: 'Rotation' },
    ],
  },
  {
    id: 'risk', label: 'Risk', accent: GROUP_ACCENTS.risk,
    icon: <Shield size={12} />,
    tabs: [
      { id: 'l11-stress', label: 'Stress Test' },
      { id: 'l12-decay', label: 'Decay' },
      { id: 'l14-confidence', label: 'Confidence' },
      { id: 'l15-oos', label: 'OOS' },
      { id: 'gate', label: 'Gate' },
    ],
  },
  {
    id: 'tools', label: 'Tools', accent: GROUP_ACCENTS.tools,
    icon: <Wrench size={12} />,
    tabs: [
      { id: 'correlation', label: 'Correlation' },
      { id: 'l13-memo', label: 'Memo' },
    ],
  },
];

export function TabBar() {
  const { activeGroup, activeTab, setActiveGroup, setActiveTab, horizon, setHorizon } = useDashboard();
  const [openDropdown, setOpenDropdown] = useState<TabGroup | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const group = GROUPS.find(g => g.id === activeGroup);
      if (!group) return;
      const tabIdx = group.tabs.findIndex(t => t.id === activeTab);

      if (e.key === 'ArrowRight' && tabIdx < group.tabs.length - 1) {
        setActiveTab(group.tabs[tabIdx + 1].id);
      } else if (e.key === 'ArrowLeft' && tabIdx > 0) {
        setActiveTab(group.tabs[tabIdx - 1].id);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [activeGroup, activeTab, setActiveTab]);

  const currentGroup = GROUPS.find(g => g.id === activeGroup);
  const currentTabs = currentGroup?.tabs || [];
  const accentColor = currentGroup?.accent || GROUP_ACCENTS.live;

  return (
    <div className="border-b border-border/50 bg-bg-chrome/90 backdrop-blur-sm shrink-0">
      {/* Group bar */}
      <div className="flex items-center px-1" ref={dropdownRef}>
        {GROUPS.map(group => {
          const isActive = activeGroup === group.id;
          return (
            <div key={group.id} className="relative">
              <button
                onClick={() => {
                  if (isActive) {
                    setOpenDropdown(openDropdown === group.id ? null : group.id);
                  } else {
                    setActiveGroup(group.id);
                    setActiveTab(group.tabs[0].id);
                    setOpenDropdown(null);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-2xs font-sans font-medium transition-all duration-200 relative
                  ${isActive
                    ? 'text-text-primary'
                    : 'text-text-dim hover:text-text-muted'
                  }`}
              >
                <span style={{ color: isActive ? group.accent : undefined }}>{group.icon}</span>
                <span className="hidden sm:inline">{group.label}</span>
                <ChevronDown size={9} className={`transition-transform duration-200 ${openDropdown === group.id ? 'rotate-180' : ''}`} />
                {isActive && (
                  <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ backgroundColor: group.accent }} />
                )}
              </button>

              {/* Dropdown */}
              {openDropdown === group.id && (
                <div className="absolute top-full left-0 mt-0.5 z-50 glass border border-border-bright/50 shadow-card min-w-[160px] animate-slide-down rounded-sm overflow-hidden">
                  {group.tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveGroup(group.id);
                        setActiveTab(tab.id);
                        setOpenDropdown(null);
                      }}
                    className={`block w-full text-left px-3 py-1.5 text-2xs font-sans transition-colors
                        ${activeTab === tab.id && activeGroup === group.id
                          ? 'bg-bg-hover text-text-primary'
                          : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover/50'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Horizon control */}
        <div className="ml-auto flex items-center gap-1.5 pr-2">
          <span className="text-3xs text-text-dim uppercase tracking-wider font-sans">H</span>
          <input
            type="number"
            value={horizon}
            onChange={(e) => setHorizon(Math.max(1, Math.min(252, parseInt(e.target.value) || 21)))}
            className="w-10 bg-bg-cell/80 border border-border/60 text-2xs text-center text-text-secondary font-mono
                       py-0.5 rounded-sm focus:outline-none transition-colors"
            style={{ boxShadow: 'none' }}
            min={1} max={252}
            aria-label="Forecast horizon in trading days"
          />
          <span className="text-3xs text-text-dim font-sans">d</span>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex items-center gap-0 px-1 bg-bg-primary/30 overflow-x-auto scrollbar-none">
        {currentTabs.map((tab, i) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-3 py-1.5 text-2xs font-sans transition-all duration-150 whitespace-nowrap
                ${isActive
                  ? 'text-text-primary font-medium'
                  : 'text-text-dim hover:text-text-muted font-normal'
                }`}
            >
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-1 right-1 h-px" style={{ backgroundColor: accentColor, opacity: 0.6 }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
