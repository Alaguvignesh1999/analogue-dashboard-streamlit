'use client';

import { Badge } from '@/components/ui/ChartCard';
import { LiveSeriesStateLike, getLiveDiagnosticsSummary } from '@/engine/live';

function coverageColor(ratio: number): 'green' | 'amber' | 'red' {
  if (ratio >= 0.75) return 'green';
  if (ratio >= 0.4) return 'amber';
  return 'red';
}

export function DiagnosticsStrip({
  live,
  labels,
  scoringMode,
  confidenceLabel,
  sharedAssetCount,
  extra,
}: {
  live: LiveSeriesStateLike;
  labels?: string[];
  scoringMode?: string;
  confidenceLabel?: string | null;
  sharedAssetCount?: number | null;
  extra?: React.ReactNode;
}) {
  const diagnostics = getLiveDiagnosticsSummary(live, labels);

  return (
    <div className="px-4 py-2.5 text-2xs border-b border-border/40 bg-bg-cell/20">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color="purple">Live D+{diagnostics.displayDayN}</Badge>
        {scoringMode && <Badge color="dim">Mode: {scoringMode}</Badge>}
        {sharedAssetCount !== null && sharedAssetCount !== undefined && (
          <Badge color="dim">Shared: {sharedAssetCount}</Badge>
        )}
        {confidenceLabel && <Badge color={confidenceLabel === 'high' ? 'green' : confidenceLabel === 'medium' ? 'amber' : 'red'}>{confidenceLabel}</Badge>}
        <Badge color={coverageColor(diagnostics.coverageRatio)}>
          Coverage {(diagnostics.coverageRatio * 100).toFixed(0)}%
        </Badge>
      </div>
      <div className="mt-2 text-text-dim flex items-center gap-4 flex-wrap">
        <span>Live date: {diagnostics.displayDate || diagnostics.effectiveDate || '--'}</span>
        <span>Assets: {diagnostics.availableAssetCount}/{diagnostics.requestedAssetCount}</span>
        {extra}
      </div>
    </div>
  );
}
