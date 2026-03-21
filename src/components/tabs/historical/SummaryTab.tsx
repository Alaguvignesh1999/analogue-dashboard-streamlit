'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanStd } from '@/lib/math';

function heatColor(value: number, maxAbs: number, isRates: boolean): string {
  if (isNaN(value)) return 'transparent';
  const intensity = Math.min(Math.abs(value) / (maxAbs + 1e-9), 1);
  const isGood = isRates ? value < 0 : value > 0;

  if (isGood) {
    // Green scale: more intense = darker/more saturated
    const alpha = 0.1 + intensity * 0.5;
    return `rgba(34, 197, 94, ${alpha.toFixed(2)})`;
  } else {
    // Red scale: more intense = darker/more saturated
    const alpha = 0.1 + intensity * 0.5;
    return `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
  }
}

export function SummaryTab() {
  const { eventReturns, assetMeta, allLabels, events, activeEvents } = useDashboard();
  const [group, setGroup] = useState('Risk Barometer');

  const activeEventNames = useMemo(() =>
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]
  );

  const labels = useMemo(() => {
    if (group === '— All —') return allLabels.slice(0, 30);
    return (CUSTOM_GROUPS[group] || []).filter((l: string) => allLabels.includes(l));
  }, [group, allLabels]);

  const { rows, maxAbs } = useMemo(() => {
    let mx = 0;
    const data = labels.map(lbl => {
      const isRates = assetMeta[lbl]?.is_rates_bp || false;
      const cells: Record<number, { mean: number; std: number } | null> = {};
      for (const poi of POIS) {
        const vals: number[] = [];
        for (const en of activeEventNames) {
          const v = poiRet(eventReturns, lbl, en, poi.offset);
          if (!isNaN(v)) vals.push(v);
        }
        if (vals.length < 2) { cells[poi.offset] = null; continue; }
        const mean = nanMean(vals);
        const std = nanStd(vals);
        mx = Math.max(mx, Math.abs(mean));
        cells[poi.offset] = { mean, std };
      }
      return { asset: lbl, isRates, cells };
    });
    return { rows: data, maxAbs: mx || 5 };
  }, [labels, eventReturns, assetMeta, activeEventNames]);

  const groupOptions = useMemo(() => [
    { value: '— All —', label: '— All —' },
    ...Object.keys(CUSTOM_GROUPS).sort().map(g => ({ value: g, label: g })),
  ], []);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Summary Heatmap"
        subtitle={`Mean ± Std across ${activeEventNames.length} events`}
        controls={<Select value={group} onChange={setGroup} options={groupOptions} />}
      >
        <div className="overflow-x-auto border-t border-border/40">
          <table className="w-full border-collapse text-2xs font-mono">
            <thead>
              <tr className="bg-bg-cell/50 sticky top-0 z-10">
                <th className="px-3 py-2 text-left text-text-muted border-b border-border/60 font-medium w-[140px] sticky left-0 bg-bg-cell/50">
                  Asset
                </th>
                {POIS.map(p => (
                  <th
                    key={p.label}
                    className="px-3 py-2 text-center text-text-muted border-b border-border/60 font-medium min-w-[80px]"
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.asset}
                  className="hover:bg-bg-cell/40 transition-colors table-row-hover"
                >
                  <td className="px-3 py-2 border-b border-border/30 text-text-secondary sticky left-0 bg-bg-panel z-9 whitespace-nowrap font-medium">
                    {displayLabel(assetMeta[row.asset], row.asset)}
                  </td>
                  {POIS.map(p => {
                    const cell = row.cells[p.offset];
                    if (!cell)
                      return (
                        <td
                          key={p.label}
                          className="px-2 py-2 text-center border-b border-border/30 text-text-dim"
                        >
                          —
                        </td>
                      );
                    return (
                      <td
                        key={p.label}
                        className="px-2 py-2 text-center border-b border-border/30 transition-colors"
                        style={{
                          backgroundColor: heatColor(cell.mean, maxAbs, row.isRates),
                        }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`font-semibold ${
                              cell.mean >= 0 ? 'text-up' : 'text-down'
                            }`}
                          >
                            {cell.mean >= 0 ? '+' : ''}
                            {cell.mean.toFixed(1)}
                          </span>
                          <span className="text-text-dim text-[6px]">
                            ±{cell.std.toFixed(1)}
                          </span>
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
          <span className="font-semibold">Legend:</span> Cell color intensity = signal strength. Green = positive direction. Red = negative direction.
        </div>
      </div>
    </div>
  );
}
