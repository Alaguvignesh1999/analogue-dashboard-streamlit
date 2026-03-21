'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { selectEvents } from '@/engine/similarity';
import { nanMedian, nanPercentile } from '@/lib/math';
import { entrySignal, fmtReturn } from '@/lib/format';

export function GateTab() {
  const { eventReturns, assetMeta, allLabels, scores, scoreCutoff, horizon, live } = useDashboard();

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const dayN = live.dayN ?? 0;
  const fo = dayN + horizon;

  const rows = useMemo(() => {
    if (!live.returns || fo <= dayN) return [];
    const result: any[] = [];

    for (const lbl of allLabels) {
      const fwdVals: number[] = [];
      for (const en of selectedEvents) {
        const sv = poiRet(eventReturns, lbl, en, dayN);
        const fv = poiRet(eventReturns, lbl, en, fo);
        if (!isNaN(sv) && !isNaN(fv)) fwdVals.push(fv - sv);
      }
      if (fwdVals.length < 2) continue;

      const med = nanMedian(fwdVals);
      const hitRate = fwdVals.filter(v => (med > 0 && v > 0) || (med < 0 && v < 0)).length / fwdVals.length;
      const unit = unitLabel(assetMeta[lbl]);
      const isRates = assetMeta[lbl]?.is_rates_bp || false;

      // Live pctile
      let livePctile: number | null = null;
      const lr = live.returns?.[lbl];
      if (lr && lr[dayN] !== undefined) {
        const histAtDn: number[] = [];
        for (const en of selectedEvents) {
          const v = poiRet(eventReturns, lbl, en, dayN);
          if (!isNaN(v)) histAtDn.push(v);
        }
        if (histAtDn.length >= 2) {
          livePctile = (histAtDn.filter(v => lr[dayN] > v).length / histAtDn.length) * 100;
        }
      }

      const gate = entrySignal(livePctile);
      const tp = nanPercentile(fwdVals, 75);
      const dir = med >= 0 ? 1 : -1;
      const worstAdj = Math.min(...fwdVals.map(v => dir * v));
      const rr = Math.abs(worstAdj) > 1e-6 ? Math.abs(tp) / Math.abs(worstAdj) : NaN;

      // Sharpe
      const adjVals = fwdVals.map(v => dir * v);
      const mnAdj = adjVals.reduce((a, b) => a + b, 0) / adjVals.length;
      const sdAdj = Math.sqrt(adjVals.reduce((sum, v) => sum + (v - mnAdj) ** 2, 0) / adjVals.length);
      const sharpe = mnAdj / (sdAdj + 1e-9);

      result.push({
        lbl, dir: med >= 0 ? 'LONG' : 'SHORT',
        med, hitRate, sharpe, unit, isRates,
        tp, sl: worstAdj, rr,
        livePctile, gate,
        n: fwdVals.length, nTotal: selectedEvents.length,
      });
    }

    result.sort((a: any, b: any) => b.sharpe - a.sharpe);
    return result;
  }, [allLabels, eventReturns, assetMeta, selectedEvents, dayN, fo, horizon, live.returns]);

  return (
    <ChartCard
      title="Entry / Exit Gate"
      subtitle={`${live.name || 'No event'} · Day+${dayN} → +${dayN + horizon} · ${selectedEvents.length} analogues · 🟢 ENTER <33rd · 🟡 HALF 33-66th · 🟠 LATE 66-85th · 🔴 SKIP >85th`}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-2xs font-mono">
          <thead>
            <tr className="bg-bg-cell">
              {['#','Asset','Dir','Gate','Median','Hit%','Sharpe',`TP +${horizon}d`,`SL +${horizon}d`,'R:R','Pctile','N'].map(h => (
                <th key={h} className="px-2 py-1.5 text-text-muted border-b border-border font-medium text-center whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-text-dim">
                {live.returns ? 'No trades — adjust cutoff or horizon' : '← Run L1 Config + L2 Analogues first'}
              </td></tr>
            ) : rows.map((r: any, i: number) => (
              <tr key={r.lbl} className="hover:bg-bg-hover/40 transition-colors" style={{ backgroundColor: r.gate.bg }}>
                <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{i + 1}</td>
                <td className="px-2 py-1 text-left text-text-primary border-b border-border/30 whitespace-nowrap font-medium">
                  {displayLabel(assetMeta[r.lbl], r.lbl)}
                </td>
                <td className={`px-2 py-1 text-center font-semibold border-b border-border/30 ${r.dir === 'LONG' ? 'text-up' : 'text-down'}`}>
                  {r.dir}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30 whitespace-nowrap" style={{ color: r.gate.color }}>
                  {r.gate.label}
                </td>
                <td className={`px-2 py-1 text-center font-medium border-b border-border/30 ${r.med >= 0 ? 'text-up' : 'text-down'}`}>
                  {fmtReturn(r.med, r.isRates)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">
                  <span className={r.hitRate >= 0.6 ? 'text-up' : 'text-text-secondary'}>
                    {(r.hitRate * 100).toFixed(0)}%
                  </span>
                </td>
                <td className={`px-2 py-1 text-center border-b border-border/30 ${r.sharpe > 0 ? 'text-up' : 'text-down'}`}>
                  {r.sharpe.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30 text-up">
                  {fmtReturn(r.tp, r.isRates)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30 text-down">
                  {fmtReturn(r.sl, r.isRates)}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">
                  {isNaN(r.rr) ? '—' : `${r.rr.toFixed(2)}x`}
                </td>
                <td className="px-2 py-1 text-center border-b border-border/30">
                  {r.livePctile !== null ? `${r.livePctile.toFixed(0)}th` : '—'}
                </td>
                <td className="px-2 py-1 text-center text-text-dim border-b border-border/30">{r.n}/{r.nTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
