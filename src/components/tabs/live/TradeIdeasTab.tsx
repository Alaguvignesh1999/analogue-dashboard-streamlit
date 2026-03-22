'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { getEffectiveScoringDate, getEffectiveScoringDay, getLiveReturnPointAtOrBefore, getLiveScoringReturns } from '@/engine/live';
import { selectEvents } from '@/engine/similarity';
import { nanMedian, nanMean, nanStd, nanPercentile } from '@/lib/math';
import { stars, statusFromPctile, fmtReturn } from '@/lib/format';
import { CUSTOM_GROUPS } from '@/config/assets';
import { useDashboard as dashboardStore } from '@/store/dashboard';

export interface TradeRow {
  lbl: string;
  cls: string;
  ticker: string;
  dir: 'LONG' | 'SHORT';
  med: number;
  mean: number;
  std: number;
  iqr: number;
  stars: string;
  n: number;
  nTotal: number;
  unit: string;
  isRates: boolean;
  hitRate: number;
  sharpe: number;
  sortino: number;
  skew: number;
  worst: number;
  liveGap: number;
  livePctile: number;
  status: string;
  fwdVals: number[];
}

function computeTradeRows(
  labels: string[],
  eventReturns: Record<string, Record<string, Record<number, number>>>,
  assetMeta: Record<string, any>,
  selectedEvents: string[],
  dayN: number,
  fwdDays: number,
  live: ReturnType<typeof dashboardStore.getState>['live'],
): TradeRow[] {
  const nSel = selectedEvents.length;
  const forwardOffset = dayN + fwdDays;
  if (forwardOffset <= dayN) return [];

  const rows: TradeRow[] = [];

  for (const label of labels) {
    const fwdVals: number[] = [];
    for (const eventName of selectedEvents) {
      const startValue = poiRet(eventReturns, label, eventName, dayN);
      const finishValue = poiRet(eventReturns, label, eventName, forwardOffset);
      if (!Number.isNaN(startValue) && !Number.isNaN(finishValue)) fwdVals.push(finishValue - startValue);
    }
    if (fwdVals.length < 2) continue;

    const med = nanMedian(fwdVals);
    const mean = nanMean(fwdVals);
    const std = nanStd(fwdVals);
    const iqr = nanPercentile(fwdVals, 75) - nanPercentile(fwdVals, 25);
    const isRates = assetMeta[label]?.is_rates_bp || false;
    const unit = unitLabel(assetMeta[label]);

    const hitRate = fwdVals.filter((value) =>
      (med > 0 && value > 0) || (med < 0 && value < 0)
    ).length / fwdVals.length;

    const direction = med >= 0 ? 1 : -1;
    const adjustedValues = fwdVals.map((value) => direction * value);
    const meanAdjusted = nanMean(adjustedValues);
    const stdAdjusted = nanStd(adjustedValues);
    const sharpe = meanAdjusted / (stdAdjusted + 1e-9);
    const downsideValues = adjustedValues.filter((value) => value < 0);
    const downsideStd = downsideValues.length > 1 ? nanStd(downsideValues) : stdAdjusted + 1e-9;
    const sortino = meanAdjusted / (downsideStd + 1e-9);
    const worst = Math.min(...adjustedValues);

    let skew = 0;
    if (fwdVals.length >= 3) {
      const meanValue = nanMean(fwdVals);
      const stdValue = nanStd(fwdVals);
      if (stdValue > 0) {
        skew = fwdVals.reduce((sum, value) => sum + ((value - meanValue) / stdValue) ** 3, 0) / fwdVals.length;
      }
    }

    let liveGap = Number.NaN;
    let livePctile = Number.NaN;
    const livePoint = getLiveReturnPointAtOrBefore(live, label, dayN);
    if (livePoint) {
      const historicalAtLivePoint: number[] = [];
      for (const eventName of selectedEvents) {
        const value = poiRet(eventReturns, label, eventName, livePoint.offset);
        if (!Number.isNaN(value)) historicalAtLivePoint.push(value);
      }
      if (historicalAtLivePoint.length >= 2) {
        liveGap = livePoint.value - nanMedian(historicalAtLivePoint);
        livePctile = (historicalAtLivePoint.filter((value) => livePoint.value > value).length / historicalAtLivePoint.length) * 100;
      }
    }

    const meta = assetMeta[label] || {};
    rows.push({
      lbl: label,
      cls: meta.class || '',
      ticker: meta.ticker || '',
      dir: med >= 0 ? 'LONG' : 'SHORT',
      med,
      mean,
      std,
      iqr,
      stars: stars(iqr, med),
      n: fwdVals.length,
      nTotal: nSel,
      unit,
      isRates,
      hitRate,
      sharpe,
      sortino,
      skew,
      worst,
      liveGap,
      livePctile,
      status: statusFromPctile(Number.isNaN(livePctile) ? null : livePctile),
      fwdVals,
    });
  }

  rows.sort((left, right) => right.sharpe - left.sharpe);
  return rows;
}

