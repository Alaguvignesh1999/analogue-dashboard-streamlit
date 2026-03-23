'use client';

import { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select } from '@/components/ui/ChartCard';
import { anchorSeriesValue, displayLabel, unitLabel, eventDateMap, isAssetAvailableForEvent } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CHART_THEME } from '@/config/theme';
import { themedHeatColor } from '@/theme/chart';

function heatColor(value: number, maxAbs: number, isRates: boolean): string {
  if (isNaN(value)) return CHART_THEME.bgCell;
  return themedHeatColor(value, maxAbs, !isRates);
}

export function HeatmapTab() {
  const { eventReturns, assetMeta, allClasses, events, activeEvents, live, availability } = useDashboard();

  const [selectedClass, setSelectedClass] = useState('Oil & Energy');
  const [selectedAsset, setSelectedAsset] = useState('Brent Futures');

  const classAssets = useMemo(
    () => Object.entries(assetMeta).filter(([, meta]) => meta.class === selectedClass).map(([label]) => label),
    [assetMeta, selectedClass]
  );

  useEffect(() => {
    if (classAssets.length > 0 && !classAssets.includes(selectedAsset)) {
      setSelectedAsset(classAssets[0]);
    }
  }, [classAssets, selectedAsset]);

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [activeEvents, events]
  );
  const eventDates = useMemo(() => eventDateMap(events), [events]);

  const { matrix, maxAbs } = useMemo(() => {
    const rows: Array<Array<number | null>> = [];
    let maxValue = 0;

    for (const eventName of activeEventNames) {
      const row: Array<number | null> = [];
      const eventDate = eventDates[eventName];
      const available = isAssetAvailableForEvent(selectedAsset, eventDate, availability);

      for (const poi of POIS) {
        if (!available) {
          row.push(null);
          continue;
        }
        const series = eventReturns[selectedAsset]?.[eventName];
        const value = anchorSeriesValue(series, poi.offset, 'day0');
        const rounded = value === null ? null : Math.round(value * 10) / 10;
        row.push(rounded);
        if (rounded !== null) maxValue = Math.max(maxValue, Math.abs(rounded));
      }
      rows.push(row);
    }

    if (live.returns?.[selectedAsset] && live.dayN !== null) {
      const row: Array<number | null> = [];
      for (const poi of POIS) {
        if (poi.offset < 0 || poi.offset > live.dayN) {
          row.push(null);
          continue;
        }
        const value = anchorSeriesValue(live.returns[selectedAsset], poi.offset, 'day0');
        const rounded = value === null ? null : Math.round(value * 10) / 10;
        row.push(rounded);
        if (rounded !== null) maxValue = Math.max(maxValue, Math.abs(rounded));
      }
      rows.push(row);
    }

    return { matrix: rows, maxAbs: maxValue || 5 };
  }, [activeEventNames, availability, eventDates, eventReturns, live.dayN, live.returns, selectedAsset]);

  const meta = assetMeta[selectedAsset];
  const isRates = meta?.is_rates_bp || false;
  const unit = unitLabel(meta);
  const title = displayLabel(meta, selectedAsset);
  const rowLabels = [
    ...activeEventNames,
    ...(live.returns?.[selectedAsset] && live.dayN !== null ? [`Live: ${live.name} (D+${live.dayN})`] : []),
  ];

  return (
    <ChartCard
      title={`${title} - Return Heatmap`}
      subtitle={`${rowLabels.length} rows x ${POIS.length} horizons | ${unit}`}
      controls={
        <div className="flex items-center gap-3">
          <Select value={selectedClass} onChange={setSelectedClass} options={allClasses.map((value) => ({ value, label: value }))} />
          <Select
            value={selectedAsset}
            onChange={setSelectedAsset}
            options={classAssets.map((asset) => ({ value: asset, label: displayLabel(assetMeta[asset], asset) }))}
          />
        </div>
      }
    >
      <div className="overflow-x-auto p-4">
        <table className="w-full border-collapse text-xs font-mono">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-text-muted border-b border-border font-medium w-[220px] sticky left-0 bg-bg-panel z-10">
                Event
              </th>
              {POIS.map((poi) => (
                <th key={poi.label} className="px-3 py-2 text-text-muted border-b border-border font-medium text-center min-w-[72px]">
                  {poi.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label, rowIndex) => {
              const isLive = label.startsWith('Live:');
              return (
                <tr key={label} className={`${isLive ? 'border-t-2 border-live/30' : ''} hover:bg-bg-hover/30 transition-colors`}>
                  <td className={`px-3 py-1.5 border-b border-border/50 sticky left-0 bg-bg-panel z-10 ${isLive ? 'text-live font-medium' : 'text-text-secondary'}`}>
                    {label.length > 28 ? `${label.slice(0, 28)}...` : label}
                  </td>
                  {POIS.map((poi, columnIndex) => {
                    const value = matrix[rowIndex]?.[columnIndex];
                    return (
                      <td
                        key={poi.label}
                        className="px-2 py-1.5 text-center border-b border-border/50"
                        style={{ backgroundColor: value !== null ? heatColor(value, maxAbs, isRates) : 'transparent' }}
                      >
                        <span className={value !== null ? 'text-text-primary' : 'text-text-dim'}>
                          {value !== null ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}` : '--'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <BottomDescription>
        Each cell shows the rebased return at that POI for the selected asset and event. The live row, when present, uses the currently loaded live event on the same Day 0 basis. Blank cells mean the asset was unavailable or had insufficient coverage for that event and horizon, not a zero return.
      </BottomDescription>
    </ChartCard>
  );
}
