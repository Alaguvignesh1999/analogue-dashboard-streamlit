'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import {
  getEffectiveScoringDay,
  getLiveLevelPointAtOrBefore,
  getLiveScoringReturns,
  getLiveReturnPointAtOrBefore,
  getLiveDisplayDay,
  getLiveDisplayDate,
} from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import { nanMedian, nanPercentile } from '@/lib/math';
import { entrySignal, fmtReturn } from '@/lib/format';

function absoluteTarget(entryLevel: number | null, move: number, isRates: boolean): number | null {
  if (entryLevel === null || Number.isNaN(entryLevel)) return null;
  return isRates ? entryLevel + move / 100 : entryLevel * (1 + move / 100);
}

function formatTarget(entryLevel: number | null, move: number, isRates: boolean): string {
  const absolute = absoluteTarget(entryLevel, move, isRates);
  const deltaLabel = `${move >= 0 ? '+' : ''}${move.toFixed(1)}${isRates ? 'bp' : '%'}`;
  if (absolute === null) return deltaLabel;
  return `${absolute.toFixed(2)} (${deltaLabel})`;
}

export function GateTab() {
  const { eventReturns, assetMeta, allLabels, scores, scoreCutoff, horizon, live, activeEvents } = useDashboard();

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const scoringReturns = getLiveScoringReturns(live);
  const dayN = getEffectiveScoringDay(live, allLabels);
  const displayDay = getLiveDisplayDay(live);
  const displayDate = getLiveDisplayDate(live);
  const fo = dayN + horizon;

  const rows = useMemo(() => {
    if (!scoringReturns || fo <= dayN) return [];

    const result: Array<{
      lbl: string;
      dir: 'LONG' | 'SHORT';
      med: number;
      hitRate: number;
      sharpe: number;
      isRates: boolean;
      tp: number;
      sl: number;
      rr: number;
      entryLevel: number | null;
      livePctile: number | null;
      gate: ReturnType<typeof entrySignal>;
      n: number;
      nTotal: number;
      missingReason: string | null;
      liveOffset: number | null;
    }> = [];

    for (const label of allLabels) {
      const fwdVals: number[] = [];
      for (const eventName of selectedEvents) {
        const start = poiRet(eventReturns, label, eventName, dayN);
        const finish = poiRet(eventReturns, label, eventName, fo);
        if (!Number.isNaN(start) && !Number.isNaN(finish)) {
          fwdVals.push(finish - start);
        }
      }
      if (fwdVals.length < 2) continue;

      const med = nanMedian(fwdVals);
      const dir = med >= 0 ? 1 : -1;
      const isRates = assetMeta[label]?.is_rates_bp || false;
      const hitRate =
        fwdVals.filter((value) => (med > 0 && value > 0) || (med < 0 && value < 0)).length / fwdVals.length;

      let livePctile: number | null = null;
      let missingReason: string | null = null;
      const livePoint = getLiveReturnPointAtOrBefore(live, label, dayN);
      const entryPoint = getLiveLevelPointAtOrBefore(live, label, dayN);
      if (livePoint) {
        const histAtDn: number[] = [];
        for (const eventName of selectedEvents) {
          const value = poiRet(eventReturns, label, eventName, livePoint.offset);
          if (!Number.isNaN(value)) histAtDn.push(value);
        }
        if (histAtDn.length >= 2) {
          livePctile = (histAtDn.filter((value) => livePoint.value > value).length / histAtDn.length) * 100;
        } else {
          missingReason = `Too few historical comparisons at D+${livePoint.offset}`;
        }
      } else {
        missingReason = `No live scoring return on or before D+${dayN}`;
      }

      const tp = med >= 0 ? nanPercentile(fwdVals, 75) : nanPercentile(fwdVals, 25);
      const sl = med >= 0 ? nanPercentile(fwdVals, 25) : nanPercentile(fwdVals, 75);
      const tpAdj = dir * tp;
      const slAdj = dir * sl;
      const rr = Math.abs(slAdj) > 1e-6 ? Math.abs(tpAdj) / Math.abs(slAdj) : Number.NaN;

      const adjVals = fwdVals.map((value) => dir * value);
      const adjMean = adjVals.reduce((sum, value) => sum + value, 0) / adjVals.length;
      const adjStd = Math.sqrt(adjVals.reduce((sum, value) => sum + (value - adjMean) ** 2, 0) / adjVals.length);
      const sharpe = adjMean / (adjStd + 1e-9);

      result.push({
        lbl: label,
        dir: med >= 0 ? 'LONG' : 'SHORT',
        med,
        hitRate,
        sharpe,
        isRates,
        tp,
        sl,
        rr,
        entryLevel: entryPoint?.value ?? null,
        livePctile,
        gate: entrySignal(livePctile),
        n: fwdVals.length,
        nTotal: selectedEvents.length,
        missingReason: missingReason ?? (entryPoint ? null : `No live entry level on or before D+${dayN}`),
        liveOffset: livePoint?.offset ?? null,
      });
    }

    result.sort((left, right) => right.sharpe - left.sharpe);
    return result;
  }, [allLabels, assetMeta, dayN, eventReturns, fo, horizon, live, scoringReturns, selectedEvents]);

  return (
    <ChartCard
      title="Entry / Exit Gate"
      subtitle={`${live.name || 'No event'} | live D+${displayDay}${displayDate ? ` (${displayDate})` : ''} -> +${horizon}d | ${selectedEvents.length} analogues`}
    >
      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full border-collapse text-2xs font-mono">
          <thead>
            <tr className="bg-bg-cell">
              {['#', 'Asset', 'Dir', 'Gate', 'Entry', 'Median', 'Hit%', 'Sharpe', `TP +${horizon}d`, `SL +${horizon}d`, 'R:R', 'Pctile', 'N', 'Reason'].map((header) => (
                <th
                  key={header}
                  className="px-2 py-1.5 text-text-muted border-b border-border font-medium text-center whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-text-dim">
                  {scoringReturns ? 'No trades - adjust cutoff or horizon' : 'Run L1 Config + L2 Analogues first'}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={row.lbl}
                  className="hover:bg-bg-hover/40 transition-colors"
                  style={{ backgroundColor: row.gate.bg }}
                >
                  <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{index + 1}</td>
                  <td className="px-2 py-1 text-left text-text-primary border-b border-border/30 whitespace-nowrap font-medium">
                    {displayLabel(assetMeta[row.lbl], row.lbl)}
                  </td>
                  <td className={`px-2 py-1 text-center font-semibold border-b border-border/30 ${row.dir === 'LONG' ? 'text-up' : 'text-down'}`}>
                    {row.dir}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30 whitespace-nowrap" style={{ color: row.gate.color }}>
                    {row.gate.label}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30 text-text-secondary">
                    {row.entryLevel === null ? '-' : `${row.entryLevel.toFixed(2)}${row.liveOffset !== null ? ` @D+${row.liveOffset}` : ''}`}
                  </td>
                  <td className={`px-2 py-1 text-center font-medium border-b border-border/30 ${row.med >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtReturn(row.med, row.isRates)}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    <span className={row.hitRate >= 0.6 ? 'text-up' : 'text-text-secondary'}>
                      {(row.hitRate * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className={`px-2 py-1 text-center border-b border-border/30 ${row.sharpe > 0 ? 'text-up' : 'text-down'}`}>
                    {row.sharpe.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30 text-up">
                    {formatTarget(row.entryLevel, row.tp, row.isRates)}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30 text-down">
                    {formatTarget(row.entryLevel, row.sl, row.isRates)}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    {Number.isNaN(row.rr) ? '-' : `${row.rr.toFixed(2)}x`}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    {row.livePctile !== null ? `${row.livePctile.toFixed(0)}th` : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">
                    {row.n}/{row.nTotal}
                  </td>
                  <td className="px-2 py-1 text-left text-text-dim border-b border-border/30 whitespace-nowrap">
                    {row.gate.label === 'N/A' ? row.missingReason || 'Insufficient data' : '--'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <BottomDescription className="space-y-1">
        <div>Gate logic uses the latest valid live return and level on or before the live analysis point for each asset.</div>
        <div>Entry is the resolved live level used for the gate. TP and SL show absolute target levels with the implied move in brackets.</div>
        <div>Legend: ENTER &lt;33rd pctile, HALF 33-66th, LATE 66-85th, SKIP &gt;=85th. N/A only appears with a concrete missing-data reason.</div>
      </BottomDescription>
    </ChartCard>
  );
}
