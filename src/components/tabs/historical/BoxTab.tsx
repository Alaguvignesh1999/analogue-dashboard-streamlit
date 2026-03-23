'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMedian, nanPercentile, nanMin, nanMax } from '@/lib/math';
import { fmtReturn } from '@/lib/format';

export function BoxTab() {
  const { eventReturns, assetMeta, allLabels, events, activeEvents } = useDashboard();
  const [group, setGroup] = useState('Risk Barometer');
  const [selectedPois, setSelectedPois] = useState<Set<number>>(new Set(POIS.filter((poi) => poi.offset >= 0).map((poi) => poi.offset)));

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [events, activeEvents],
  );

  const labels = useMemo(() => {
    if (group === '— All —') return allLabels.slice(0, 20);
    return (CUSTOM_GROUPS[group] || []).filter((label: string) => allLabels.includes(label));
  }, [group, allLabels]);

  const boxData = useMemo(() => {
    const activePois = POIS.filter((poi) => selectedPois.has(poi.offset));
    return labels.map((label) => {
      const isRates = assetMeta[label]?.is_rates_bp || false;
      const poiStats = activePois.map((poi) => {
        const values: number[] = [];
        for (const eventName of activeEventNames) {
          const value = poiRet(eventReturns, label, eventName, poi.offset);
          if (!Number.isNaN(value)) values.push(value);
        }
        if (values.length < 2) return { offset: poi.offset, label: poi.label, stats: null };
        return {
          offset: poi.offset,
          label: poi.label,
          stats: {
            min: nanMin(values),
            q1: nanPercentile(values, 25),
            med: nanMedian(values),
            q3: nanPercentile(values, 75),
            max: nanMax(values),
          },
        };
      });
      return { asset: label, isRates, poiStats };
    }).sort((left, right) => {
      const leftMedian = left.poiStats[0]?.stats?.med ?? 0;
      const rightMedian = right.poiStats[0]?.stats?.med ?? 0;
      return Math.abs(rightMedian) - Math.abs(leftMedian);
    });
  }, [activeEventNames, assetMeta, eventReturns, labels, selectedPois]);

  const groupOptions = useMemo(
    () => [
      { value: '— All —', label: '— All —' },
      ...Object.keys(CUSTOM_GROUPS).sort().map((groupName) => ({ value: groupName, label: groupName })),
    ],
    [],
  );

  const activePois = POIS.filter((poi) => selectedPois.has(poi.offset));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Box & Whisker Distribution"
        subtitle={`${labels.length} assets · ${activePois.length} horizons · ${activeEventNames.length} events`}
        controls={
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={group} onChange={setGroup} options={groupOptions} />
            <div className="flex gap-1.5 flex-wrap">
              {POIS.map((poi) => (
                <button
                  key={poi.label}
                  onClick={() => {
                    const next = new Set(selectedPois);
                    next.has(poi.offset) ? next.delete(poi.offset) : next.add(poi.offset);
                    setSelectedPois(next);
                  }}
                  className="transition-all"
                >
                  <Badge color={selectedPois.has(poi.offset) ? 'teal' : 'dim'} className="cursor-pointer hover:opacity-80">
                    {poi.label}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto border-t border-border/40">
          <table className="w-full border-collapse text-2xs font-mono">
            <thead>
              <tr className="bg-bg-cell/50 sticky top-0 z-10">
                <th className="px-3 py-2 text-left text-text-muted border-b border-border/60 font-medium w-[140px] sticky left-0 bg-bg-cell/50">
                  Asset
                </th>
                {activePois.map((poi) => (
                  <th key={poi.label} className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium min-w-[160px]">
                    {poi.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {boxData.map((row, index) => (
                <tr key={row.asset} className="hover:bg-bg-cell/30 transition-colors table-row-hover" style={{ backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)' }}>
                  <td className="px-3 py-2.5 border-b border-border/30 text-text-secondary whitespace-nowrap sticky left-0 bg-inherit font-medium">
                    {displayLabel(assetMeta[row.asset], row.asset)}
                  </td>
                  {row.poiStats.map((poiStat) => {
                    if (!poiStat.stats) {
                      return (
                        <td key={poiStat.label} className="px-2 py-2.5 border-b border-border/30 text-center text-text-dim">
                          —
                        </td>
                      );
                    }
                    const stats = poiStat.stats;
                    const range = stats.max - stats.min || 1;
                    const scale = (value: number) => ((value - stats.min) / range) * 100;
                    return (
                      <td key={poiStat.label} className="px-2 py-2.5 border-b border-border/30">
                        <div className="relative h-6 flex flex-col justify-center">
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-[1px] bg-border/60"
                            style={{ left: `${scale(stats.min)}%`, width: `${Math.max(scale(stats.max) - scale(stats.min), 1)}%` }}
                          />
                          <div
                            className="absolute top-1.5 bottom-1.5 border border-border/80 transition-all"
                            style={{
                              left: `${scale(stats.q1)}%`,
                              width: `${Math.max(scale(stats.q3) - scale(stats.q1), 2)}%`,
                              backgroundColor: stats.med >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                            }}
                          />
                          <div
                            className="absolute top-0.5 bottom-0.5 w-[2px] transition-colors"
                            style={{
                              left: `${scale(stats.med)}%`,
                              backgroundColor: stats.med >= 0 ? '#22c55e' : '#ef4444',
                              boxShadow: stats.med >= 0 ? '0 0 3px #22c55e40' : '0 0 3px #ef444440',
                            }}
                          />
                          {stats.min < 0 && stats.max > 0 && (
                            <div className="absolute top-0 bottom-0 w-[1px] bg-border/40" style={{ left: `${scale(0)}%` }} />
                          )}
                        </div>
                        <div className="flex justify-between text-[7px] text-text-dim mt-1.5 px-0.5">
                          <span>{fmtReturn(stats.min, row.isRates, 0)}</span>
                          <span className={`font-semibold ${stats.med >= 0 ? 'text-up' : 'text-down'}`}>{fmtReturn(stats.med, row.isRates, 0)}</span>
                          <span>{fmtReturn(stats.max, row.isRates, 0)}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BottomDescription>
          Each row uses a shared numeric axis within each horizon cell, so you can compare both sign and magnitude. The box shows the interquartile range, the center line is the median, and the whiskers show the full observed range.
        </BottomDescription>
      </ChartCard>
    </div>
  );
}
