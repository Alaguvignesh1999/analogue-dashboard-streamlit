'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl, StatBox } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanMedian, nanStd } from '@/lib/math';
import { fmtReturn } from '@/lib/format';

interface PrePosMetrics {
  asset: string;
  label: string;
  medianReturn: number;
  meanReturn: number;
  stdReturn: number;
  directionConsistency: number;
  trend: 'bullish' | 'neutral' | 'bearish';
  sampleSize: number;
}

export function PrePosTab() {
  const {
    eventReturns,
    assetMeta,
    activeEvents,
  } = useDashboard();

  const [preWindow, setPreWindow] = useState(10);
  const [selectedClass, setSelectedClass] = useState<string>('all');

  const metrics = useMemo(() => {
    const results: PrePosMetrics[] = [];

    if (!eventReturns || !assetMeta || !activeEvents || activeEvents.size === 0) {
      return results;
    }

    let assetsToAnalyze = Object.keys(assetMeta);
    if (selectedClass !== 'all') {
      const classAssets = CUSTOM_GROUPS[selectedClass] || [];
      assetsToAnalyze = assetsToAnalyze.filter((a) => classAssets.includes(a));
    }

    for (const asset of assetsToAnalyze) {
      const preReturns: number[] = [];
      const directions: number[] = [];

      for (const eventName of activeEvents) {
        const atZero = poiRet(eventReturns, asset, eventName, 0);
        const atPre = poiRet(eventReturns, asset, eventName, -preWindow);

        if (isNaN(atZero) || isNaN(atPre)) {
          continue;
        }

        const preReturn = atZero - atPre;
        preReturns.push(preReturn);

        directions.push(preReturn > 0 ? 1 : preReturn < 0 ? -1 : 0);
      }

      if (preReturns.length === 0) continue;

      const median = nanMedian(preReturns);
      const mean = nanMean(preReturns);
      const std = nanStd(preReturns);

      const consistentCount = directions.filter((d) => d !== 0).length;
      const directionConsistency =
        consistentCount > 0 ? (directions.filter((d) => d === Math.sign(median)).length / consistentCount) * 100 : 0;

      let trend: 'bullish' | 'neutral' | 'bearish' = 'neutral';
      if (median > 0.5) trend = 'bullish';
      else if (median < -0.5) trend = 'bearish';

      const meta = assetMeta[asset];
      results.push({
        asset,
        label: displayLabel(meta, asset),
        medianReturn: median,
        meanReturn: mean,
        stdReturn: std,
        directionConsistency,
        trend,
        sampleSize: preReturns.length,
      });
    }

    return results.sort((a, b) => b.medianReturn - a.medianReturn);
  }, [eventReturns, assetMeta, activeEvents, preWindow, selectedClass]);

  const classOptions = useMemo(() => {
    const opts = [{ label: 'All Assets', value: 'all' }];
    Object.keys(CUSTOM_GROUPS).forEach((cls) => {
      opts.push({ label: cls, value: cls });
    });
    return opts;
  }, []);

  const formatReturn = (value: number, assetId: string): string => {
    const meta = assetMeta?.[assetId];
    const isRates = meta?.is_rates_bp ?? false;
    return fmtReturn(value, isRates, 2);
  };

  const stats = useMemo(() => {
    if (metrics.length === 0) return { bullish: 0, bearish: 0, avgConsistency: 0 };
    const bullish = metrics.filter((m) => m.trend === 'bullish').length;
    const bearish = metrics.filter((m) => m.trend === 'bearish').length;
    const avgConsistency = metrics.reduce((sum, m) => sum + m.directionConsistency, 0) / metrics.length;
    return { bullish, bearish, avgConsistency };
  }, [metrics]);

  return (
    <ChartCard
      title="Pre-Positioning Analysis"
      subtitle={`Pre-event momentum in ${preWindow}D window before Day 0`}
    >
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SliderControl
            label={`Window: ${preWindow}D`}
            value={preWindow}
            onChange={setPreWindow}
            min={1}
            max={63}
            step={1}
          />
          <Select
            label="Asset Class"
            value={selectedClass}
            onChange={setSelectedClass}
            options={classOptions}
          />
        </div>

        {metrics.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-text-dim">
            No data available for selected parameters
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatBox
                label="Bullish"
                value={stats.bullish}
                sub={`${((stats.bullish / metrics.length) * 100).toFixed(0)}%`}
                color="#22c55e"
              />
              <StatBox
                label="Bearish"
                value={stats.bearish}
                sub={`${((stats.bearish / metrics.length) * 100).toFixed(0)}%`}
                color="#ef4444"
              />
              <StatBox
                label="Avg Consistency"
                value={stats.avgConsistency.toFixed(0)}
                sub="%"
                color="#f59e0b"
              />
            </div>

            <div className="overflow-x-auto border border-border/40 rounded-sm">
              <table className="w-full text-2xs font-mono">
                <thead>
                  <tr className="border-b border-border/40 bg-bg-cell/80">
                    <th className="px-3 py-2 text-left text-text-muted">Asset</th>
                    <th className="px-3 py-2 text-right text-text-muted">Median Ret</th>
                    <th className="px-3 py-2 text-right text-text-muted">Mean</th>
                    <th className="px-3 py-2 text-right text-text-muted">Std Dev</th>
                    <th className="px-3 py-2 text-right text-text-muted">Consistency</th>
                    <th className="px-3 py-2 text-center text-text-muted">Trend</th>
                    <th className="px-3 py-2 text-center text-text-muted">N</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => {
                    const trendColor = m.trend === 'bullish' ? 'bg-bg-cell/40 border-l-2 border-l-[#22c55e]' : m.trend === 'bearish' ? 'bg-bg-cell/40 border-l-2 border-l-[#ef4444]' : '';
                    const returnColor = m.medianReturn > 0.5 ? 'text-[#22c55e]' : m.medianReturn < -0.5 ? 'text-[#ef4444]' : 'text-text-muted';
                    const consistencyColor = m.directionConsistency >= 70 ? 'text-[#22c55e]' : m.directionConsistency >= 50 ? 'text-[#f59e0b]' : 'text-[#ef4444]';
                    return (
                      <tr key={m.asset} className={`border-b border-border/20 hover:bg-bg-hover/20 transition-colors ${trendColor}`}>
                        <td className="px-3 py-2 text-text-secondary">{m.label}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatReturn(m.medianReturn, m.asset)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatReturn(m.meanReturn, m.asset)}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-muted">{formatReturn(m.stdReturn, m.asset)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${consistencyColor}`}>{m.directionConsistency.toFixed(0)}%</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-2xs font-semibold ${
                            m.trend === 'bullish'
                              ? 'bg-[#22c55e]/20 text-[#22c55e]'
                              : m.trend === 'bearish'
                                ? 'bg-[#ef4444]/20 text-[#ef4444]'
                                : 'bg-text-dim/10 text-text-muted'
                          }`}>
                            {m.trend === 'bullish' ? '↑' : m.trend === 'bearish' ? '↓' : '−'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-text-muted">{m.sampleSize}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-2xs text-text-dim border-t border-border/40 pt-3 space-y-1">
              <p>Median returns from {preWindow} days before Day 0 to Day 0 across {activeEvents?.size || 0} events.</p>
              <p className="text-text-dim/70">Consistency shows % of events with same directional move as median.</p>
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
}
