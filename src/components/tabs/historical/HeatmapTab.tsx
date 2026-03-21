'use client';

import { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CHART_THEME } from '@/config/theme';

function heatColor(value: number, maxAbs: number, isRates: boolean): string {
  if (isNaN(value)) return CHART_THEME.bgCell;
  const intensity = Math.min(Math.abs(value) / (maxAbs + 1e-9), 1);
  const alpha = 0.15 + intensity * 0.55;
  const isGood = isRates ? value < 0 : value > 0;
  if (isGood) return `rgba(34,197,94,${alpha.toFixed(2)})`;
  return `rgba(239,68,68,${alpha.toFixed(2)})`;
}

export function HeatmapTab() {
  const { eventReturns, assetMeta, allClasses, events, activeEvents, live } = useDashboard();
  
  const [selectedClass, setSelectedClass] = useState('Oil & Energy');
  const [selectedAsset, setSelectedAsset] = useState('Brent Futures');

  const classAssets = useMemo(() => {
    return Object.entries(assetMeta)
      .filter(([, m]) => m.class === selectedClass)
      .map(([label]) => label);
  }, [assetMeta, selectedClass]);

  // Auto-select first asset when class changes
  useEffect(() => {
    if (classAssets.length > 0 && !classAssets.includes(selectedAsset)) {
      setSelectedAsset(classAssets[0]);
    }
  }, [classAssets, selectedAsset]);

  const activeEventNames = useMemo(() => 
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]
  );

  const { matrix, maxAbs } = useMemo(() => {
    const mat: (number | null)[][] = [];
    let mx = 0;
    for (const en of activeEventNames) {
      const row: (number | null)[] = [];
      for (const poi of POIS) {
        const v = poiRet(eventReturns, selectedAsset, en, poi.offset);
        row.push(isNaN(v) ? null : Math.round(v * 10) / 10);
        if (!isNaN(v)) mx = Math.max(mx, Math.abs(v));
      }
      mat.push(row);
    }
    if (live.returns?.[selectedAsset] && live.dayN !== null) {
      const row: (number | null)[] = [];
      for (const poi of POIS) {
        if (poi.offset >= 0 && poi.offset <= live.dayN) {
          const v = live.returns[selectedAsset]?.[poi.offset];
          row.push(v !== undefined ? Math.round(v * 10) / 10 : null);
          if (v !== undefined) mx = Math.max(mx, Math.abs(v));
        } else {
          row.push(null);
        }
      }
      mat.push(row);
    }
    return { matrix: mat, maxAbs: mx || 5 };
  }, [eventReturns, selectedAsset, activeEventNames, live]);

  const meta = assetMeta[selectedAsset];
  const isRates = meta?.is_rates_bp || false;
  const unit = unitLabel(meta);
  const dLabel = displayLabel(meta, selectedAsset);
  
  const allEventLabels = [
    ...activeEventNames,
    ...(live.returns?.[selectedAsset] && live.dayN !== null
      ? [`▶ ${live.name} (D+${live.dayN})`] : []),
  ];

  return (
    <ChartCard
      title={`${dLabel} — Return Heatmap`}
      subtitle={`${allEventLabels.length} events × ${POIS.length} horizons · ${unit}`}
      controls={
        <div className="flex items-center gap-3">
          <Select label="Class" value={selectedClass}
            onChange={setSelectedClass}
            options={allClasses.map(c => ({ value: c, label: c }))} />
          <Select label="Asset" value={selectedAsset}
            onChange={setSelectedAsset}
            options={classAssets.map(a => ({ value: a, label: displayLabel(assetMeta[a], a) }))} />
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
              {POIS.map(p => (
                <th key={p.label} className="px-3 py-2 text-text-muted border-b border-border font-medium text-center min-w-[72px]">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allEventLabels.map((en, i) => {
              const isLive = en.startsWith('▶');
              return (
                <tr key={en} className={`${isLive ? 'border-t-2 border-live/30' : ''} hover:bg-bg-hover/30 transition-colors`}>
                  <td className={`px-3 py-1.5 border-b border-border/50 sticky left-0 bg-bg-panel z-10 ${isLive ? 'text-live font-medium' : 'text-text-secondary'}`}>
                    {en.length > 28 ? en.slice(0, 28) + '…' : en}
                  </td>
                  {POIS.map((p, j) => {
                    const val = matrix[i]?.[j];
                    return (
                      <td
                        key={p.label}
                        className="px-2 py-1.5 text-center border-b border-border/50"
                        style={{ backgroundColor: val !== null ? heatColor(val, maxAbs, isRates) : 'transparent' }}
                      >
                        <span className={val !== null ? 'text-text-primary' : 'text-text-dim'}>
                          {val !== null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}` : '—'}
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
    </ChartCard>
  );
}
