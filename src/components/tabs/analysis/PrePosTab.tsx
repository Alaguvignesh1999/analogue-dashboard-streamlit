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
  coverage: number;
}

type SortMode = 'median' | 'consistency' | 'coverage';

export function PrePosTab() {
  const { eventReturns, assetMeta, activeEvents } = useDashboard();

  const [preWindow, setPreWindow] = useState(10);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('median');

  const metrics = useMemo(() => {
    const results: PrePosMetrics[] = [];
    const eventCount = activeEvents?.size || 0;

    if (!eventReturns || !assetMeta || !activeEvents || eventCount === 0) {
      return results;
    }

    let assetsToAnalyze = Object.keys(assetMeta);
    if (selectedClass !== 'all') {
      const classAssets = CUSTOM_GROUPS[selectedClass] || [];
      assetsToAnalyze = assetsToAnalyze.filter((asset) => classAssets.includes(asset));
    }

    for (const asset of assetsToAnalyze) {
      const preReturns: number[] = [];
      const directions: number[] = [];

      for (const eventName of activeEvents) {
        const atZero = poiRet(eventReturns, asset, eventName, 0);
        const atPre = poiRet(eventReturns, asset, eventName, -preWindow);
        if (Number.isNaN(atZero) || Number.isNaN(atPre)) continue;

        const preReturn = atZero - atPre;
        preReturns.push(preReturn);
        directions.push(preReturn > 0 ? 1 : preReturn < 0 ? -1 : 0);
      }

      if (preReturns.length < 2) continue;

      const median = nanMedian(preReturns);
      const mean = nanMean(preReturns);
      const std = nanStd(preReturns);
      const consistentCount = directions.filter((direction) => direction !== 0).length;
      const directionConsistency = consistentCount > 0
        ? (directions.filter((direction) => direction === Math.sign(median)).length / consistentCount) * 100
        : 0;
      const coverage = preReturns.length / eventCount;

      let trend: 'bullish' | 'neutral' | 'bearish' = 'neutral';
      if (median > 0.5) trend = 'bullish';
      else if (median < -0.5) trend = 'bearish';

      results.push({
        asset,
        label: displayLabel(assetMeta[asset], asset),
        medianReturn: median,
        meanReturn: mean,
        stdReturn: std,
        directionConsistency,
        trend,
        sampleSize: preReturns.length,
        coverage,
      });
    }

    return results.sort((left, right) => {
      if (sortMode === 'consistency') return right.directionConsistency - left.directionConsistency;
      if (sortMode === 'coverage') return right.coverage - left.coverage;
      return right.medianReturn - left.medianReturn;
    });
  }, [activeEvents, assetMeta, eventReturns, preWindow, selectedClass, sortMode]);

  const classOptions = useMemo(() => {
    const options = [{ label: 'All Assets', value: 'all' }];
    for (const groupName of Object.keys(CUSTOM_GROUPS)) {
      options.push({ label: groupName, value: groupName });
    }
    return options;
  }, []);

  const sortOptions = useMemo(
    () => [
      { label: 'Median Return', value: 'median' },
      { label: 'Consistency', value: 'consistency' },
      { label: 'Coverage', value: 'coverage' },
    ],
    [],
  );

  const stats = useMemo(() => {
    if (metrics.length === 0) return { bullish: 0, bearish: 0, avgConsistency: 0, avgCoverage: 0 };
    const bullish = metrics.filter((metric) => metric.trend === 'bullish').length;
    const bearish = metrics.filter((metric) => metric.trend === 'bearish').length;
    const avgConsistency = metrics.reduce((sum, metric) => sum + metric.directionConsistency, 0) / metrics.length;
    const avgCoverage = metrics.reduce((sum, metric) => sum + metric.coverage, 0) / metrics.length;
    return { bullish, bearish, avgConsistency, avgCoverage };
  }, [metrics]);

  const formatMetric = (value: number, assetId: string) => {
    const isRates = assetMeta?.[assetId]?.is_rates_bp ?? false;
    return fmtReturn(value, isRates, 2);
  };

  return (
    <ChartCard
      title="Pre-Positioning Analysis"
      subtitle={`Historical move from D-${preWindow} to D0 across ${(activeEvents?.size || 0)} active events`}
    >
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="text-2xs text-text-dim border border-border/40 bg-bg-cell/30 px-3 py-2">
          This table asks a simple question: before past events in the current active set, which assets were already moving in a consistent direction into Day 0? Higher coverage and higher directional consistency are more trustworthy than a large median move on a tiny sample.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SliderControl
            label={`Window ${preWindow}D`}
            value={preWindow}
            onChange={setPreWindow}
            min={1}
            max={63}
            step={1}
          />
          <Select label="Asset Class" value={selectedClass} onChange={setSelectedClass} options={classOptions} />
          <Select label="Sort" value={sortMode} onChange={(value) => setSortMode(value as SortMode)} options={sortOptions} />
        </div>

        {metrics.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-text-dim">
            No pre-positioning data available for the selected settings.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Bullish" value={stats.bullish} sub={`${((stats.bullish / metrics.length) * 100).toFixed(0)}%`} color="#22c55e" />
              <StatBox label="Bearish" value={stats.bearish} sub={`${((stats.bearish / metrics.length) * 100).toFixed(0)}%`} color="#ef4444" />
              <StatBox label="Avg Consistency" value={stats.avgConsistency.toFixed(0)} sub="%" color="#f59e0b" />
              <StatBox label="Avg Coverage" value={`${(stats.avgCoverage * 100).toFixed(0)}%`} sub="of events" color="#00d4aa" />
            </div>

            <div className="overflow-x-auto border border-border/40 rounded-sm">
              <table className="w-full text-2xs font-mono">
                <thead>
                  <tr className="border-b border-border/40 bg-bg-cell/80">
                    <th className="px-3 py-2 text-left text-text-muted">Asset</th>
                    <th className="px-3 py-2 text-right text-text-muted">Median</th>
                    <th className="px-3 py-2 text-right text-text-muted">Mean</th>
                    <th className="px-3 py-2 text-right text-text-muted">Std Dev</th>
                    <th className="px-3 py-2 text-right text-text-muted">Consistency</th>
                    <th className="px-3 py-2 text-right text-text-muted">Coverage</th>
                    <th className="px-3 py-2 text-center text-text-muted">Trend</th>
                    <th className="px-3 py-2 text-center text-text-muted">N</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric) => {
                    const trendColor = metric.trend === 'bullish'
                      ? 'bg-bg-cell/40 border-l-2 border-l-[#22c55e]'
                      : metric.trend === 'bearish'
                        ? 'bg-bg-cell/40 border-l-2 border-l-[#ef4444]'
                        : '';
                    const returnColor = metric.medianReturn > 0.5
                      ? 'text-[#22c55e]'
                      : metric.medianReturn < -0.5
                        ? 'text-[#ef4444]'
                        : 'text-text-muted';
                    const consistencyColor = metric.directionConsistency >= 70
                      ? 'text-[#22c55e]'
                      : metric.directionConsistency >= 50
                        ? 'text-[#f59e0b]'
                        : 'text-[#ef4444]';
                    return (
                      <tr key={metric.asset} className={`border-b border-border/20 hover:bg-bg-hover/20 transition-colors ${trendColor}`}>
                        <td className="px-3 py-2 text-text-secondary">{metric.label}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatMetric(metric.medianReturn, metric.asset)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatMetric(metric.meanReturn, metric.asset)}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-muted">{formatMetric(metric.stdReturn, metric.asset)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${consistencyColor}`}>{metric.directionConsistency.toFixed(0)}%</td>
                        <td className="px-3 py-2 text-right font-mono text-text-muted">{(metric.coverage * 100).toFixed(0)}%</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-2xs font-semibold ${
                            metric.trend === 'bullish'
                              ? 'bg-[#22c55e]/20 text-[#22c55e]'
                              : metric.trend === 'bearish'
                                ? 'bg-[#ef4444]/20 text-[#ef4444]'
                                : 'bg-text-dim/10 text-text-muted'
                          }`}>
                            {metric.trend === 'bullish' ? 'UP' : metric.trend === 'bearish' ? 'DOWN' : 'FLAT'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-text-muted">{metric.sampleSize}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-2xs text-text-dim border-t border-border/40 pt-3 space-y-1">
              <p>Median/mean measure the move from D-{preWindow} to D0. Coverage is the share of active events with valid data for that asset.</p>
              <p className="text-text-dim/70">Treat high-consistency, high-coverage names as stronger pre-positioning evidence than an isolated large move.</p>
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
}
