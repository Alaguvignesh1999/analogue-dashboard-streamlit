'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { getEffectiveScoringDate, getEffectiveScoringDay } from '@/engine/live';
import { selectEvents } from '@/engine/similarity';
import { nanMedian, nanStd } from '@/lib/math';
import { CUSTOM_GROUPS } from '@/config/assets';

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
}

export function ScreenerTab() {
  const { eventReturns, assetMeta, allLabels, scores, scoreCutoff, horizon, live } = useDashboard();
  const [group, setGroup] = useState('— All Assets —');
  const [minHitPct, setMinHitPct] = useState(60);
  const [minCovPct, setMinCovPct] = useState(50);
  const [minRR, setMinRR] = useState(0.8);

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);

  const labels = useMemo(() => {
    if (group === '— All Assets —') return allLabels;
    if (CUSTOM_GROUPS[group]) return CUSTOM_GROUPS[group].filter((label) => allLabels.includes(label));
    return allLabels.filter((label) => assetMeta[label]?.class === group);
  }, [group, allLabels, assetMeta]);

  const dayN = getEffectiveScoringDay(live, labels);
  const effectiveDate = getEffectiveScoringDate(live, labels);
  const fo = dayN + horizon;
  const minHit = minHitPct / 100;
  const minCov = minCovPct / 100;

  const rows = useMemo(() => {
    const selectedCount = selectedEvents.length;
    if (selectedCount === 0 || fo <= dayN) return [];

    const result: ScreenerRow[] = [];

    for (const label of labels) {
      const forwardValues: number[] = [];
      for (const eventName of selectedEvents) {
        const start = poiRet(eventReturns, label, eventName, dayN);
        const finish = poiRet(eventReturns, label, eventName, fo);
        if (!Number.isNaN(start) && !Number.isNaN(finish)) {
          forwardValues.push(finish - start);
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

      result.push({
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
      });
    }

    const order: Record<ScreenerRow['conviction'], number> = {
      ACT: 0,
      MONITOR: 1,
      SPLIT: 2,
      SKIP: 3,
    };

    result.sort((left, right) => {
      const convictionDiff = order[left.conviction] - order[right.conviction];
      return convictionDiff !== 0 ? convictionDiff : right.hitRate - left.hitRate;
    });

    return result;
  }, [assetMeta, dayN, eventReturns, fo, labels, minCov, minHit, minRR, selectedEvents]);

  const nAct = rows.filter((row) => row.conviction === 'ACT').length;
  const nMonitor = rows.filter((row) => row.conviction === 'MONITOR').length;

  const groupOptions = useMemo(
    () => [
      { value: '— All Assets —', label: '— All Assets —' },
      ...Object.keys(CUSTOM_GROUPS).sort().map((groupName) => ({ value: groupName, label: groupName })),
    ],
    [],
  );

  return (
    <ChartCard
      title="Signal Screener"
      subtitle={`ACT ${nAct} · MONITOR ${nMonitor} · ${rows.length} total · effective D+${dayN}${effectiveDate ? ` (${effectiveDate})` : ''} -> +${horizon}d`}
      controls={<Select label="Group" value={group} onChange={setGroup} options={groupOptions} />}
    >
      <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/50 bg-bg-cell/20">
        This screener ranks assets by forward-return quality across the currently selected analogue set. `ACT` means high hit rate and sufficient coverage, `MONITOR` means promising but less robust, `SPLIT` means the analogue set disagrees too much on direction, and `SKIP` means the setup is too weak or sparse.
      </div>

      <div className="px-4 py-2 flex gap-4 border-b border-border/50 flex-wrap">
        <SliderControl label="Min Hit" value={minHitPct} onChange={setMinHitPct} min={0} max={100} step={5} suffix="%" />
        <SliderControl label="Min Cov" value={minCovPct} onChange={setMinCovPct} min={0} max={100} step={5} suffix="%" />
        <SliderControl label="Min R/R" value={minRR} onChange={setMinRR} min={0} max={5} step={0.1} suffix="x" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-2xs font-mono">
          <thead>
            <tr className="bg-bg-cell">
              {['Asset', 'Conviction', 'Dir', 'Median', 'Hit%', 'Coverage', 'Max DD', 'R:R', 'Split?', 'Reason'].map((header) => (
                <th key={header} className="px-2 py-1.5 text-text-muted border-b border-border font-medium text-center whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-text-dim">
                  {live.returns ? 'No signals at the current thresholds.' : 'Run L1 Config first to establish the live analogue set.'}
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.lbl} className="hover:bg-bg-hover/40 transition-colors" style={{ backgroundColor: row.convictionColor }}>
                <td className="px-2 py-1 text-left text-text-primary border-b border-border/30 whitespace-nowrap font-medium">
                  {displayLabel(assetMeta[row.lbl], row.lbl)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30 whitespace-nowrap">{row.conviction}</td>
                <td className={`px-2 py-1 text-center border-b border-border/30 ${row.med > 0 ? 'text-up' : 'text-down'}`}>{row.direction}</td>
                <td className={`px-2 py-1 text-center border-b border-border/30 font-medium ${row.med >= 0 ? 'text-up' : 'text-down'}`}>
                  {row.med >= 0 ? '+' : ''}{row.med.toFixed(2)}{row.unit}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">{(row.hitRate * 100).toFixed(0)}%</td>
                <td className="px-2 py-1 text-center border-b border-border/30">{(row.cov * 100).toFixed(0)}% (N={row.nCov})</td>
                <td className="px-2 py-1 text-center border-b border-border/30 text-down">
                  {Number.isNaN(row.maeMed) ? '—' : row.maeMed.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">
                  {Number.isNaN(row.rrRatio) ? '—' : `${row.rrRatio.toFixed(2)}x`}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">{row.bimodal ? 'YES' : 'NO'}</td>
                <td className="px-2 py-1 text-left border-b border-border/30 text-text-dim whitespace-nowrap">{row.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
