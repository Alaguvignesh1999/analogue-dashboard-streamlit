'use client';

import { useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { TabBar } from '@/components/layout/TabBar';
import { CardErrorBoundary } from '@/components/ui/ChartCard';
import { useDashboard } from '@/store/dashboard';
import { useDataLoader } from '@/hooks/useData';
import { alphaThemeColor, THEME_COLORS } from '@/theme/chart';

// Historical tabs
import { EventsTab } from '@/components/tabs/historical/EventsTab';
import { OverlayTab } from '@/components/tabs/historical/OverlayTab';
import { CrossAssetTab } from '@/components/tabs/historical/CrossAssetTab';
import { HeatmapTab } from '@/components/tabs/historical/HeatmapTab';
import { ScatterTab } from '@/components/tabs/historical/ScatterTab';
import { VixTab } from '@/components/tabs/historical/VixTab';
import { BoxTab } from '@/components/tabs/historical/BoxTab';
import { SummaryTab } from '@/components/tabs/historical/SummaryTab';
import { StepInTab } from '@/components/tabs/historical/StepInTab';
// Live tabs
import { LiveConfigTab } from '@/components/tabs/live/LiveConfigTab';
import { AnaloguesTab } from '@/components/tabs/live/AnaloguesTab';
import { PathsTab } from '@/components/tabs/live/PathsTab';
import { TradeIdeasTab } from '@/components/tabs/live/TradeIdeasTab';
import { DetailTab } from '@/components/tabs/live/DetailTab';
// Analysis tabs
import { ScreenerTab } from '@/components/tabs/analysis/ScreenerTab';
import { LeadLagTab } from '@/components/tabs/analysis/LeadLagTab';
import { ReverseTab } from '@/components/tabs/analysis/ReverseTab';
import { PrePosTab } from '@/components/tabs/analysis/PrePosTab';
import { RotationTab } from '@/components/tabs/analysis/RotationTab';
// Risk tabs
import { StressTab } from '@/components/tabs/risk/StressTab';
import { DecayTab } from '@/components/tabs/risk/DecayTab';
import { ConfidenceTab } from '@/components/tabs/risk/ConfidenceTab';
import { OosTab } from '@/components/tabs/risk/OosTab';
import { GateTab } from '@/components/tabs/risk/GateTab';
// Tools tabs
import { CorrelationTab } from '@/components/tabs/tools/CorrelationTab';
import { MemoTab } from '@/components/tabs/tools/MemoTab';

const TAB_MAP: Record<string, React.ComponentType> = {
  // Historical
  'events': EventsTab,
  'overlay': OverlayTab,
  'cross-asset': CrossAssetTab,
  'heatmap': HeatmapTab,
  'scatter': ScatterTab,
  'vix': VixTab,
  'box': BoxTab,
  'summary': SummaryTab,
  'stepin': StepInTab,
  // Live Engine
  'l1-config': LiveConfigTab,
  'l2-analogues': AnaloguesTab,
  'l3-paths': PathsTab,
  'l4-ideas': TradeIdeasTab,
  'l5-detail': DetailTab,
  // Analysis
  'l6-screener': ScreenerTab,
  'l7-leadlag': LeadLagTab,
  'l8-reverse': ReverseTab,
  'l9-prepos': PrePosTab,
  'l10-rotation': RotationTab,
  // Risk
  'l11-stress': StressTab,
  'l12-decay': DecayTab,
  'l14-confidence': ConfidenceTab,
  'l15-oos': OosTab,
  'gate': GateTab,
  // Tools
  'correlation': CorrelationTab,
  'l13-memo': MemoTab,
};

function LoadingScreen() {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-5 bg-bg-primary">
      <div className="relative">
        <div className="w-10 h-10 rounded-full" style={{ border: `2px solid ${alphaThemeColor('uiAccent', '0.14')}` }} />
        <div className="absolute inset-0 w-10 h-10 border-2 border-transparent rounded-full animate-spin" style={{ borderTopColor: THEME_COLORS.uiAccent }} />
      </div>
      <div className="text-center space-y-1.5">
        <div className="text-xs text-text-secondary font-medium tracking-wide">Loading Analogue Engine</div>
        <p className="text-2xs text-text-dim max-w-xs">
          Decompressing event returns for 130+ assets across 13 historical events
        </p>
      </div>
      {/* Shimmer progress bar */}
      <div className="w-48 h-0.5 bg-border/50 overflow-hidden rounded-full">
        <div className="h-full shimmer rounded-full" style={{ width: '60%', backgroundColor: alphaThemeColor('uiAccent', '0.35') }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  useDataLoader();
  const { isLoading, activeTab } = useDashboard();

  if (isLoading) return <LoadingScreen />;

  const ActiveComponent = TAB_MAP[activeTab];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-primary theme-transition">
      <Header />
      <TabBar />
      <main className="flex-1 overflow-y-auto">
        <CardErrorBoundary>
          {ActiveComponent ? (
            <div key={activeTab} className="animate-fade-in">
              <ActiveComponent />
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-text-dim text-xs">
              Tab not found: {activeTab}
            </div>
          )}
        </CardErrorBoundary>
      </main>
    </div>
  );
}
