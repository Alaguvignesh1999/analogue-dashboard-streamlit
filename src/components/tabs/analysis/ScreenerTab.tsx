'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { selectEvents } from '@/engine/similarity';
import { nanMedian, nanMean, nanStd, corrcoef } from '@/lib/math';
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
  conviction: string;
  convColor: string;
  redundant: string;
  unit: string;
}

export function ScreenerTab() {
  const { eventReturns, assetMeta, allLabels, scores, scoreCutoff, horizon, live } = useDashboard();
  const [group, setGroup] = useState('— All Assets —');
  const [minHit, setMinHit] = useState(0.60);
  const [minCov, setMinCov] = useState(0.50);
  const [minRR, setMinRR] = useState(0.80);

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const dayN = live.dayN ?? 0;
  const fo = dayN + horizon;

  const labels = useMemo(() => {
    if (group === '— All Assets —') return allLabels;
    if (CUSTOM_GROUPS[group]) return CUSTOM_GROUPS[group].filter(l => allLabels.includes(l));
    return allLabels.filter(l => assetMeta[l]?.class === group);
  }, [group, allLabels, assetMeta]);

  const rows = useMemo(() => {
    const nSel = selectedEvents.length;
    if (nSel === 0 || fo <= dayN) return [];
    const result: ScreenerRow[] = [];

    for (const lbl of labels) {
      const fwdVals: number[] = [];
      for (const en of selectedEvents) {
        const sv = poiRet(eventReturns, lbl, en, dayN);
        const fv = poiRet(eventReturns, lbl, en, fo);
        if (!isNaN(sv) && !isNaN(fv)) fwdVals.push(fv - sv);
      }
      const nCov = fwdVals.length;
      const cov = nCov / Math.max(nSel, 1);
      if (nCov < 2) continue;

      const med = nanMedian(fwdVals);
      const sd = nanStd(fwdVals);
      const hitRate = fwdVals.filter(v => (med > 0 && v > 0) || (med < 0 && v < 0)).length / nCov;
      const nAgainst = fwdVals.filter(v => (med > 0 && v < 0) || (med < 0 && v > 0)).length;
      const disagreeFrac = nAgainst / Math.max(nCov, 1);
      const bimodal = disagreeFrac > 0.35 && (sd / (Math.abs(med) + 1e-9)) > 1.5;

      // Simplified MAE (median of min values per analogue path)
      const maeVals: number[] = [];
      for (const en of selectedEvents) {
        const vals: number[] = [];
        for (let o = dayN; o <= fo; o++) {
          const sv = poiRet(eventReturns, lbl, en, dayN);
          const v = poiRet(eventReturns, lbl, en, o);
          if (!isNaN(sv) && !isNaN(v)) vals.push(v - sv);
        }
        if (vals.length > 0) maeVals.push(Math.min(...vals));
      }
      const maeMed = maeVals.length > 0 ? nanMedian(maeVals) : NaN;
      const rrRatio = !isNaN(maeMed) && Math.abs(maeMed) > 1e-9 ? Math.abs(med) / Math.abs(maeMed) : NaN;

      let conviction = '🔴 Skip';
      let convColor = 'rgba(33,38,45,0.7)';
      if (hitRate >= minHit && cov >= minCov && !bimodal && (isNaN(rrRatio) || rrRatio >= minRR)) {
        if (hitRate >= 0.75 && cov >= 0.70) {
          conviction = '🟢 Act'; convColor = 'rgba(34,197,94,0.2)';
        } else {
          conviction = '🟡 Monitor'; convColor = 'rgba(245,158,11,0.15)';
        }
      } else if (bimodal) {
        conviction = '⚠️ Split'; convColor = 'rgba(239,68,68,0.12)';
      }

      result.push({
        lbl, direction: med > 0 ? '▲ Long' : '▼ Short',
        med, hitRate, cov, nCov, maeMed, rrRatio,
        disagree: disagreeFrac, bimodal, conviction, convColor,
        redundant: '', unit: unitLabel(assetMeta[lbl]),
      });
    }

    result.sort((a, b) => {
      const order: Record<string, number> = { '🟢 Act': 0, '🟡 Monitor': 1, '⚠️ Split': 2, '🔴 Skip': 3 };
      const d = (order[a.conviction] ?? 4) - (order[b.conviction] ?? 4);
      return d !== 0 ? d : b.hitRate - a.hitRate;
    });

    return result;
  }, [labels, eventReturns, assetMeta, selectedEvents, dayN, fo, minHit, minCov, minRR, horizon]);

  const nAct = rows.filter(r => r.conviction === '🟢 Act').length;
  const nMon = rows.filter(r => r.conviction === '🟡 Monitor').length;

  const groupOptions = [
    { value: '— All Assets —', label: '— All Assets —' },
    ...Object.keys(CUSTOM_GROUPS).sort().map(g => ({ value: g, label: g })),
  ];

  return (
    <ChartCard
      title="Signal Screener"
      subtitle={`🟢 Act: ${nAct} · 🟡 Monitor: ${nMon} · ${rows.length} total · +${horizon}d`}
      controls={
        <div className="flex items-center gap-3 flex-wrap">
          <Select label="Group" value={group} onChange={setGroup} options={groupOptions} />
        </div>
      }
    >
      <div className="px-4 py-2 flex gap-4 border-b border-border/50">
        <SliderControl label="Min Hit%" value={minHit} onChange={setMinHit} min={0} max={1} step={0.05} suffix="%" />
        <SliderControl label="Min Cov" value={minCov} onChange={setMinCov} min={0} max={1} step={0.05} />
        <SliderControl label="Min R/R" value={minRR} onChange={setMinRR} min={0} max={5} step={0.1} suffix="x" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-2xs font-mono">
          <thead>
            <tr className="bg-bg-cell">
              {['Asset','Conviction','Dir','Median','Hit%','Coverage','Max DD','R/R','Split?'].map(h => (
                <th key={h} className="px-2 py-1.5 text-text-muted border-b border-border font-medium text-center whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-text-dim">
                {live.returns ? 'No signals at current thresholds' : '← Run L1 Config first'}
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.lbl} className="hover:bg-bg-hover/40 transition-colors" style={{ backgroundColor: r.convColor }}>
                <td className="px-2 py-1 text-left text-text-primary border-b border-border/30 whitespace-nowrap font-medium">
                  {displayLabel(assetMeta[r.lbl], r.lbl)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30 whitespace-nowrap">{r.conviction}</td>
                <td className={`px-2 py-1 text-center border-b border-border/30 ${r.med > 0 ? 'text-up' : 'text-down'}`}>{r.direction}</td>
                <td className={`px-2 py-1 text-center border-b border-border/30 font-medium ${r.med >= 0 ? 'text-up' : 'text-down'}`}>
                  {r.med >= 0 ? '+' : ''}{r.med.toFixed(2)}{r.unit}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">{(r.hitRate * 100).toFixed(0)}%</td>
                <td className="px-2 py-1 text-center border-b border-border/30">{(r.cov * 100).toFixed(0)}% (N={r.nCov})</td>
                <td className="px-2 py-1 text-center border-b border-border/30 text-down">
                  {isNaN(r.maeMed) ? '—' : r.maeMed.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">
                  {isNaN(r.rrRatio) ? '—' : `${r.rrRatio.toFixed(2)}x`}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">
                  {r.bimodal ? '⚠️ Split' : '✓'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