export function TradeIdeasTab() {
  const {
    eventReturns,
    assetMeta,
    allLabels,
    scores,
    scoreCutoff,
    horizon,
    live,
  } = useDashboard();

  const [group, setGroup] = useState('-- All Assets --');

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const scoringReturns = getLiveScoringReturns(live);

  const labels = useMemo(() => {
    if (group === '-- All Assets --') return allLabels;
    if (CUSTOM_GROUPS[group]) return CUSTOM_GROUPS[group].filter((label) => allLabels.includes(label));
    return allLabels.filter((label) => assetMeta[label]?.class === group);
  }, [group, allLabels, assetMeta]);

  const dayN = getEffectiveScoringDay(live, labels);
  const effectiveDate = getEffectiveScoringDate(live, labels);

  const rows = useMemo(
    () => computeTradeRows(labels, eventReturns, assetMeta, selectedEvents, dayN, horizon, live),
    [labels, eventReturns, assetMeta, selectedEvents, dayN, horizon, live],
  );

  const groupOptions = useMemo(
    () => [
      { value: '-- All Assets --', label: '-- All Assets --' },
      ...Object.keys(CUSTOM_GROUPS).sort().map((groupName) => ({ value: groupName, label: groupName })),
    ],
    [],
  );

  return (
    <ChartCard
      title="Trade Ideas"
      subtitle={`${rows.length} ideas | effective D+${dayN}${effectiveDate ? ` (${effectiveDate})` : ''} -> D+${dayN + horizon} (+${horizon}d) | ${selectedEvents.length} analogues | cutoff ${scoreCutoff.toFixed(2)}`}
      controls={
        <Select label="Group" value={group} onChange={setGroup} options={groupOptions} />
      }
    >
      <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
        Gap and percentile use the latest valid live move on or before the effective scoring day, then compare it to the analogue distribution at that same point. Status means: Still open below the 25th percentile, On track from the 25th to 50th, Chasing from the 50th to 75th, Extended above the 75th.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-2xs font-mono">
          <thead>
            <tr className="bg-bg-cell">
              {['#', 'Asset', 'Class', 'Dir', `+${horizon}d`, 'Median', 'Hit%', 'Sharpe', 'Sortino', 'Skew', 'Worst', 'Gap', 'Pctile', 'Status', 'Conv', 'N'].map((header) => (
                <th key={header} className="px-2 py-1.5 text-text-muted border-b border-border font-medium text-center whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-text-dim">
                  {scoringReturns ? 'No trade ideas at current settings.' : 'Run L1 Config to pull live data first.'}
                </td>
              </tr>
            ) : rows.map((row, index) => {
              const dirColor = row.dir === 'LONG' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
              return (
                <tr key={row.lbl} className="hover:bg-bg-hover/40 transition-colors" style={{ backgroundColor: dirColor }}>
                  <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{index + 1}</td>
                  <td className="px-2 py-1 text-left text-text-primary border-b border-border/30 whitespace-nowrap font-medium">
                    {displayLabel(assetMeta[row.lbl], row.lbl)}
                  </td>
                  <td className="px-2 py-1 text-center text-text-muted border-b border-border/30">{row.cls}</td>
                  <td className={`px-2 py-1 text-center font-semibold border-b border-border/30 ${row.dir === 'LONG' ? 'text-up' : 'text-down'}`}>
                    {row.dir}
                  </td>
                  <td className="px-2 py-1 text-center text-text-muted border-b border-border/30">+{horizon}d</td>
                  <td className={`px-2 py-1 text-center font-medium border-b border-border/30 ${row.med >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtReturn(row.med, row.isRates)}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    <span className={row.hitRate >= 0.6 ? 'text-up' : row.hitRate >= 0.5 ? 'text-accent-amber' : 'text-down'}>
                      {(row.hitRate * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className={`px-2 py-1 text-center border-b border-border/30 ${row.sharpe > 0 ? 'text-up' : 'text-down'}`}>
                    {row.sharpe.toFixed(2)}
                  </td>
                  <td className={`px-2 py-1 text-center border-b border-border/30 ${row.sortino > 0 ? 'text-up' : 'text-down'}`}>
                    {row.sortino.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-center text-text-secondary border-b border-border/30">{row.skew.toFixed(2)}</td>
                  <td className="px-2 py-1 text-center text-down border-b border-border/30">
                    {fmtReturn(row.worst, row.isRates)}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    {Number.isNaN(row.liveGap)
                      ? '--'
                      : <span className={row.liveGap >= 0 ? 'text-up' : 'text-down'}>{fmtReturn(row.liveGap, row.isRates)}</span>}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    {Number.isNaN(row.livePctile) ? '--' : `${row.livePctile.toFixed(0)}th`}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30 whitespace-nowrap">{row.status}</td>
                  <td className="px-2 py-1 text-center border-b border-border/30">{row.stars}</td>
                  <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{row.n}/{row.nTotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
