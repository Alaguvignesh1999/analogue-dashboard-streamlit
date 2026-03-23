'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, StatBox, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { getEffectiveScoringDay, getLiveDisplayDay, getLiveDisplayDate } from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import { KELLY_FRACTION, RISK_BUDGET_USD } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanMedian, nanStd, nanPercentile } from '@/lib/math';
import { fmtReturn, fmtDollar } from '@/lib/format';

function bootstrapResample(values: number[], n: number): number[] {
  const sample: number[] = [];
  for (let index = 0; index < n; index += 1) {
    sample.push(values[Math.floor(Math.random() * values.length)]);
  }
  return sample;
}

function bootstrapStats(values: number[], numSamples = 500) {
  if (values.length === 0) return { median: Number.NaN, p5: Number.NaN, p95: Number.NaN, std: Number.NaN };
  const bootstraps = Array.from({ length: numSamples }, () => nanMedian(bootstrapResample(values, values.length)));
  return {
    median: nanMedian(values),
    p5: nanPercentile(bootstraps, 5),
    p95: nanPercentile(bootstraps, 95),
    std: nanStd(bootstraps),
  };
}

export function ConfidenceTab() {
  const { eventReturns, assetMeta, scores, scoreCutoff, horizon, live, activeEvents } = useDashboard();
  const [group, setGroup] = useState(Object.keys(CUSTOM_GROUPS)[0] || 'Equities');

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const labels = useMemo(() => CUSTOM_GROUPS[group] || [], [group]);
  const dayN = getEffectiveScoringDay(live, labels);
  const displayDay = getLiveDisplayDay(live);
  const displayDate = getLiveDisplayDate(live);
  const displayEndDay = displayDay + horizon;

  const rows = useMemo(() => {
    const results: Array<{
      asset: string;
      isRates: boolean;
      unit: string;
      med: number;
      p5: number;
      p95: number;
      bsStd: number;
      hitRate: number;
      bRatio: number;
      kellyPct: number;
      suggestedNotional: number;
      tp: number;
      sl: number;
      rr: number;
      n: number;
      confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
    }> = [];

    for (const label of labels) {
      const meta = assetMeta[label];
      const isRates = meta?.is_rates_bp || false;
      const unit = unitLabel(meta);

      const fwds: number[] = [];
      for (const eventName of selectedEvents) {
        const atDn = poiRet(eventReturns, label, eventName, dayN);
        const atFo = poiRet(eventReturns, label, eventName, dayN + horizon);
        if (!Number.isNaN(atDn) && !Number.isNaN(atFo)) {
          fwds.push(atFo - atDn);
        }
      }
      if (fwds.length < 2) continue;

      const bs = bootstrapStats(fwds);
      const dir = bs.median >= 0 ? 1 : -1;
      const wins = fwds.filter((value) => value * dir > 0);
      const losses = fwds.filter((value) => value * dir < 0);
      const hitRate = wins.length / fwds.length;
      const avgWin = nanMean(wins.map((value) => Math.abs(value))) || 0;
      const avgLoss = nanMean(losses.map((value) => Math.abs(value))) || 1e-9;
      const bRatio = avgWin / avgLoss;
      const q = 1 - hitRate;
      const kellyRaw = bRatio > 0 ? (hitRate * bRatio - q) / bRatio : 0;
      const kellyPct = Math.max(0, Math.min(kellyRaw * KELLY_FRACTION * 100, 100));
      const suggestedNotional = (kellyPct / 100) * RISK_BUDGET_USD;

      const tp = nanPercentile(fwds, 75);
      const sl = nanPercentile(fwds, 25);
      const rr = Math.abs(sl) > 0.01 ? Math.abs(tp) / Math.abs(sl) : 0;

      let confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (fwds.length >= 8 && hitRate >= 0.7 && bs.std < Math.abs(bs.median)) confidenceLabel = 'HIGH';
      else if (fwds.length >= 5 && hitRate >= 0.55) confidenceLabel = 'MEDIUM';

      results.push({
        asset: label,
        isRates,
        unit,
        med: bs.median,
        p5: bs.p5,
        p95: bs.p95,
        bsStd: bs.std,
        hitRate,
        bRatio,
        kellyPct,
        suggestedNotional,
        tp,
        sl,
        rr,
        n: fwds.length,
        confidenceLabel,
      });
    }

    return results.sort((left, right) => right.kellyPct - left.kellyPct);
  }, [assetMeta, dayN, eventReturns, horizon, labels, selectedEvents]);

  const groupOptions = useMemo(
    () => Object.keys(CUSTOM_GROUPS).sort().map((groupName) => ({ value: groupName, label: groupName })),
    [],
  );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Bootstrap Confidence Bands"
        subtitle={`N=500 resamples · ${selectedEvents.length} analogues · live D+${displayDay}${displayDate ? ` (${displayDate})` : ''} -> D+${displayEndDay}`}
        controls={<Select label="" value={group} onChange={setGroup} options={groupOptions} />}
      >
        <div className="border-b border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-2xs font-mono">
              <thead>
                <tr className="bg-bg-cell/80 border-b border-border/40">
                  {['#', 'Asset', 'Median', '5th %ile', '95th %ile', 'BS Std', 'Conf', 'N'].map((header) => (
                    <th key={header} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-text-dim text-xs">
                      No confidence data available. Run matching first.
                    </td>
                  </tr>
                ) : rows.map((row, index) => (
                  <tr key={row.asset} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                    <td className="px-3 py-2 text-text-dim">{index + 1}</td>
                    <td className="px-3 py-2 text-text-primary font-medium">{displayLabel(assetMeta[row.asset], row.asset)}</td>
                    <td className={`px-3 py-2 font-medium ${row.med >= 0 ? 'text-up' : 'text-down'}`}>{fmtReturn(row.med, row.isRates)}</td>
                    <td className="px-3 py-2 text-text-muted">{fmtReturn(row.p5, row.isRates)}</td>
                    <td className="px-3 py-2 text-text-muted">{fmtReturn(row.p95, row.isRates)}</td>
                    <td className="px-3 py-2 text-text-muted">{row.bsStd.toFixed(1)}</td>
                    <td className="px-3 py-2">
                      <Badge color={row.confidenceLabel === 'HIGH' ? 'green' : row.confidenceLabel === 'MEDIUM' ? 'amber' : 'red'}>
                        {row.confidenceLabel}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-text-dim">{row.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Trade Proposal" subtitle={`Directional sizing from live D+${displayDay} to D+${displayEndDay}`}>
        <div className="overflow-x-auto border-b border-border/30">
          <table className="w-full border-collapse text-2xs font-mono">
            <thead>
              <tr className="bg-bg-cell/80 border-b border-border/40">
                {['Asset', 'Dir', 'TP', 'SL', 'R:R', 'Hit%', 'Kelly %', 'Notional'].map((header) => (
                  <th key={header} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-text-dim text-xs">
                    No trade proposal data available.
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.asset} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                  <td className="px-3 py-2 text-text-primary font-medium">{displayLabel(assetMeta[row.asset], row.asset)}</td>
                  <td className="px-3 py-2">
                    <Badge color={row.med >= 0 ? 'green' : 'red'}>{row.med >= 0 ? 'LONG' : 'SHORT'}</Badge>
                  </td>
                  <td className="px-3 py-2 text-up font-medium">{fmtReturn(row.tp, row.isRates)}</td>
                  <td className="px-3 py-2 text-down font-medium">{fmtReturn(row.sl, row.isRates)}</td>
                  <td className="px-3 py-2 text-accent-teal font-medium">{row.rr.toFixed(2)}x</td>
                  <td className="px-3 py-2 text-text-secondary">{(row.hitRate * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-accent-amber font-semibold">{row.kellyPct.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-text-secondary font-mono">{fmtDollar(row.suggestedNotional)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BottomDescription className="space-y-2">
          <div>
            Confidence and trade sizing are measured from the current live state to D+{displayEndDay}, not from Day 0.
          </div>
          <div>
            Confidence combines distribution width, hit rate, and sample size. Treat the bootstrap interval as the likely range for the median forward move, not a guarantee.
          </div>
          <div>
            Half-Kelly sizing formula: `f = (p*b - q) / b`, scaled by {(KELLY_FRACTION * 100).toFixed(0)}% and capped to the working budget of <span className="text-accent-teal">{fmtDollar(RISK_BUDGET_USD)}</span>.
          </div>
        </BottomDescription>
      </ChartCard>
    </div>
  );
}
