'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanPercentile, corrcoef } from '@/lib/math';

function leadLagColor(val: number, maxAbs: number): string {
  if (isNaN(val) || maxAbs === 0) return 'transparent';
  const intensity = Math.min(Math.abs(val) / maxAbs, 1);
  const alpha = 0.2 + intensity * 0.55;
  return val > 0 ? `rgba(0,212,170,${alpha.toFixed(2)})` : `rgba(239,68,68,${alpha.toFixed(2)})`;
}

export function LeadLagTab() {
  const { eventReturns, assetMeta, events, activeEvents } = useDashboard();

  const [selectedGroup, setSelectedGroup] = useState('Risk Barometer');

  const groupAssets = useMemo(() => {
    const assets = CUSTOM_GROUPS[selectedGroup];
    if (!assets) return [];
    return assets.filter(a => eventReturns[a] && Object.keys(eventReturns[a]).length > 0);
  }, [selectedGroup, eventReturns]);

  const activeEventNames = useMemo(() =>
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]
  );

  const { matrix, maxAbs, stats } = useMemo(() => {
    if (groupAssets.length < 2 || activeEventNames.length === 0)
      return { matrix: {} as Record<string, Record<string, number>>, maxAbs: 1, stats: { avgLag: 0, strongLeads: 0, strongLags: 0 } };

    const mat: Record<string, Record<string, number>> = {};
    let mx = 0;
    const allLags: number[] = [];

    for (const assetA of groupAssets) {
      mat[assetA] = {};
      for (const assetB of groupAssets) {
        if (assetA === assetB) { mat[assetA][assetB] = 0; continue; }

        const eventLags: number[] = [];
        for (const en of activeEventNames) {
          const retA: number[] = [];
          const retB: number[] = [];
          for (const poi of POIS) {
            const va = poiRet(eventReturns, assetA, en, poi.offset);
            const vb = poiRet(eventReturns, assetB, en, poi.offset);
            if (!isNaN(va) && !isNaN(vb)) {
              retA.push(va);
              retB.push(vb);
            }
          }
          if (retA.length < 3) continue;

          let bestOff = 0;
          let bestCorr = -Infinity;
          for (let lag = -2; lag <= 2; lag++) {
            const pA: number[] = [];
            const pB: number[] = [];
            for (let i = 0; i < retA.length; i++) {
              const j = i + lag;
              if (j >= 0 && j < retB.length) {
                pA.push(retA[i]);
                pB.push(retB[j]);
              }
            }
            if (pA.length >= 2) {
              const c = corrcoef(pA, pB);
              if (!isNaN(c) && c > bestCorr) { bestCorr = c; bestOff = lag; }
            }
          }
          eventLags.push(bestOff);
        }

        const avg = eventLags.length > 0 ? nanMean(eventLags) : 0;
        mat[assetA][assetB] = avg;
        allLags.push(avg);
        mx = Math.max(mx, Math.abs(avg));
      }
    }

    const strongLeads = allLags.filter(l => l >= 0.7).length;
    const strongLags = allLags.filter(l => l <= -0.7).length;
    const avgLag = nanMean(allLags);

    return { matrix: mat, maxAbs: mx || 1, stats: { avgLag, strongLeads, strongLags } };
  }, [eventReturns, groupAssets, activeEventNames]);

  const groupOptions = useMemo(() =>
    Object.keys(CUSTOM_GROUPS).sort().map(g => ({ value: g, label: g })),
    []
  );

  return (
    <ChartCard
      title="Lead-Lag & Timing Matrix"
      subtitle={`Cross-correlation lag detection across ${activeEventNames.length} events`}
      controls={
        <Select label="Group" value={selectedGroup} onChange={setSelectedGroup} options={groupOptions} />
      }
    >
      <div className="p-4 space-y-4 animate-fade-in">
        {groupAssets.length < 2 ? (
          <div className="flex items-center justify-center h-24 text-xs text-text-dim">
            Select a group with at least 2 assets that have data
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatBox
                label="Avg Lag"
                value={stats.avgLag.toFixed(2)}
                sub="POI offset units"
                color={Math.abs(stats.avgLag) > 0.5 ? '#00d4aa' : '#71717a'}
              />
              <StatBox
                label="Strong Leads"
                value={stats.strongLeads}
                sub={`≥ +0.7 offset`}
                color="#00d4aa"
              />
              <StatBox
                label="Strong Lags"
                value={stats.strongLags}
                sub={`≤ -0.7 offset`}
                color="#ef4444"
              />
            </div>

            <div className="overflow-x-auto border border-border/40 rounded-sm">
              <table className="border-collapse text-2xs font-mono w-full">
                <thead>
                  <tr>
                    <th className="px-2.5 py-2 text-left text-text-muted border-b border-r border-border/50 bg-bg-cell/80 sticky left-0 z-10 min-w-[100px]">
                      Asset A → B
                    </th>
                    {groupAssets.map(a => (
                      <th key={a} className="px-2.5 py-2 text-center text-text-muted border-b border-border/40 bg-bg-cell/80 min-w-[75px] whitespace-nowrap">
                        {displayLabel(assetMeta[a], a).slice(0, 10)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupAssets.map(assetA => (
                    <tr key={assetA} className="hover:bg-bg-hover/20 transition-colors">
                      <td className="px-2.5 py-2 text-text-secondary border-b border-r border-border/30 bg-bg-cell/40 sticky left-0 z-10 font-medium whitespace-nowrap text-3xs">
                        {displayLabel(assetMeta[assetA], assetA).slice(0, 10)}
                      </td>
                      {groupAssets.map(assetB => {
                        const val = matrix[assetA]?.[assetB] ?? 0;
                        const bg = assetA === assetB ? 'bg-bg-cell/60' : 'transparent';
                        const bgColor = assetA === assetB ? '' : leadLagColor(val, maxAbs);
                        const textColor = assetA === assetB
                          ? 'text-text-dim'
                          : val > 0.3 ? 'text-[#00d4aa]' : val < -0.3 ? 'text-[#ef4444]' : 'text-text-muted';
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
                                {val > 0 ? '+' : ''}{val.toFixed(1)}
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
                  <span>Positive values: Row asset leads column (occurs first)</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'rgba(239,68,68,0.6)' }} />
                  <span>Negative values: Row asset lags column (occurs later)</span>
                </span>
              </div>
              <p className="text-text-dim/70 mt-1">Values are cross-correlation lag offsets in POI units. Intensity indicates strength of correlation.</p>
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
}
