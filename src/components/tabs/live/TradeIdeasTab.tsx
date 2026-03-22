'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, Button } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { getLiveScoringDay, getLiveScoringReturns } from '@/engine/live';
import { selectEvents } from '@/engine/similarity';
import { nanMedian, nanMean, nanStd, nanPercentile } from '@/lib/math';
import { stars, statusFromPctile, fmtReturn } from '@/lib/format';
import { POIS } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';

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
  liveReturns: Record<string, Record<number, number>> | null,
): TradeRow[] {
  const nSel = selectedEvents.length;
  const fo = dayN + fwdDays;
  if (fo <= dayN) return [];

  const rows: TradeRow[] = [];

  for (const lbl of labels) {
    const fwdVals: number[] = [];
    for (const en of selectedEvents) {
      const sv = poiRet(eventReturns, lbl, en, dayN);
      const fv = poiRet(eventReturns, lbl, en, fo);
      if (!isNaN(sv) && !isNaN(fv)) fwdVals.push(fv - sv);
    }
    if (fwdVals.length < 2) continue;

    const med = nanMedian(fwdVals);
    const mn = nanMean(fwdVals);
    const sd = nanStd(fwdVals);
    const iqr = nanPercentile(fwdVals, 75) - nanPercentile(fwdVals, 25);
    const unit = unitLabel(assetMeta[lbl]);

    const hitRate = fwdVals.filter(v =>
      (med > 0 && v > 0) || (med < 0 && v < 0)
    ).length / fwdVals.length;

    // Direction-adjusted metrics
    const dir = med >= 0 ? 1 : -1;
    const adjVals = fwdVals.map(v => dir * v);
    const mnAdj = nanMean(adjVals);
    const sdAdj = nanStd(adjVals);
    const sharpe = mnAdj / (sdAdj + 1e-9);
    const downVals = adjVals.filter(v => v < 0);
    const dsd = downVals.length > 1 ? nanStd(downVals) : sdAdj + 1e-9;
    const sortino = mnAdj / (dsd + 1e-9);
    const worst = Math.min(...adjVals);

    // Skewness
    let skew = 0;
    if (fwdVals.length >= 3) {
      const m = nanMean(fwdVals);
      const s = nanStd(fwdVals);
      if (s > 0) {
        skew = fwdVals.reduce((sum, v) => sum + ((v - m) / s) ** 3, 0) / fwdVals.length;
      }
    }

    // Live deviation
    let liveGap = NaN;
    let livePctile = NaN;
    if (liveReturns?.[lbl]) {
      const lr = liveReturns[lbl];
      const liveRetDn = lr[dayN];
      if (liveRetDn !== undefined) {
        const histAtDn: number[] = [];
        for (const en of selectedEvents) {
          const v = poiRet(eventReturns, lbl, en, dayN);
          if (!isNaN(v)) histAtDn.push(v);
        }
        if (histAtDn.length >= 2) {
          liveGap = liveRetDn - nanMedian(histAtDn);
          livePctile = (histAtDn.filter(v => liveRetDn > v).length / histAtDn.length) * 100;
        }
      }
    }

    const meta = assetMeta[lbl] || {};
    rows.push({
      lbl,
      cls: meta.class || '',
      ticker: meta.ticker || '',
      dir: med >= 0 ? 'LONG' : 'SHORT',
      med, mean: mn, std: sd, iqr,
      stars: stars(iqr, med),
      n: fwdVals.length,
      nTotal: nSel,
      unit,
      hitRate, sharpe, sortino, skew, worst,
      liveGap, livePctile,
      status: statusFromPctile(livePctile),
      fwdVals,
    });
  }

  rows.sort((a, b) => b.sharpe - a.sharpe);
  return rows;
}

