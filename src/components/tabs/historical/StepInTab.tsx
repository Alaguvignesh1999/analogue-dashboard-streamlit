'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS, POST_WINDOW_TD } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanMedian, nanStd, nanPercentile } from '@/lib/math';
import { fmtReturn, stars } from '@/lib/format';

export function StepInTab() {
  const { eventReturns, assetMeta, allLabels, events, activeEvents } = useDashboard();
  const [group, setGroup] = useState('Risk Barometer');
  const [stepDay, setStepDay] = useState(5);
  const [fwdOffset, setFwdOffset] = useState(21);

  const activeEventNames = useMemo(() =>
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]
  );

  const labels = useMemo(() => {
    if (group === '— All —') return allLabels;
    return (CUSTOM_GROUPS[group] || []).filter((l: string) => allLabels.includes(l));
  }, [group, allLabels]);

  const rows = useMemo(() => {
    const fo = fwdOffset;
    const results: {
      asset: string; isRates: boolean; med: number; mean: number; std: number;
      iqr: number; hitRate: number; sharpe: number; rating: string; n: number;
    }[] = [];

    for (const lbl of labels) {
      const isRates = assetMeta[lbl]?.is_rates_bp || false;
      const fwdVals: number[] = [];
      for (const en of activeEventNames) {
        const atStep = poiRet(eventReturns, lbl, en, stepDay);
        const atFwd = poiRet(eventReturns, lbl, en, fo);
        if (!isNaN(atStep) && !isNaN(atFwd)) fwdVals.push(atFwd - atStep);
      }
      if (fwdVals.length < 2) continue;
      const med = nanMedian(fwdVals);
      const mn = nanMean(fwdVals);
      const sd = nanStd(fwdVals);
      const iqr = nanPercentile(fwdVals, 75) - nanPercentile(fwdVals, 25);
      const dir = med >= 0 ? 1 : -1;
      const hitRate = fwdVals.filter(v => v * dir > 0).length / fwdVals.length;
      const adjMn = nanMean(fwdVals.map(v => v * dir));
      const adjSd = nanStd(fwdVals.map(v => v * dir));
      const sharpe = adjMn / (adjSd + 1e-9);
      results.push({ asset: lbl, isRates, med, mean: mn, std: sd, iqr, hitRate, sharpe, rating: stars(iqr, med), n: fwdVals.length });
    }
    results.sort((a, b) => Math.abs(b.sharpe) - Math.abs(a.sharpe));
    return results;
  }, [labels, eventReturns, assetMeta, activeEventNames, stepDay, fwdOffset]);

  const groupOptions = useMemo(() => [
    { value: '— All —', label: '— All —' },
    ...Object.keys(CUSTOM_GROUPS).sort().map(g => ({ value: g, label: g })),
  ], []);

  const fwdOptions = POIS.filter(p => p.offset > 0).map(p => ({ value: String(p.offset), label: `${p.label} (D+${p.offset})` }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Step-In Strategy Ranking"
        subtitle={`Entry D+${stepDay} → Target D+${fwdOffset} · Ranked by Sharpe ratio`}
        controls={
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={group} onChange={setGroup} options={groupOptions} />
            <SliderControl label="Entry" value={stepDay} onChange={setStepDay} min={0} max={POST_WINDOW_TD} suffix="d" />
            <Select value={String(fwdOffset)} onChange={v => setFwdOffset(Number(v))} options={fwdOptions} />
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
                    No data at selected horizons
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const isUp = r.med >= 0;
                  const winRateQuality =
                    r.hitRate >= 0.65 ? 'green' : r.hitRate >= 0.55 ? 'amber' : 'red';

                  return (
                    <tr
                      key={r.asset}
                      className="hover:bg-bg-cell/40 transition-colors table-row-hover"
                      style={{
                        backgroundColor: isUp
                          ? 'rgba(34,197,94,0.05)'
                          : 'rgba(239,68,68,0.05)',
                      }}
                    >
                      <td className="px-2 py-2 text-center text-text-dim border-b border-border/30 font-medium">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 border-b border-border/30 text-text-primary whitespace-nowrap font-medium">
                        {displayLabel(assetMeta[r.asset], r.asset)}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30">
                        <Badge color={isUp ? 'green' : 'red'} className="text-2xs">
                          {isUp ? '↑ LONG' : '↓ SHORT'}
                        </Badge>
                      </td>
                      <td
                        className={`px-2 py-2 text-center border-b border-border/30 font-semibold ${
                          isUp ? 'text-up' : 'text-down'
                        }`}
                      >
                        {fmtReturn(r.med, r.isRates)}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-text-secondary">
                        {fmtReturn(r.mean, r.isRates)}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-text-dim">
                        {r.std.toFixed(1)}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-text-dim">
                        {r.iqr.toFixed(1)}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30">
                        <span
                          className={
                            winRateQuality === 'green'
                              ? 'text-up font-semibold'
                              : winRateQuality === 'amber'
                                ? 'text-accent-amber font-semibold'
                                : 'text-down'
                          }
                        >
                          {(r.hitRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td
                        className={`px-2 py-2 text-center border-b border-border/30 font-semibold ${
                          r.sharpe > 0.3 ? 'text-up' : r.sharpe > 0 ? 'text-text-secondary' : 'text-down'
                        }`}
                      >
                        {r.sharpe.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-accent-amber font-bold">
                        {r.rating}
                      </td>
                      <td className="px-2 py-2 text-center border-b border-border/30 text-text-dim">
                        {r.n}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
          <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">
            Strategies
          </div>
          <div className="text-lg font-bold text-text-primary font-mono">{rows.length}</div>
        </div>
        <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
          <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">
            Events
          </div>
          <div className="text-lg font-bold text-text-primary font-mono">
            {activeEventNames.length}
          </div>
        </div>
      </div>
    </div>
  );
}
