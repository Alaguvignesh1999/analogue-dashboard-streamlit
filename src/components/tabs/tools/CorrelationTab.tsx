'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl } from '@/components/ui/ChartCard';
import { displayLabel, poiRet } from '@/engine/returns';
import { CUSTOM_GROUPS } from '@/config/assets';
import { corrcoef } from '@/lib/math';

function corrColor(value: number): string {
  if (Number.isNaN(value)) return 'transparent';
  const abs = Math.min(Math.abs(value), 1);
  const alpha = 0.2 + abs * 0.55;
  return value >= 0
    ? `rgba(34, 197, 94, ${alpha.toFixed(2)})`
    : `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
}

interface CorrelationCell {
  assetA: string;
  assetB: string;
  corr: number;
  overlap: number;
}

export function CorrelationTab() {
  const { eventReturns, assetMeta, events, activeEvents } = useDashboard();
  const [group, setGroup] = useState(Object.keys(CUSTOM_GROUPS)[0] || 'Equities');
  const [maxOffset, setMaxOffset] = useState(21);
  const [minOverlap, setMinOverlap] = useState(10);

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [events, activeEvents],
  );

  const labels = useMemo(
    () => (CUSTOM_GROUPS[group] || []).filter((label) => assetMeta[label]),
    [assetMeta, group],
  );

  const matrix = useMemo(() => {
    if (labels.length === 0 || activeEventNames.length === 0) return [] as CorrelationCell[][];

    const rows: CorrelationCell[][] = [];
    for (const assetA of labels) {
      const row: CorrelationCell[] = [];
      for (const assetB of labels) {
        const vectorA: number[] = [];
        const vectorB: number[] = [];

        for (const eventName of activeEventNames) {
          for (let offset = 0; offset <= maxOffset; offset += 1) {
            const valueA = poiRet(eventReturns, assetA, eventName, offset);
            const valueB = poiRet(eventReturns, assetB, eventName, offset);
            if (Number.isNaN(valueA) || Number.isNaN(valueB)) continue;
            vectorA.push(valueA);
            vectorB.push(valueB);
          }
        }

        const overlap = Math.min(vectorA.length, vectorB.length);
        const corr = overlap >= minOverlap ? corrcoef(vectorA, vectorB) : Number.NaN;
        row.push({ assetA, assetB, corr, overlap });
      }
      rows.push(row);
    }
    return rows;
  }, [activeEventNames, eventReturns, labels, maxOffset, minOverlap]);

  const groupOptions = useMemo(
    () => Object.keys(CUSTOM_GROUPS).sort().map((groupName) => ({ value: groupName, label: groupName })),
    [],
  );

  const validCellCount = useMemo(
    () => matrix.flat().filter((cell) => !Number.isNaN(cell.corr)).length,
    [matrix],
  );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Correlation Matrix"
        subtitle={`${labels.length} assets | ${activeEventNames.length} events | ${validCellCount} valid pairwise cells`}
        controls={<Select label="Group" value={group} onChange={setGroup} options={groupOptions} />}
      >
        <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
          Correlations are built only from overlapping valid historical observations across the active event set and the selected post-event window. Missing values are ignored, not zero-filled, so blank cells mean insufficient overlap rather than fake neutrality.
        </div>

        <div className="px-4 py-2 flex gap-4 border-b border-border/40 flex-wrap">
          <SliderControl label="Window" value={maxOffset} onChange={setMaxOffset} min={5} max={63} step={1} suffix="D" />
          <SliderControl label="Min Overlap" value={minOverlap} onChange={setMinOverlap} min={3} max={50} step={1} />
        </div>

        {labels.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-text-dim text-xs">
            No assets available in this group.
          </div>
        ) : (
          <div className="overflow-x-auto p-4">
            <div className="inline-block border border-border/40 rounded-sm">
              <div className="flex">
                <div className="w-24 h-14 border-r border-b border-border/30 bg-bg-cell/50 flex items-center justify-center text-[9px] text-text-dim">
                  Asset
                </div>
                {labels.map((label) => (
                  <div
                    key={label}
                    className="w-16 h-14 flex items-center justify-center border-r border-b border-border/30 bg-bg-cell/30 text-[7px] font-mono text-text-muted text-center px-0.5 leading-tight font-medium"
                  >
                    {displayLabel(assetMeta[label], label).slice(0, 12)}
                  </div>
                ))}
              </div>
              {matrix.map((row, rowIndex) => (
                <div key={labels[rowIndex]} className="flex">
                  <div className="w-24 h-14 border-r border-b border-border/30 bg-bg-cell/30 flex items-center justify-center text-[7px] font-mono text-text-muted text-center px-1 leading-tight font-medium">
                    {displayLabel(assetMeta[labels[rowIndex]], labels[rowIndex]).slice(0, 16)}
                  </div>
                  {row.map((cell) => (
                    <div
                      key={`${cell.assetA}-${cell.assetB}`}
                      className="w-16 h-14 flex flex-col items-center justify-center border-r border-b border-border/30 text-[8px] font-mono font-semibold text-text-primary cursor-help transition-all hover:scale-105"
                      style={{ backgroundColor: corrColor(cell.corr) }}
                      title={`${displayLabel(assetMeta[cell.assetA], cell.assetA)} vs ${displayLabel(assetMeta[cell.assetB], cell.assetB)} | corr ${Number.isNaN(cell.corr) ? 'N/A' : cell.corr.toFixed(3)} | overlap ${cell.overlap}`}
                    >
                      <div>{Number.isNaN(cell.corr) ? '--' : cell.corr.toFixed(2)}</div>
                      <div className="text-[7px] text-text-dim">{cell.overlap}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-6 py-3 border-t border-border/30 bg-bg-cell/20 flex-wrap">
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
            <span className="text-text-muted">-0.5</span>
          </div>
          <div className="flex items-center gap-2 text-2xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: corrColor(-1) }} />
            <span className="text-text-muted">-1.0</span>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
