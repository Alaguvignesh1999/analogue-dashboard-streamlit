'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMedian, nanPercentile, nanMin, nanMax } from '@/lib/math';
import { fmtReturn } from '@/lib/format';

export function BoxTab() {
  const { eventReturns, assetMeta, allLabels, events, activeEvents } = useDashboard();
  const [group, setGroup] = useState('Risk Barometer');
  const [selectedPois, setSelectedPois] = useState<Set<number>>(
    new Set(POIS.filter(p => p.offset >= 0).map(p => p.offset))
  );

  const activeEventNames = useMemo(() =>
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]
  );

  const labels = useMemo(() => {
    if (group === '— All —') return allLabels.slice(0, 20);
    return (CUSTOM_GROUPS[group] || []).filter((l: string) => allLabels.includes(l));
  }, [group, allLabels]);

  const boxData = useMemo(() => {
    const activePois = POIS.filter(p => selectedPois.has(p.offset));
    return labels.map(lbl => {
      const isRates = assetMeta[lbl]?.is_rates_bp || false;
      const poiStats = activePois.map(poi => {
        const vals: number[] = [];
        for (const en of activeEventNames) {
          const v = poiRet(eventReturns, lbl, en, poi.offset);
          if (!isNaN(v)) vals.push(v);
        }
        if (vals.length < 2) return { offset: poi.offset, label: poi.label, stats: null };
        return {
          offset: poi.offset, label: poi.label,
          stats: { min: nanMin(vals), q1: nanPercentile(vals, 25), med: nanMedian(vals), q3: nanPercentile(vals, 75), max: nanMax(vals) },
        };
      });
      return { asset: lbl, isRates, poiStats };
    }).sort((a, b) => {
      // Sort by median of first POI
      const aMed = a.poiStats[0]?.stats?.med ?? 0;
      const bMed = b.poiStats[0]?.stats?.med ?? 0;
      return Math.abs(bMed) - Math.abs(aMed);
    });
  }, [labels, eventReturns, assetMeta, activeEventNames, selectedPois]);

  const groupOptions = useMemo(() => [
    { value: '— All —', label: '— All —' },
    ...Object.keys(CUSTOM_GROUPS).sort().map(g => ({ value: g, label: g })),
  ], []);

  const activePois = POIS.filter(p => selectedPois.has(p.offset));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Box & Whisker Distribution"
        subtitle={`${labels.length} assets · ${activePois.length} horizons · ${activeEventNames.length} events`}
        controls={
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={group} onChange={setGroup} options={groupOptions} />
            <div className="flex gap-1.5 flex-wrap">
              {POIS.map(p => (
                <button
                  key={p.label}
                  onClick={() => {
                    const n = new Set(selectedPois);
                    n.has(p.offset) ? n.delete(p.offset) : n.add(p.offset);
                    setSelectedPois(n);
                  }}
                  className="transition-all"
                >
                  <Badge
                    color={selectedPois.has(p.offset) ? 'teal' : 'dim'}
                    className="cursor-pointer hover:opacity-80"
                  >
                    {p.label}
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
                {activePois.map(p => (
                  <th
                    key={p.label}
                    className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium min-w-[160px]"
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {boxData.map((row, idx) => (
                <tr
                  key={row.asset}
                  className="hover:bg-bg-cell/30 transition-colors table-row-hover"
                  style={{
                    backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)',
                  }}
                >
                  <td className="px-3 py-2.5 border-b border-border/30 text-text-secondary whitespace-nowrap sticky left-0 bg-inherit font-medium">
                    {displayLabel(assetMeta[row.asset], row.asset)}
                  </td>
                  {row.poiStats.map(ps => {
                    if (!ps.stats)
                      return (
                        <td
                          key={ps.label}
                          className="px-2 py-2.5 border-b border-border/30 text-center text-text-dim"
                        >
                          —
                        </td>
                      );
                    const s = ps.stats;
                    const range = s.max - s.min || 1;
                    const scale = (v: number) => ((v - s.min) / range) * 100;
                    return (
                      <td
                        key={ps.label}
                        className="px-2 py-2.5 border-b border-border/30"
                      >
                        <div className="relative h-6 flex flex-col justify-center">
                          {/* Whisker line */}
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-[1px] bg-border/60"
                            style={{
                              left: `${scale(s.min)}%`,
                              width: `${Math.max(scale(s.max) - scale(s.min), 1)}%`,
                            }}
                          />
                          {/* Box */}
                          <div
                            className="absolute top-1.5 bottom-1.5 border border-border/80 transition-all"
                            style={{
                              left: `${scale(s.q1)}%`,
                              width: `${Math.max(scale(s.q3) - scale(s.q1), 2)}%`,
                              backgroundColor:
                                s.med >= 0
                                  ? 'rgba(34,197,94,0.15)'
                                  : 'rgba(239,68,68,0.15)',
                            }}
                          />
                          {/* Median line */}
                          <div
                            className="absolute top-0.5 bottom-0.5 w-[2px] transition-colors"
                            style={{
                              left: `${scale(s.med)}%`,
                              backgroundColor:
                                s.med >= 0 ? '#22c55e' : '#ef4444',
                              boxShadow:
                                s.med >= 0
                                  ? '0 0 3px #22c55e40'
                                  : '0 0 3px #ef444440',
                            }}
                          />
                          {/* Zero line */}
                          {s.min < 0 && s.max > 0 && (
                            <div
                              className="absolute top-0 bottom-0 w-[1px] bg-border/40"
                              style={{ left: `${scale(0)}%` }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between text-[7px] text-text-dim mt-1.5 px-0.5">
                          <span>{fmtReturn(s.min, row.isRates, 0)}</span>
                          <span
                            className={`font-semibold ${
                              s.med >= 0 ? 'text-up' : 'text-down'
                            }`}
                          >
                            {fmtReturn(s.med, row.isRates, 0)}
                          </span>
                          <span>{fmtReturn(s.max, row.isRates, 0)}</span>
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
    </div>
  );
}