export function TradeIdeasTab() {
  const {
    eventReturns, assetMeta, allLabels, scores, scoreCutoff, horizon, live
  } = useDashboard();

  const [group, setGroup] = useState('— All Assets —');

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const scoringReturns = getLiveScoringReturns(live);
  const dayN = getLiveScoringDay(live);

  const labels = useMemo(() => {
    if (group === '— All Assets —') return allLabels;
    if (CUSTOM_GROUPS[group]) return CUSTOM_GROUPS[group].filter(l => allLabels.includes(l));
    return allLabels.filter(l => assetMeta[l]?.class === group);
  }, [group, allLabels, assetMeta]);

  const rows = useMemo(() =>
    computeTradeRows(labels, eventReturns, assetMeta, selectedEvents, dayN, horizon, scoringReturns),
    [labels, eventReturns, assetMeta, selectedEvents, dayN, horizon, scoringReturns]
  );

  const groupOptions = useMemo(() => [
    { value: '— All Assets —', label: '— All Assets —' },
    ...Object.keys(CUSTOM_GROUPS).sort().map(g => ({ value: g, label: g })),
  ], []);

  return (
    <ChartCard
      title="Trade Ideas"
      subtitle={`${rows.length} ideas · Day+${dayN} → Day+${dayN + horizon} (+${horizon}d) · ${selectedEvents.length} analogues · cutoff ${scoreCutoff.toFixed(2)}`}
      controls={
        <Select label="Group" value={group} onChange={setGroup} options={groupOptions} />
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-2xs font-mono">
          <thead>
            <tr className="bg-bg-cell">
              {['#','Asset','Class','Dir',`+${horizon}d`,'Median','Hit%','Sharpe','Sortino','Skew','Worst','Gap','Pctile','Status','Conv','N'].map(h => (
                <th key={h} className="px-2 py-1.5 text-text-muted border-b border-border font-medium text-center whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-text-dim">
                  {live.returns ? 'No trade ideas at current settings' : '← Run L1 Config to pull live data first'}
                </td>
              </tr>
            ) : rows.map((r, i) => {
              const dirColor = r.dir === 'LONG' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
              return (
                <tr key={r.lbl} className="hover:bg-bg-hover/40 transition-colors" style={{ backgroundColor: dirColor }}>
                  <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{i + 1}</td>
                  <td className="px-2 py-1 text-left text-text-primary border-b border-border/30 whitespace-nowrap font-medium">
                    {displayLabel(assetMeta[r.lbl], r.lbl)}
                  </td>
                  <td className="px-2 py-1 text-center text-text-muted border-b border-border/30">{r.cls}</td>
                  <td className={`px-2 py-1 text-center font-semibold border-b border-border/30 ${r.dir === 'LONG' ? 'text-up' : 'text-down'}`}>
                    {r.dir}
                  </td>
                  <td className="px-2 py-1 text-center text-text-muted border-b border-border/30">+{horizon}d</td>
                  <td className={`px-2 py-1 text-center font-medium border-b border-border/30 ${r.med >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtReturn(r.med, r.unit === 'Δbps')}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    <span className={r.hitRate >= 0.6 ? 'text-up' : r.hitRate >= 0.5 ? 'text-accent-amber' : 'text-down'}>
                      {(r.hitRate * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className={`px-2 py-1 text-center border-b border-border/30 ${r.sharpe > 0 ? 'text-up' : 'text-down'}`}>
                    {r.sharpe.toFixed(2)}
                  </td>
                  <td className={`px-2 py-1 text-center border-b border-border/30 ${r.sortino > 0 ? 'text-up' : 'text-down'}`}>
                    {r.sortino.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-center text-text-secondary border-b border-border/30">{r.skew.toFixed(2)}</td>
                  <td className="px-2 py-1 text-center text-down border-b border-border/30">
                    {fmtReturn(r.worst, r.unit === 'Δbps')}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    {isNaN(r.liveGap) ? '—' : <span className={r.liveGap >= 0 ? 'text-up' : 'text-down'}>{r.liveGap.toFixed(1)}</span>}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30">
                    {isNaN(r.livePctile) ? '—' : `${r.livePctile.toFixed(0)}th`}
                  </td>
                  <td className="px-2 py-1 text-center border-b border-border/30 whitespace-nowrap">{r.status}</td>
                  <td className="px-2 py-1 text-center border-b border-border/30">{r.stars}</td>
                  <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{r.n}/{r.nTotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
