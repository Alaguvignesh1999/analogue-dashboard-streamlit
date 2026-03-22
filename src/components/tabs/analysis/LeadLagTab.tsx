'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, corrcoef } from '@/lib/math';

function leadLagColor(value: number, maxAbs: number): string {
  if (Number.isNaN(value) || maxAbs === 0) return 'transparent';
  const intensity = Math.min(Math.abs(value) / maxAbs, 1);
  const alpha = 0.2 + intensity * 0.55;
  return value > 0 ? `rgba(0,212,170,${alpha.toFixed(2)})` : `rgba(239,68,68,${alpha.toFixed(2)})`;
}

export function LeadLagTab() {
  const { eventReturns, assetMeta, events, activeEvents } = useDashboard();
  const [selectedGroup, setSelectedGroup] = useState('Risk Barometer');

  const groupAssets = useMemo(() => {
    const assets = CUSTOM_GROUPS[selectedGroup];
    if (!assets) return [];
    return assets.filter((asset) => eventReturns[asset] && Object.keys(eventReturns[asset]).length > 0);
  }, [selectedGroup, eventReturns]);

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [events, activeEvents],
  );

  const { matrix, maxAbs, stats } = useMemo(() => {
    if (groupAssets.length < 2 || activeEventNames.length === 0) {
      return {
        matrix: {} as Record<string, Record<string, number>>,
        maxAbs: 1,
        stats: { avgLag: 0, strongLeads: 0, strongLags: 0 },
      };
    }

    const mat: Record<string, Record<string, number>> = {};
    let maxValue = 0;
    const allLags: number[] = [];

    for (const assetA of groupAssets) {
      mat[assetA] = {};
      for (const assetB of groupAssets) {
        if (assetA === assetB) {
          mat[assetA][assetB] = 0;
          continue;
        }

        const eventLags: number[] = [];
        for (const eventName of activeEventNames) {
          const retA: number[] = [];
          const retB: number[] = [];
          for (const poi of POIS) {
            const valueA = poiRet(eventReturns, assetA, eventName, poi.offset);
            const valueB = poiRet(eventReturns, assetB, eventName, poi.offset);
            if (!Number.isNaN(valueA) && !Number.isNaN(valueB)) {
              retA.push(valueA);
              retB.push(valueB);
            }
          }
          if (retA.length < 3) continue;

          let bestOffset = 0;
          let bestCorrelation = -Infinity;
          for (let lag = -2; lag <= 2; lag += 1) {
            const pathA: number[] = [];
            const pathB: number[] = [];
            for (let index = 0; index < retA.length; index += 1) {
              const shiftedIndex = index + lag;
              if (shiftedIndex >= 0 && shiftedIndex < retB.length) {
                pathA.push(retA[index]);
                pathB.push(retB[shiftedIndex]);
              }
            }
            if (pathA.length >= 2) {
              const correlation = corrcoef(pathA, pathB);
              if (!Number.isNaN(correlation) && correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestOffset = lag;
              }
            }
          }
          eventLags.push(bestOffset);
        }

        const avg = eventLags.length > 0 ? nanMean(eventLags) : 0;
        mat[assetA][assetB] = avg;
        allLags.push(avg);
        maxValue = Math.max(maxValue, Math.abs(avg));
      }
    }

    const strongLeads = allLags.filter((lag) => lag >= 0.7).length;
    const strongLags = allLags.filter((lag) => lag <= -0.7).length;
    const avgLag = nanMean(allLags);

    return { matrix: mat, maxAbs: maxValue || 1, stats: { avgLag, strongLeads, strongLags } };
  }, [activeEventNames, eventReturns, groupAssets]);

  const groupOptions = useMemo(
    () => Object.keys(CUSTOM_GROUPS).sort().map((groupName) => ({ value: groupName, label: groupName })),
    [],
  );

  return (
    <ChartCard
      title="Lead-Lag & Timing Matrix"
      subtitle={`Cross-correlation lag detection across ${activeEventNames.length} events`}
      controls={<Select label="Group" value={selectedGroup} onChange={setSelectedGroup} options={groupOptions} />}
    >
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="text-2xs text-text-dim border border-border/40 bg-bg-cell/20 px-3 py-2">
          Positive values mean the row asset tends to move first and the column asset follows. Negative values mean the row asset tends to react later. Values are measured in POI lag steps, not calendar days.
        </div>

        {groupAssets.length < 2 ? (
          <div className="flex items-center justify-center h-24 text-xs text-text-dim">
            Select a group with at least 2 assets that have valid data.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Avg Lag" value={stats.avgLag.toFixed(2)} sub="POI steps" color={Math.abs(stats.avgLag) > 0.5 ? '#00d4aa' : '#71717a'} />
              <StatBox label="Strong Leads" value={stats.strongLeads} sub=">= +0.7" color="#00d4aa" />
              <StatBox label="Strong Lags" value={stats.strongLags} sub="<= -0.7" color="#ef4444" />
            </div>

            <div className="overflow-x-auto border border-border/40 rounded-sm">
              <table className="border-collapse text-2xs font-mono w-full">
                <thead>
                  <tr>
                    <th className="px-2.5 py-2 text-left text-text-muted border-b border-r border-border/50 bg-bg-cell/80 sticky left-0 z-10 min-w-[100px]">
                      Asset A {'->'} B
                    </th>
                    {groupAssets.map((asset) => (
                      <th key={asset} className="px-2.5 py-2 text-center text-text-muted border-b border-border/40 bg-bg-cell/80 min-w-[75px] whitespace-nowrap">
                        {displayLabel(assetMeta[asset], asset).slice(0, 10)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupAssets.map((assetA) => (
                    <tr key={assetA} className="hover:bg-bg-hover/20 transition-colors">
                      <td className="px-2.5 py-2 text-text-secondary border-b border-r border-border/30 bg-bg-cell/40 sticky left-0 z-10 font-medium whitespace-nowrap text-3xs">
                        {displayLabel(assetMeta[assetA], assetA).slice(0, 10)}
                      </td>
                      {groupAssets.map((assetB) => {
                        const value = matrix[assetA]?.[assetB] ?? 0;
                        const bg = assetA === assetB ? 'bg-bg-cell/60' : 'transparent';
                        const bgColor = assetA === assetB ? '' : leadLagColor(value, maxAbs);
                        const textColor = assetA === assetB
                          ? 'text-text-dim'
                          : value > 0.3
                            ? 'text-[#00d4aa]'
                            : value < -0.3
                              ? 'text-[#ef4444]'
                              : 'text-text-muted';
                        return (
                          <td
                            key={assetB}
                            className={`px-2.5 py-2 text-center border-b border-border/20 ${bg} font-medium transition-colors`}
                            style={{ backgroundColor: bgColor || undefined }}
                          >
                            {assetA === assetB ? (
                              <span className="text-text-dim/50">—</span>
                            ) : (
                              <span className={textColor}>
                                {value > 0 ? '+' : ''}{value.toFixed(1)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 text-2xs text-text-dim">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'rgba(0,212,170,0.6)' }} />
                  <span>Positive: row asset tends to lead column asset</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'rgba(239,68,68,0.6)' }} />
                  <span>Negative: row asset tends to lag column asset</span>
                </span>
              </div>
              <p className="text-text-dim/70 mt-1">Use this for sequencing clues only; a strong lead-lag relationship does not by itself imply a tradeable edge.</p>
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
}
