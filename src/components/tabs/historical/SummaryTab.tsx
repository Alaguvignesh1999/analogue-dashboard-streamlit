'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, eventDateMap, isAssetAvailableForEvent } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanStd } from '@/lib/math';

function heatColor(value: number, maxAbs: number, isRates: boolean): string {
  if (isNaN(value)) return 'transparent';
  const intensity = Math.min(Math.abs(value) / (maxAbs + 1e-9), 1);
  const alpha = 0.1 + intensity * 0.5;
  const isGood = isRates ? value < 0 : value > 0;
  return isGood ? `rgba(34, 197, 94, ${alpha.toFixed(2)})` : `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
}

export function SummaryTab() {
  const { eventReturns, assetMeta, allLabels, events, activeEvents, availability } = useDashboard();
  const [group, setGroup] = useState('Risk Barometer');

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [activeEvents, events]
  );
  const eventDates = useMemo(() => eventDateMap(events), [events]);

  const labels = useMemo(() => {
    if (group === 'All Assets') return allLabels;
    return (CUSTOM_GROUPS[group] || []).filter((label) => allLabels.includes(label));
  }, [allLabels, group]);

  const { rows, maxAbs } = useMemo(() => {
    let maxValue = 0;

    const data = labels.map((label) => {
      const isRates = assetMeta[label]?.is_rates_bp || false;
      const cells: Record<number, { mean: number; std: number } | null> = {};

      for (const poi of POIS) {
        const values: number[] = [];
        for (const eventName of activeEventNames) {
          if (!isAssetAvailableForEvent(label, eventDates[eventName], availability)) continue;
          const value = poiRet(eventReturns, label, eventName, poi.offset);
          if (!isNaN(value)) values.push(value);
        }

        if (values.length < 2) {
          cells[poi.offset] = null;
          continue;
        }

        const mean = nanMean(values);
        const std = nanStd(values);
        maxValue = Math.max(maxValue, Math.abs(mean));
        cells[poi.offset] = { mean, std };
      }

      return { asset: label, isRates, cells };
    });

    return { rows: data, maxAbs: maxValue || 5 };
  }, [activeEventNames, assetMeta, availability, eventDates, eventReturns, labels]);

  const groupOptions = useMemo(
    () => [{ value: 'All Assets', label: 'All Assets' }].concat(
      Object.keys(CUSTOM_GROUPS).sort().map((value) => ({ value, label: value }))
    ),
    []
  );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Summary Heatmap"
        subtitle={`Mean +/- Std across ${activeEventNames.length} valid events`}
        controls={<Select value={group} onChange={setGroup} options={groupOptions} />}
      >
        <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
          Each cell shows the mean and standard deviation for that asset at that POI across the active event set. Pre-inception and otherwise invalid event rows are excluded before aggregation. Blank cells mean there were too few valid observations to trust the summary.
        </div>

        <div className="overflow-x-auto border-t border-border/40">
          <table className="w-full border-collapse text-2xs font-mono">
            <thead>
              <tr className="bg-bg-cell/50 sticky top-0 z-10">
                <th className="px-3 py-2 text-left text-text-muted border-b border-border/60 font-medium w-[140px] sticky left-0 bg-bg-cell/50">
                  Asset
                </th>
                {POIS.map((poi) => (
                  <th
                    key={poi.label}
                    className="px-3 py-2 text-center text-text-muted border-b border-border/60 font-medium min-w-[80px]"
                  >
                    {poi.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.asset} className="hover:bg-bg-cell/40 transition-colors table-row-hover">
                  <td className="px-3 py-2 border-b border-border/30 text-text-secondary sticky left-0 bg-bg-panel z-9 whitespace-nowrap font-medium">
                    {displayLabel(assetMeta[row.asset], row.asset)}
                  </td>
                  {POIS.map((poi) => {
                    const cell = row.cells[poi.offset];
                    if (!cell) {
                      return (
                        <td key={poi.label} className="px-2 py-2 text-center border-b border-border/30 text-text-dim">
                          --
                        </td>
                      );
                    }

                    return (
                      <td
                        key={poi.label}
                        className="px-2 py-2 text-center border-b border-border/30 transition-colors"
                        style={{ backgroundColor: heatColor(cell.mean, maxAbs, row.isRates) }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className={`font-semibold ${cell.mean >= 0 ? 'text-up' : 'text-down'}`}>
                            {cell.mean >= 0 ? '+' : ''}
                            {cell.mean.toFixed(1)}
                          </span>
                          <span className="text-text-dim text-[6px]">+/- {cell.std.toFixed(1)}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="p-4 bg-bg-cell/30 border border-border/40 rounded-sm">
        <div className="text-2xs text-text-dim">
          <span className="font-semibold">Legend:</span> Cells now ignore pre-inception event rows instead of treating missing data as valid observations.
        </div>
      </div>
    </div>
  );
}
