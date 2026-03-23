'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl, Badge } from '@/components/ui/ChartCard';
import { displayLabel, poiRet, unitLabel } from '@/engine/returns';
import { getEffectiveScoringDay } from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import { corrcoef, nanMedian, nanStd } from '@/lib/math';
import { fmtReturn } from '@/lib/format';
import { ALL_ASSETS_OPTION, getGroupLabels, groupOptionsFromData } from '@/config/assets';

interface ScreenerRow {
  lbl: string;
  direction: string;
  med: number;
  hitRate: number;
  cov: number;
  nCov: number;
  maeMed: number;
  rrRatio: number;
  disagree: number;
  bimodal: boolean;
  conviction: 'ACT' | 'MONITOR' | 'SPLIT' | 'SKIP';
  convictionColor: string;
  unit: string;
  rationale: string;
  redundantWith: string[];
  overlapCount: number;
}

function hitRateClass(hitRate: number): string {
  if (hitRate >= 0.75) return 'text-accent-teal';
  if (hitRate >= 0.6) return 'text-up';
  if (hitRate >= 0.5) return 'text-accent-amber';
  return 'text-down';
}

function crowdingBadgeColor(overlapCount: number): 'dim' | 'amber' | 'red' {
  if (overlapCount === 0) return 'dim';
  if (overlapCount === 1) return 'amber';
  return 'red';
}

function crowdingAccent(overlapCount: number): string {
  if (overlapCount === 0) return 'rgba(113,113,122,0.45)';
  if (overlapCount === 1) return 'rgba(245,158,11,0.9)';
  return 'rgba(239,68,68,0.9)';
}

