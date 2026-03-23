'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, SliderControl, StatBox, Badge } from '@/components/ui/ChartCard';
import { displayLabel, poiRet } from '@/engine/returns';
import { ALL_ASSETS_OPTION, getGroupLabels, groupOptionsFromData } from '@/config/assets';
import { nanMean, nanMedian, nanStd } from '@/lib/math';
import { fmtReturn } from '@/lib/format';

interface PrePosMetrics {
  asset: string;
  label: string;
  medianReturn: number;
  meanReturn: number;
  stdReturn: number;
  signalScore: number;
  directionConsistency: number;
  trend: 'bullish' | 'neutral' | 'bearish';
  sampleSize: number;
  coverage: number;
}

type SortMode = 'score' | 'consistency' | 'coverage' | 'median';

export function PrePosTab() {
  const { eventReturns, assetMeta, activeEvents, allLabels, allClasses } = useDashboard();

  const [preWindow, setPreWindow] = useState(10);
  const [selectedGroup, setSelectedGroup] = useState<string>(ALL_ASSETS_OPTION);
  const [sortMode, setSortMode] = useState<SortMode>('score');

  const labels = useMemo(
    () => getGroupLabels(selectedGroup, allLabels, assetMeta),
    [selectedGroup, allLabels, assetMeta],
  );

  const metrics = useMemo(() => {
    const results: PrePosMetrics[] = [];
    const eventCount = activeEvents?.size || 0;

    if (!eventReturns || !assetMeta || !activeEvents || eventCount === 0) {
      return results;
    }

    for (const asset of labels) {
      const preReturns: number[] = [];
      const scaledMoves: number[] = [];
      const directions: number[] = [];

      for (const eventName of activeEvents) {
        const atZero = poiRet(eventReturns, asset, eventName, 0);
        const atPre = poiRet(eventReturns, asset, eventName, -preWindow);
        if (Number.isNaN(atZero) || Number.isNaN(atPre)) continue;

        const preReturn = atZero - atPre;
        const stepMoves: number[] = [];
        for (let offset = -preWindow + 1; offset <= 0; offset += 1) {
          const prev = poiRet(eventReturns, asset, eventName, offset - 1);
          const cur = poiRet(eventReturns, asset, eventName, offset);
          if (!Number.isNaN(prev) && !Number.isNaN(cur)) {
            stepMoves.push(cur - prev);
          }
        }

        const preVol = nanStd(stepMoves);
        if (Number.isNaN(preVol) || preVol <= 1e-9) continue;

        preReturns.push(preReturn);
        scaledMoves.push(preReturn / preVol);
        directions.push(preReturn > 0 ? 1 : preReturn < 0 ? -1 : 0);
      }

      if (preReturns.length < 2 || scaledMoves.length < 2) continue;

      const median = nanMedian(preReturns);
      const mean = nanMean(preReturns);
      const std = nanStd(preReturns);
      const signalScore = nanMedian(scaledMoves);
      const consistentCount = directions.filter((direction) => direction !== 0).length;
      const directionConsistency = consistentCount > 0
        ? (directions.filter((direction) => direction === Math.sign(median)).length / consistentCount) * 100
        : 0;
      const coverage = preReturns.length / eventCount;

      let trend: 'bullish' | 'neutral' | 'bearish' = 'neutral';
      if (signalScore > 0.5) trend = 'bullish';
      else if (signalScore < -0.5) trend = 'bearish';

      results.push({
        asset,
        label: displayLabel(assetMeta[asset], asset),
        medianReturn: median,
        meanReturn: mean,
        stdReturn: std,
        signalScore,
        directionConsistency,
        trend,
        sampleSize: preReturns.length,
        coverage,
      });
    }

    return results.sort((left, right) => {
      if (sortMode === 'consistency') return right.directionConsistency - left.directionConsistency;
      if (sortMode === 'coverage') return right.coverage - left.coverage;
      if (sortMode === 'median') return Math.abs(right.medianReturn) - Math.abs(left.medianReturn);
      return Math.abs(right.signalScore) - Math.abs(left.signalScore);
    });
  }, [activeEvents, assetMeta, eventReturns, labels, preWindow, sortMode]);

  const groupOptions = useMemo(() => groupOptionsFromData(allClasses), [allClasses]);
  const sortOptions = useMemo(
    () => [
      { label: 'Vol-Adj Score', value: 'score' },
      { label: 'Consistency', value: 'consistency' },
      { label: 'Coverage', value: 'coverage' },
      { label: 'Abs Median', value: 'median' },
    ],
    [],
  );

  const stats = useMemo(() => {
    if (metrics.length === 0) return { bullish: 0, bearish: 0, avgConsistency: 0, avgCoverage: 0 };
    const bullish = metrics.filter((metric) => metric.signalScore > 0).length;
    const bearish = metrics.filter((metric) => metric.signalScore < 0).length;
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
      subtitle={`Vol-adjusted move from D-${preWindow} to D0 across ${(activeEvents?.size || 0)} active events`}
    >
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SliderControl
            label={`Window ${preWindow}D`}
            value={preWindow}
            onChange={setPreWindow}
            min={1}
            max={63}
            step={1}
          />
          <Select label="Group" value={selectedGroup} onChange={setSelectedGroup} options={groupOptions} />
          <Select label="Sort" value={sortMode} onChange={(value) => setSortMode(value as SortMode)} options={sortOptions} />
        </div>

        {metrics.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-text-dim">
            No pre-positioning data available for the selected settings.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Positive" value={stats.bullish} sub="signal > 0" color="#22c55e" />
              <StatBox label="Negative" value={stats.bearish} sub="signal < 0" color="#ef4444" />
              <StatBox label="Avg Consistency" value={stats.avgConsistency.toFixed(0)} sub="%" color="#f59e0b" />
              <StatBox label="Avg Coverage" value={`${(stats.avgCoverage * 100).toFixed(0)}%`} sub="of events" color="#00d4aa" />
            </div>

            <div className="overflow-x-auto border border-border/40 rounded-sm">
              <table className="w-full text-2xs font-mono">
                <thead>
                  <tr className="border-b border-border/40 bg-bg-cell/80">
                    <th className="px-3 py-2 text-left text-text-muted">Asset</th>
                    <th className="px-3 py-2 text-right text-text-muted">Vol-Adj</th>
                    <th className="px-3 py-2 text-right text-text-muted">Median</th>
                    <th className="px-3 py-2 text-right text-text-muted">Mean</th>
                    <th className="px-3 py-2 text-right text-text-muted">Std Dev</th>
                    <th className="px-3 py-2 text-right text-text-muted">Consistency</th>
                    <th className="px-3 py-2 text-right text-text-muted">Coverage</th>
                    <th className="px-3 py-2 text-center text-text-muted">Bias</th>
                    <th className="px-3 py-2 text-center text-text-muted">N</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric) => {
                    const returnColor = metric.signalScore > 0 ? 'text-[#22c55e]' : metric.signalScore < 0 ? 'text-[#ef4444]' : 'text-text-muted';
                    const consistencyColor = metric.directionConsistency >= 70
                      ? 'text-[#22c55e]'
                      : metric.directionConsistency >= 50
                        ? 'text-[#f59e0b]'
                        : 'text-[#ef4444]';
                    return (
                      <tr key={metric.asset} className="border-b border-border/20 hover:bg-bg-hover/20 transition-colors">
                        <td className="px-3 py-2 text-text-secondary">{metric.label}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>
                          {metric.signalScore >= 0 ? '+' : ''}{metric.signalScore.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatMetric(metric.medianReturn, metric.asset)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatMetric(metric.meanReturn, metric.asset)}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-muted">{formatMetric(metric.stdReturn, metric.asset)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${consistencyColor}`}>{metric.directionConsistency.toFixed(0)}%</td>
                        <td className="px-3 py-2 text-right font-mono text-text-muted">{(metric.coverage * 100).toFixed(0)}%</td>
                        <td className="px-3 py-2 text-center">
                          <Badge color={metric.trend === 'bullish' ? 'green' : metric.trend === 'bearish' ? 'red' : 'dim'}>
                            {metric.trend === 'bullish' ? 'UP' : metric.trend === 'bearish' ? 'DOWN' : 'FLAT'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center text-text-muted">{metric.sampleSize}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-2xs text-text-dim border-t border-border/40 pt-3 space-y-1">
              <p>Vol-Adj is the pre-event move divided by the asset&apos;s own realized volatility over the same pre-event window.</p>
              <p className="text-text-dim/70">A strong negative signal can be just as informative as a strong positive one if it was unusually large relative to normal pre-event noise.</p>
            </div>
          </>
        )}
        <BottomDescription>
          Pre-Positioning now ranks by the size of the move into Day 0 adjusted for pre-event volatility. That means a strong upside move and a strong downside move can both be important signals if they were large relative to the asset&apos;s own normal noise.
        </BottomDescription>
      </div>
    </ChartCard>
  );
}
