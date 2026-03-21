'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select } from '@/components/ui/ChartCard';
import { displayLabel } from '@/engine/returns';
import { CUSTOM_GROUPS } from '@/config/assets';
import { corrcoef } from '@/lib/math';

function corrColor(r: number): string {
  if (isNaN(r)) return 'transparent';
  const abs = Math.min(Math.abs(r), 1);
  const alpha = 0.2 + abs * 0.55;
  // Blue for positive, red for negative
  return r > 0
    ? `rgba(34, 197, 94, ${alpha.toFixed(2)})`
    : `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
}

export function CorrelationTab() {
  const { eventReturns, assetMeta, events, activeEvents } = useDashboard();
  const [group, setGroup] = useState(Object.keys(CUSTOM_GROUPS)[0] || 'Equities');

  const activeEventNames = useMemo(() =>
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]
  );

  const labels = useMemo(() => CUSTOM_GROUPS[group] || [], [group]);

  // Build return vectors per asset: concatenate returns across all active events and offsets
  const matrix = useMemo(() => {
    if (labels.length === 0 || activeEventNames.length === 0) return [];

    // For each asset, collect all returns across events (use a fixed set of offsets 0..20)
    const vectors: Record<string, number[]> = {};
    for (const lbl of labels) {
      const vals: number[] = [];
      for (const en of activeEventNames) {
        const evtData = eventReturns[lbl]?.[en];
        if (!evtData) continue;
        // Use offsets 0-20 as features
        for (let d = 0; d <= 20; d++) {
          vals.push(evtData[d] ?? 0);
        }
      }
      vectors[lbl] = vals;
    }

    // Pairwise correlation
    const rows: { assetA: string; assetB: string; corr: number }[][] = [];
    for (const a of labels) {
      const row: { assetA: string; assetB: string; corr: number }[] = [];
      for (const b of labels) {
        const va = vectors[a] || [];
        const vb = vectors[b] || [];
        const minLen = Math.min(va.length, vb.length);
        const corr = minLen > 2 ? corrcoef(va.slice(0, minLen), vb.slice(0, minLen)) : NaN;
        row.push({ assetA: a, assetB: b, corr });
      }
      rows.push(row);
    }
    return rows;
  }, [labels, activeEventNames, eventReturns]);

  const groupOptions = useMemo(() =>
    Object.keys(CUSTOM_GROUPS).sort().map(g => ({ value: g, label: g })),
    []
  );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Correlation Matrix"
        subtitle={`${labels.length} assets · ${activeEventNames.length} events`}
        controls={
          <Select label="" value={group} onChange={setGroup} options={groupOptions} />
        }
      >
        {labels.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-text-dim text-xs">
            No assets in group
          </div>
        ) : (
          <div className="overflow-x-auto p-4">
            <div className="inline-block border border-border/40 rounded-sm">
              {/* Header Row */}
              <div className="flex">
                <div className="w-20 h-14 border-r border-b border-border/30 bg-bg-cell/50 flex items-center justify-center" />
                {labels.map(lbl => (
                  <div
                    key={lbl}
                    className="w-14 h-14 flex items-center justify-center border-r border-b border-border/30 bg-bg-cell/30 text-[7px] font-mono text-text-muted text-center px-0.5 leading-tight font-medium"
                  >
                    {displayLabel(assetMeta[lbl], lbl).slice(0, 12)}
                  </div>
                ))}
              </div>
              {/* Data Rows */}
              {matrix.map((row, i) => (
                <div key={labels[i]} className="flex">
                  <div className="w-20 h-14 border-r border-b border-border/30 bg-bg-cell/30 flex items-center justify-center text-[7px] font-mono text-text-muted text-center px-1 leading-tight font-medium">
                    {displayLabel(assetMeta[labels[i]], labels[i]).slice(0, 16)}
                  </div>
                  {row.map(cell => (
                    <div
                      key={`${cell.assetA}-${cell.assetB}`}
                      className="w-14 h-14 flex items-center justify-center border-r border-b border-border/30 text-[8px] font-mono font-semibold text-text-primary cursor-help transition-all hover:scale-105"
                      style={{ backgroundColor: corrColor(cell.corr) }}
                      title={`${displayLabel(assetMeta[cell.assetA], cell.assetA)} vs ${displayLabel(assetMeta[cell.assetB], cell.assetB)}: ${isNaN(cell.corr) ? 'N/A' : cell.corr.toFixed(3)}`}
                    >
                      {isNaN(cell.corr) ? '—' : cell.corr.toFixed(2)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 py-3 border-t border-border/30 bg-bg-cell/20">
          <div className="flex items-center gap-2 text-2xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: corrColor(1) }} />
            <span className="text-text-muted">+1.0</span>
          </div>
          <div className="flex items-center gap-2 text-2xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: corrColor(0.5) }} />
            <span className="text-text-muted">+0.5</span>
          </div>
          <div className="flex items-center gap-2 text-2xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: corrColor(0) }} />
            <span className="text-text-muted">0.0</span>
          </div>
          <div className="flex items-center gap-2 text-2xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: corrColor(-0.5) }} />
            <span className="text-text-muted">−0.5</span>
          </div>
          <div className="flex items-center gap-2 text-2xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: corrColor(-1) }} />
            <span className="text-text-muted">−1.0</span>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