export function ScreenerTab() {
  const { eventReturns, assetMeta, allLabels, allClasses, scores, scoreCutoff, horizon, live, activeEvents } = useDashboard();
  const [group, setGroup] = useState(ALL_ASSETS_OPTION);
  const [minHitPct, setMinHitPct] = useState(60);
  const [minCovPct, setMinCovPct] = useState(50);
  const [minRR, setMinRR] = useState(0.8);
  const [corrThreshold, setCorrThreshold] = useState(0.7);

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const labels = useMemo(() => getGroupLabels(group, allLabels, assetMeta), [group, allLabels, assetMeta]);
  const dayN = getEffectiveScoringDay(live, labels);
  const fo = dayN + horizon;
  const minHit = minHitPct / 100;
  const minCov = minCovPct / 100;

  const rows = useMemo(() => {
    const selectedCount = selectedEvents.length;
    if (selectedCount === 0 || fo <= dayN) return [];

    const baseRows: Array<ScreenerRow & { forwardByEvent: Record<string, number> }> = [];

    for (const label of labels) {
      const forwardValues: number[] = [];
      const forwardByEvent: Record<string, number> = {};

      for (const eventName of selectedEvents) {
        const start = poiRet(eventReturns, label, eventName, dayN);
        const finish = poiRet(eventReturns, label, eventName, fo);
        if (!Number.isNaN(start) && !Number.isNaN(finish)) {
          const move = finish - start;
          forwardValues.push(move);
          forwardByEvent[eventName] = move;
        }
      }

      const nCov = forwardValues.length;
      const cov = nCov / Math.max(selectedCount, 1);
      if (nCov < 2) continue;

      const med = nanMedian(forwardValues);
      const sd = nanStd(forwardValues);
      const hitRate = forwardValues.filter((value) => (med > 0 && value > 0) || (med < 0 && value < 0)).length / nCov;
      const disagreeFrac = forwardValues.filter((value) => (med > 0 && value < 0) || (med < 0 && value > 0)).length / nCov;
      const bimodal = disagreeFrac > 0.35 && (sd / (Math.abs(med) + 1e-9)) > 1.5;

      const maeValues: number[] = [];
      for (const eventName of selectedEvents) {
        const pathValues: number[] = [];
        for (let offset = dayN; offset <= fo; offset += 1) {
          const start = poiRet(eventReturns, label, eventName, dayN);
          const value = poiRet(eventReturns, label, eventName, offset);
          if (!Number.isNaN(start) && !Number.isNaN(value)) {
            pathValues.push(value - start);
          }
        }
        if (pathValues.length > 0) {
          maeValues.push(Math.min(...pathValues));
        }
      }

      const maeMed = maeValues.length > 0 ? nanMedian(maeValues) : Number.NaN;
      const rrRatio = !Number.isNaN(maeMed) && Math.abs(maeMed) > 1e-9 ? Math.abs(med) / Math.abs(maeMed) : Number.NaN;

      let conviction: ScreenerRow['conviction'] = 'SKIP';
      let convictionColor = 'rgba(33,38,45,0.7)';
      let rationale = 'Coverage or hit rate is too weak for action.';

      if (bimodal) {
        conviction = 'SPLIT';
        convictionColor = 'rgba(239,68,68,0.12)';
        rationale = 'Distribution is split: too many analogues disagree on direction.';
      } else if (hitRate >= minHit && cov >= minCov && (Number.isNaN(rrRatio) || rrRatio >= minRR)) {
        if (hitRate >= 0.75 && cov >= 0.7) {
          conviction = 'ACT';
          convictionColor = 'rgba(34,197,94,0.18)';
          rationale = 'High directional agreement with decent coverage.';
        } else {
          conviction = 'MONITOR';
          convictionColor = 'rgba(245,158,11,0.15)';
          rationale = 'Setup is promising but not strong enough for full conviction.';
        }
      }

      baseRows.push({
        lbl: label,
        direction: med > 0 ? 'LONG' : 'SHORT',
        med,
        hitRate,
        cov,
        nCov,
        maeMed,
        rrRatio,
        disagree: disagreeFrac,
        bimodal,
        conviction,
        convictionColor,
        unit: unitLabel(assetMeta[label]),
        rationale,
        redundantWith: [],
        overlapCount: 0,
        forwardByEvent,
      });
    }

    const order: Record<ScreenerRow['conviction'], number> = {
      ACT: 0,
      MONITOR: 1,
      SPLIT: 2,
      SKIP: 3,
    };

    baseRows.sort((left, right) => {
      const convictionDiff = order[left.conviction] - order[right.conviction];
      return convictionDiff !== 0 ? convictionDiff : right.hitRate - left.hitRate;
    });

    for (let i = 0; i < baseRows.length; i += 1) {
      const current = baseRows[i];
      for (let j = 0; j < i; j += 1) {
        const prior = baseRows[j];
        const overlapEvents = selectedEvents.filter((eventName) =>
          current.forwardByEvent[eventName] !== undefined && prior.forwardByEvent[eventName] !== undefined
        );
        if (overlapEvents.length < 3) continue;
        const currentSeries = overlapEvents.map((eventName) => current.forwardByEvent[eventName]);
        const priorSeries = overlapEvents.map((eventName) => prior.forwardByEvent[eventName]);
        const correlation = corrcoef(currentSeries, priorSeries);
        if (!Number.isNaN(correlation) && Math.abs(correlation) >= corrThreshold) {
          current.redundantWith.push(`${displayLabel(assetMeta[prior.lbl], prior.lbl)} (${correlation >= 0 ? '+' : ''}${correlation.toFixed(2)})`);
          current.overlapCount = Math.max(current.overlapCount, overlapEvents.length);
        }
      }
    }

    return baseRows;
  }, [assetMeta, corrThreshold, dayN, eventReturns, fo, labels, minCov, minHit, minRR, selectedEvents]);

  const nAct = rows.filter((row) => row.conviction === 'ACT').length;
  const nMonitor = rows.filter((row) => row.conviction === 'MONITOR').length;
  const nCrowded = rows.filter((row) => row.redundantWith.length > 0).length;
  const groupOptions = useMemo(() => groupOptionsFromData(allClasses), [allClasses]);

  return (
    <ChartCard
      title="Signal Screener"
      subtitle={`ACT ${nAct} | MONITOR ${nMonitor} | Crowded ${nCrowded} | forward +${horizon}d`}
      controls={<Select label="Group" value={group} onChange={setGroup} options={groupOptions} />}
    >
      <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/50 bg-bg-cell/20">
        Screener ranks assets by forward-return quality across the currently selected analogue set. Correlated-trade flags are informational only: they warn you when a lower-ranked idea is effectively the same analogue expression as a stronger row above it.
      </div>

      <div className="px-4 py-2 flex gap-4 border-b border-border/50 flex-wrap">
        <SliderControl label="Min Hit" value={minHitPct} onChange={setMinHitPct} min={0} max={100} step={5} suffix="%" />
        <SliderControl label="Min Cov" value={minCovPct} onChange={setMinCovPct} min={0} max={100} step={5} suffix="%" />
        <SliderControl label="Min R/R" value={minRR} onChange={setMinRR} min={0} max={5} step={0.1} suffix="x" />
        <SliderControl label="Corr Flag" value={corrThreshold} onChange={setCorrThreshold} min={0.5} max={0.95} step={0.05} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-2xs font-mono">
          <thead>
            <tr className="bg-bg-cell">
              {['Asset', 'Conviction', 'Dir', 'Median', 'Hit%', 'Coverage', 'Max DD', 'R:R', 'Split?', 'Crowding', 'Reason'].map((header) => (
                <th key={header} className="px-2 py-1.5 text-text-muted border-b border-border font-medium text-center whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-text-dim">
                  {live.returns ? 'No signals at the current thresholds.' : 'Run L1 Config first to establish the live analogue set.'}
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr
                key={row.lbl}
                className="hover:bg-bg-hover/40 transition-colors"
                style={{
                  backgroundColor: row.convictionColor,
                  boxShadow: `inset 3px 0 0 ${crowdingAccent(row.redundantWith.length)}`,
                }}
              >
                <td
                  className="px-2 py-1 text-left text-text-primary border-b border-border/40 whitespace-nowrap font-medium"
                  style={{ backgroundColor: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}
                >
                  {displayLabel(assetMeta[row.lbl], row.lbl)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/40 whitespace-nowrap">{row.conviction}</td>
                <td className={`px-2 py-1 text-center border-b border-border/40 ${row.med > 0 ? 'text-up' : 'text-down'}`}>{row.direction}</td>
                <td className={`px-2 py-1 text-center border-b border-border/40 font-medium ${row.med >= 0 ? 'text-up' : 'text-down'}`}>
                  {fmtReturn(row.med, assetMeta[row.lbl]?.is_rates_bp || false)}
                </td>
                <td className={`px-2 py-1 text-center border-b border-border/40 ${hitRateClass(row.hitRate)}`}>{(row.hitRate * 100).toFixed(0)}%</td>
                <td className="px-2 py-1 text-center border-b border-border/40">{(row.cov * 100).toFixed(0)}% (N={row.nCov})</td>
                <td className="px-2 py-1 text-center border-b border-border/40 text-down">
                  {Number.isNaN(row.maeMed) ? '--' : fmtReturn(row.maeMed, assetMeta[row.lbl]?.is_rates_bp || false)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/40">
                  {Number.isNaN(row.rrRatio) ? '--' : `${row.rrRatio.toFixed(2)}x`}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/40">{row.bimodal ? 'YES' : 'NO'}</td>
                <td className="px-2 py-1 text-left border-b border-border/40 text-text-dim max-w-[280px]">
                  {row.redundantWith.length === 0 ? (
                    <Badge color="dim">Independent</Badge>
                  ) : (
                    <div className="space-y-1">
                      <Badge color={crowdingBadgeColor(row.redundantWith.length)}>
                        {row.redundantWith.length} overlap{row.redundantWith.length > 1 ? 's' : ''}
                      </Badge>
                      <div className="text-[10px] leading-snug text-text-dim/85">
                        {row.redundantWith.slice(0, 2).join(', ')}
                        {row.redundantWith.length > 2 ? ` +${row.redundantWith.length - 2} more` : ''}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-2 py-1 text-left border-b border-border/40 text-text-dim whitespace-normal">{row.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
