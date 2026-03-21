'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { selectEvents } from '@/engine/similarity';
import { KELLY_FRACTION, RISK_BUDGET_USD } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanMedian, nanStd, nanPercentile } from '@/lib/math';
import { fmtReturn, fmtDollar } from '@/lib/format';

function bootstrapResample(arr: number[], n: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.floor(Math.random() * arr.length)]);
  }
  return result;
}

function bootstrapStats(data: number[], numSamples = 500) {
  if (data.length === 0) return { median: NaN, p5: NaN, p95: NaN, std: NaN };
  const bootstraps = Array.from({ length: numSamples }, () =>
    nanMedian(bootstrapResample(data, data.length))
  );
  return {
    median: nanMedian(data),
    p5: nanPercentile(bootstraps, 5),
    p95: nanPercentile(bootstraps, 95),
    std: nanStd(bootstraps),
  };
}

export function ConfidenceTab() {
  const { eventReturns, assetMeta, scores, scoreCutoff, horizon, live } = useDashboard();
  const [group, setGroup] = useState(Object.keys(CUSTOM_GROUPS)[0] || 'Equities');

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const dayN = live.dayN ?? 0;

  const labels = useMemo(() => {
    return (CUSTOM_GROUPS[group] || []);
  }, [group]);

  // For each asset: collect forward returns from all selected events, bootstrap CI, Kelly
  const rows = useMemo(() => {
    const results: {
      asset: string; isRates: boolean; unit: string;
      med: number; p5: number; p95: number; bsStd: number;
      hitRate: number; bRatio: number; kellyPct: number; sugNotional: number;
      tp: number; sl: number; rr: number; n: number;
    }[] = [];

    for (const lbl of labels) {
      const meta = assetMeta[lbl];
      const isRates = meta?.is_rates_bp || false;
      const unit = unitLabel(meta);

      const fwds: number[] = [];
      for (const en of selectedEvents) {
        const atDn = poiRet(eventReturns, lbl, en, dayN);
        const atFo = poiRet(eventReturns, lbl, en, dayN + horizon);
        if (!isNaN(atDn) && !isNaN(atFo)) fwds.push(atFo - atDn);
      }
      if (fwds.length < 2) continue;

      // Bootstrap CI
      const bs = bootstrapStats(fwds);

      // Hit rate & Kelly
      const dir = bs.median >= 0 ? 1 : -1;
      const wins = fwds.filter(v => v * dir > 0);
      const losses = fwds.filter(v => v * dir < 0);
      const hitRate = wins.length / fwds.length;
      const avgWin = nanMean(wins.map(v => Math.abs(v))) || 0;
      const avgLoss = nanMean(losses.map(v => Math.abs(v))) || 1e-9;
      const bRatio = avgWin / avgLoss;
      const q = 1 - hitRate;
      const kellyRaw = bRatio > 0 ? (hitRate * bRatio - q) / bRatio : 0;
      const kellyPct = Math.max(0, Math.min(kellyRaw * KELLY_FRACTION * 100, 100));
      const sugNotional = (kellyPct / 100) * RISK_BUDGET_USD;

      // TP / SL from percentiles
      const tp = nanPercentile(fwds, 75);
      const sl = nanPercentile(fwds, 25);
      const rr = Math.abs(sl) > 0.01 ? Math.abs(tp) / Math.abs(sl) : 0;

      results.push({
        asset: lbl, isRates, unit,
        med: bs.median, p5: bs.p5, p95: bs.p95, bsStd: bs.std,
        hitRate, bRatio, kellyPct, sugNotional,
        tp, sl, rr, n: fwds.length,
      });
    }
    return results;
  }, [labels, eventReturns, assetMeta, selectedEvents, dayN, horizon]);

  const groupOptions = useMemo(() =>
    Object.keys(CUSTOM_GROUPS).sort().map(g => ({ value: g, label: g })),
    []
  );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      {/* Bootstrap CI */}
      <ChartCard
        title="Bootstrap Confidence Bands"
        subtitle={`N=500 resamples · ${selectedEvents.length} analogues · D+${dayN} → D+${dayN + horizon}`}
        controls={
          <Select label="" value={group} onChange={setGroup} options={groupOptions} />
        }
      >
        <div className="border-b border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-2xs font-mono">
              <thead>
                <tr className="bg-bg-cell/80 border-b border-border/40">
                  {['#', 'Asset', 'Median', '5th %ile', '95th %ile', 'BS Std', 'N'].map(h => (
                    <th key={h} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim text-xs">
                      No data — run matching first
                    </td>
                  </tr>
                ) : rows.map((r, i) => (
                  <tr key={r.asset} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                    <td className="px-3 py-2 text-text-dim">{i + 1}</td>
                    <td className="px-3 py-2 text-text-primary font-medium">
                      {displayLabel(assetMeta[r.asset], r.asset)}
                    </td>
                    <td className={`px-3 py-2 font-medium ${r.med >= 0 ? 'text-up' : 'text-down'}`}>
                      {fmtReturn(r.med, r.isRates)}
                    </td>
                    <td className="px-3 py-2 text-text-muted">{fmtReturn(r.p5, r.isRates)}</td>
                    <td className="px-3 py-2 text-text-muted">{fmtReturn(r.p95, r.isRates)}</td>
                    <td className="px-3 py-2 text-text-muted">{r.bsStd.toFixed(1)}</td>
                    <td className="px-3 py-2 text-text-dim">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ChartCard>

      {/* Trade Proposal */}
      <ChartCard title="Trade Proposal" subtitle="TP (75th %ile) / SL (25th %ile) from forward distribution">
        <div className="border-b border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-2xs font-mono">
              <thead>
                <tr className="bg-bg-cell/80 border-b border-border/40">
                  {['Asset', 'Dir', 'TP', 'SL', 'R:R', 'Kelly %', 'Notional'].map(h => (
                    <th key={h} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim text-xs">
                      No data available
                    </td>
                  </tr>
                ) : rows.map(r => (
                  <tr key={r.asset} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                    <td className="px-3 py-2 text-text-primary font-medium">
                      {displayLabel(assetMeta[r.asset], r.asset)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={r.med >= 0 ? 'green' : 'red'}>
                        {r.med >= 0 ? 'LONG' : 'SHORT'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-up font-medium">{fmtReturn(r.tp, r.isRates)}</td>
                    <td className="px-3 py-2 text-down font-medium">{fmtReturn(r.sl, r.isRates)}</td>
                    <td className="px-3 py-2 text-accent-teal font-medium">{r.rr.toFixed(2)}x</td>
                    <td className="px-3 py-2 text-accent-amber font-semibold">{r.kellyPct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-text-secondary font-mono">{fmtDollar(r.sugNotional)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-4 py-3 text-2xs text-text-dim bg-bg-cell/30">
          <span className="font-mono">
            f = (p·b − q)/b · {(KELLY_FRACTION * 100).toFixed(0)}%-Kelly · Budget: <span className="text-accent-teal">{fmtDollar(RISK_BUDGET_USD)}</span>
          </span>
        </div>
      </ChartCard>
    </div>
  );
}
