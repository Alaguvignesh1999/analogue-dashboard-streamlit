'use client';
import { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { getLiveScoringDay, getLiveScoringReturns } from '@/engine/live';
import { selectEvents } from '@/engine/similarity';
import { nanMean, nanMedian, nanStd, nanPercentile, nanMin, nanMax } from '@/lib/math';
import { fmtReturn, stars, entrySignal } from '@/lib/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

const AX_TICK = '#8a8a9a';
const AX_LINE = '#2a2a3a';
const GRID_CLR = '#1e1e22';

export function DetailTab() {
  const { eventReturns, assetMeta, allClasses, scores, scoreCutoff, horizon, live } = useDashboard();

  const [selectedClass, setSelectedClass] = useState('Oil & Energy');
  const [selectedAsset, setSelectedAsset] = useState('Brent Futures');

  const classAssets = useMemo(() =>
    Object.entries(assetMeta).filter(([, m]) => m.class === selectedClass).map(([l]) => l),
    [assetMeta, selectedClass]
  );

  useEffect(() => {
    if (classAssets.length > 0 && !classAssets.includes(selectedAsset))
      setSelectedAsset(classAssets[0]);
  }, [classAssets, selectedAsset]);

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const scoringReturns = getLiveScoringReturns(live);
  const dayN = getLiveScoringDay(live);
  const meta = assetMeta[selectedAsset];
  const isRates = meta?.is_rates_bp || false;
  const unit = unitLabel(meta);

  // Compute forward returns for each selected event
  const { fwdVals, barData, stats } = useMemo(() => {
    const fo = dayN + horizon;
    const vals: { event: string; fwd: number }[] = [];
    for (const en of selectedEvents) {
      const atDn = poiRet(eventReturns, selectedAsset, en, dayN);
      const atFo = poiRet(eventReturns, selectedAsset, en, fo);
      if (!isNaN(atDn) && !isNaN(atFo)) vals.push({ event: en, fwd: atFo - atDn });
    }
    const fwds = vals.map(v => v.fwd);
    const med = nanMedian(fwds);
    const mean = nanMean(fwds);
    const std = nanStd(fwds);
    const iqr = nanPercentile(fwds, 75) - nanPercentile(fwds, 25);
    const hitRate = fwds.length > 0 ? fwds.filter(v => (med >= 0 ? v > 0 : v < 0)).length / fwds.length : 0;
    const dir = med >= 0 ? 1 : -1;
    const sharpe = nanMean(fwds.map(v => v * dir)) / (nanStd(fwds.map(v => v * dir)) + 1e-9);

    // Live deviation
    let liveRet = NaN;
    if (scoringReturns?.[selectedAsset]) {
      const lrDn = scoringReturns[selectedAsset][dayN];
      const lrFo = scoringReturns[selectedAsset][fo];
      if (lrDn !== undefined && lrFo !== undefined) liveRet = lrFo - lrDn;
      else if (lrDn !== undefined) {
        const latestOffset = Math.max(...Object.keys(scoringReturns[selectedAsset]).map(Number));
        liveRet = (scoringReturns[selectedAsset][latestOffset] ?? 0) - lrDn;
      }
    }

    return {
      fwdVals: vals,
      barData: vals.map(v => ({ name: v.event.length > 14 ? v.event.slice(0, 14) + '…' : v.event, value: v.fwd })),
      stats: { med, mean, std, iqr, hitRate, sharpe, worst: nanMin(fwds), best: nanMax(fwds), rating: stars(iqr, med), n: fwds.length, liveRet },
    };
  }, [dayN, eventReturns, horizon, scoringReturns, selectedAsset, selectedEvents]);

  const signal = entrySignal(isNaN(stats.liveRet) ? null : (stats.liveRet / (stats.iqr + 1e-9)) * 50 + 50);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title={`Detail — ${displayLabel(meta, selectedAsset)}`}
        subtitle={`D+${dayN} → +${horizon}d (D+${dayN + horizon}) · ${selectedEvents.length} analogues`}
        controls={
          <div className="flex items-center gap-2">
            <Select label="" value={selectedClass} onChange={setSelectedClass}
              options={allClasses.map(c => ({ value: c, label: c }))} />
            <Select label="" value={selectedAsset} onChange={setSelectedAsset}
              options={classAssets.map(a => ({ value: a, label: displayLabel(assetMeta[a], a) }))} />
          </div>
        }
      >
        {selectedEvents.length === 0 ? (
          <div className="py-12 text-center text-text-dim text-sm">
            No analogues selected. Adjust cutoff or run matching.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary stats grid */}
            <div className="px-4 pt-4 grid grid-cols-4 gap-2">
              <StatBox
                label="Median"
                value={fmtReturn(stats.med, isRates)}
                color={stats.med >= 0 ? '#22c55e' : '#ef4444'}
              />
              <StatBox
                label="Mean"
                value={fmtReturn(stats.mean, isRates)}
                color="#00d4aa"
              />
              <StatBox
                label="Hit Rate"
                value={`${(stats.hitRate * 100).toFixed(0)}%`}
                color={stats.hitRate >= 0.6 ? '#22c55e' : stats.hitRate >= 0.4 ? '#fbbf24' : '#ef4444'}
              />
              <StatBox
                label="Sharpe"
                value={stats.sharpe.toFixed(2)}
                color={stats.sharpe > 0.5 ? '#22c55e' : '#8a8a9a'}
              />
              <StatBox
                label="Std Dev"
                value={stats.std.toFixed(2)}
                color="#8a8a9a"
              />
              <StatBox
                label="IQR"
                value={stats.iqr.toFixed(2)}
                color="#8a8a9a"
              />
              <StatBox
                label="Best"
                value={fmtReturn(stats.best, isRates)}
                color="#22c55e"
              />
              <StatBox
                label="Worst"
                value={fmtReturn(stats.worst, isRates)}
                color="#ef4444"
              />
            </div>

            {/* Bar chart */}
            <div className="h-[320px] p-2">
              {barData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-text-dim text-sm">
                  No forward return data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 8, right: 12, bottom: 48, left: 8 }}>
                    <CartesianGrid stroke={GRID_CLR} strokeDasharray="2 8" />
                    <XAxis dataKey="name" stroke={AX_LINE}
                      tick={{ fontSize: 9, fill: AX_TICK, fontFamily: 'JetBrains Mono' }}
                      angle={-40} textAnchor="end" height={80} />
                    <YAxis stroke={AX_LINE}
                      tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }}
                      tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`}
                      width={44} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(12,12,18,0.96)', border: '1px solid #2a2a3a', borderRadius: 2, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                      formatter={(v: any) => [fmtReturn(Number(v), isRates), 'Forward']}
                      labelFormatter={(name: string) => name}
                    />
                    <ReferenceLine y={0} stroke="#3a3a4e" strokeWidth={1} />
                    <ReferenceLine y={stats.med} stroke="#00d4aa" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Med', position: 'insideTopRight', offset: -5, fill: '#00d4aa', fontSize: 9 }} />
                    {!isNaN(stats.liveRet) && (
                      <ReferenceLine y={stats.liveRet} stroke="#ffab40" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'Live', position: 'insideTopLeft', offset: -5, fill: '#ffab40', fontSize: 9 }} />
                    )}
                    <Bar dataKey="value" radius={[3, 3, 0, 0]} animationDuration={300}>
                      {barData.map((d, i) => (
                        <Cell key={i} fill={d.value >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.75} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Signal + metadata footer */}
            <div className="px-4 py-3 border-t border-border/30 space-y-2">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-text-dim">Signal:</span>
                  <Badge color={
                    signal.label === 'STRONG BUY' ? 'green' :
                    signal.label === 'BUY' ? 'green' :
                    signal.label === 'SELL' ? 'red' :
                    signal.label === 'STRONG SELL' ? 'red' : 'dim'
                  }>
                    {signal.label}
                  </Badge>
                </div>
                <span className="text-2xs text-text-dim">Convergence: {stats.rating}</span>
                <span className="text-2xs text-text-dim">Events: {stats.n}/{selectedEvents.length}</span>
                {!isNaN(stats.liveRet) && (
                  <span className="text-2xs">
                    <span className="text-text-dim">Live: </span>
                    <span className={stats.liveRet >= 0 ? 'text-up' : 'text-down'} style={{ fontWeight: 500 }}>
                      {fmtReturn(stats.liveRet, isRates)}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
