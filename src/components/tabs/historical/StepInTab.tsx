'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, SliderControl, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS, POST_WINDOW_TD } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanMedian, nanStd, nanPercentile } from '@/lib/math';
import { fmtReturn, stars } from '@/lib/format';
import { alphaThemeColor } from '@/theme/chart';

export function StepInTab() {
  const { eventReturns, assetMeta, allLabels, events, activeEvents } = useDashboard();
  const [group, setGroup] = useState('Risk Barometer');
  const [stepDay, setStepDay] = useState(5);
  const [fwdOffset, setFwdOffset] = useState(21);

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [events, activeEvents],
  );

  const labels = useMemo(() => {
    if (group === '— All —') return allLabels;
    return (CUSTOM_GROUPS[group] || []).filter((label: string) => allLabels.includes(label));
  }, [group, allLabels]);

  const rows = useMemo(() => {
    const results: Array<{
      asset: string;
      isRates: boolean;
      med: number;
      mean: number;
      std: number;
      iqr: number;
      hitRate: number;
      sharpe: number;
      rating: string;
      n: number;
    }> = [];

    for (const label of labels) {
      const isRates = assetMeta[label]?.is_rates_bp || false;
      const fwdVals: number[] = [];

      for (const eventName of activeEventNames) {
        const atStep = poiRet(eventReturns, label, eventName, stepDay);
        const atFwd = poiRet(eventReturns, label, eventName, fwdOffset);
        if (!Number.isNaN(atStep) && !Number.isNaN(atFwd)) {
          fwdVals.push(atFwd - atStep);
        }
      }

      if (fwdVals.length < 2) continue;

      const med = nanMedian(fwdVals);
      const mean = nanMean(fwdVals);
      const std = nanStd(fwdVals);
      const iqr = nanPercentile(fwdVals, 75) - nanPercentile(fwdVals, 25);
      const dir = med >= 0 ? 1 : -1;
      const hitRate = fwdVals.filter((value) => value * dir > 0).length / fwdVals.length;
      const sharpe = nanMean(fwdVals.map((value) => value * dir)) / (nanStd(fwdVals.map((value) => value * dir)) + 1e-9);

      results.push({
        asset: label,
        isRates,
        med,
        mean,
        std,
        iqr,
        hitRate,
        sharpe,
        rating: stars(iqr, med),
        n: fwdVals.length,
      });
    }

    results.sort((left, right) => Math.abs(right.sharpe) - Math.abs(left.sharpe));
    return results;
  }, [activeEventNames, assetMeta, eventReturns, fwdOffset, labels, stepDay]);

  const groupOptions = useMemo(
    () => [
      { value: '— All —', label: '— All —' },
      ...Object.keys(CUSTOM_GROUPS).sort().map((groupName) => ({ value: groupName, label: groupName })),
    ],
    [],
  );

  const fwdOptions = useMemo(
    () => POIS.filter((poi) => poi.offset > 0).map((poi) => ({ value: String(poi.offset), label: `${poi.label} (D+${poi.offset})` })),
    [],
  );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Step-In Strategy Ranking"
        subtitle={`Entry D+${stepDay} -> target D+${fwdOffset} · ranked by direction-adjusted Sharpe`}
        controls={
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={group} onChange={setGroup} options={groupOptions} />
            <SliderControl label="Entry" value={stepDay} onChange={setStepDay} min={0} max={POST_WINDOW_TD} suffix="d" />
            <Select value={String(fwdOffset)} onChange={(value) => setFwdOffset(Number(value))} options={fwdOptions} />
          </div>
        }
      >
        <div className="overflow-x-auto border-t border-border/40">
          <table className="w-full border-collapse text-2xs font-mono">
            <thead>
              <tr className="bg-bg-cell/50 sticky top-0 z-10">
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium w-8">#</th>
                <th className="px-3 py-2 text-left text-text-muted border-b border-border/60 font-medium">Asset</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium w-12">Signal</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium">Median</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium">Mean</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium">Std Dev</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium">IQR</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium">Win Rate</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium">Sharpe</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium">Quality</th>
                <th className="px-2 py-2 text-center text-text-muted border-b border-border/60 font-medium w-8">N</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-text-dim">
                    No step-in data at the selected horizons.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const isUp = row.med >= 0;
                  const winRateQuality = row.hitRate >= 0.65 ? 'green' : row.hitRate >= 0.55 ? 'amber' : 'red';

                  return (
                    <tr
                      key={row.asset}
                      className="hover:bg-bg-cell/40 transition-colors table-row-hover"
                      style={{ backgroundColor: isUp ? alphaThemeColor('up', '0.05') : alphaThemeColor('down', '0.05') }}
                    >
                      <td className="px-2 py-2 text-center text-text-dim border-b border-border/30 font-medium">{index + 1}</td>
                      <td className="px-3 py-2 border-b border-border/30 text-text-primary whitespace-nowrap font-medium">{displayLabel(assetMeta[row.asset], row.asset)}</td>
                      <td className="px-2 py-2 text-center border-b border-border/30">
                        <Badge color={isUp ? 'green' : 'red'} className="text-2xs">
                          {isUp ? 'LONG' : 'SHORT'}
                        </Badge>
                      </td>
                      <td className={`px-2 py-2 text-center border-b border-border/30 font-semibold ${isUp ? 'text-up' : 'text-down'}`}>
                        {fmtReturn(row.med, row.isRates)}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-text-secondary">{fmtReturn(row.mean, row.isRates)}</td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-text-dim">{row.std.toFixed(1)}</td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-text-dim">{row.iqr.toFixed(1)}</td>
                      <td className="px-2 py-2 text-center border-b border-border/30">
                        <span className={winRateQuality === 'green' ? 'text-up font-semibold' : winRateQuality === 'amber' ? 'text-accent-blue font-semibold' : 'text-down'}>
                          {(row.hitRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className={`px-2 py-2 text-center border-b border-border/30 font-semibold ${row.sharpe > 0.3 ? 'text-up' : row.sharpe > 0 ? 'text-text-secondary' : 'text-down'}`}>
                        {row.sharpe.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-accent-blue font-bold">{row.rating}</td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-text-dim">{row.n}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">Strategies</div>
            <div className="text-lg font-bold text-text-primary font-mono">{rows.length}</div>
          </div>
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">Events</div>
            <div className="text-lg font-bold text-text-primary font-mono">{activeEventNames.length}</div>
          </div>
        </div>
        <BottomDescription>
          Step-In asks: if you wait until D+{stepDay} to enter instead of trading immediately at Day 0, which assets still offer the best forward distribution by D+{fwdOffset}? Use it to compare delayed-entry opportunities, not to replace the main analogue ranking.
        </BottomDescription>
      </ChartCard>
    </div>
  );
}
