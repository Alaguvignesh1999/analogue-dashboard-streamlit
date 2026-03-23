'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, SliderControl, StatBox, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { ALL_ASSETS_OPTION, getGroupLabels, groupOptionsFromData } from '@/config/assets';
import { nanMean, nanMedian, nanStd } from '@/lib/math';
import { fmtReturn } from '@/lib/format';
import { getEffectiveScoringDay, getLiveDisplayDay, getLiveDisplayDate } from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';

interface RotationMetrics {
  assetId: string;
  label: string;
  medianReturn: number;
  meanReturn: number;
  stdReturn: number;
  hitRate: number;
  sampleSize: number;
  direction: 'positive' | 'negative';
}

type RotationMode = 'preset' | 'from-live';

export function RotationTab() {
  const { eventReturns, assetMeta, activeEvents, allLabels, allClasses, live, similarityAssets, scores, scoreCutoff } = useDashboard();

  const [rotationGroup, setRotationGroup] = useState('Sector ETFs');
  const [mode, setMode] = useState<RotationMode>('preset');
  const [poiIndex, setPoiIndex] = useState(2);
  const [customForwardDays, setCustomForwardDays] = useState(21);

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const rotationAssets = useMemo(
    () => getGroupLabels(rotationGroup, allLabels, assetMeta).filter((asset) => assetMeta[asset]),
    [rotationGroup, allLabels, assetMeta],
  );

  const effectiveDay = getEffectiveScoringDay(live, similarityAssets);
  const displayDay = getLiveDisplayDay(live);
  const displayDate = getLiveDisplayDate(live);
  const positivePois = useMemo(() => POIS.filter((poi) => poi.offset >= 0), []);
  const activePoi = positivePois[poiIndex] || positivePois.find((poi) => poi.offset === 21) || positivePois[0];
  const startOffset = mode === 'from-live' ? effectiveDay : 0;
  const endOffset = mode === 'from-live' ? effectiveDay + customForwardDays : activePoi?.offset ?? 21;
  const horizonLabel = mode === 'from-live' ? `Live D+${displayDay} -> D+${displayDay + customForwardDays}` : `D0 -> ${activePoi?.label || 'selected horizon'}`;

  const rotationMetrics = useMemo(() => {
    const results: RotationMetrics[] = [];
    if (!eventReturns || !assetMeta || !selectedEvents.length) return results;

    for (const asset of rotationAssets) {
      const forwardReturns: number[] = [];

      for (const eventName of selectedEvents) {
        const atStart = poiRet(eventReturns, asset, eventName, startOffset);
        const atEnd = poiRet(eventReturns, asset, eventName, endOffset);
        if (Number.isNaN(atStart) || Number.isNaN(atEnd)) continue;
        forwardReturns.push(atEnd - atStart);
      }

      if (forwardReturns.length < 2) continue;

      const median = nanMedian(forwardReturns);
      const mean = nanMean(forwardReturns);
      const std = nanStd(forwardReturns);
      const direction = median >= 0 ? 'positive' : 'negative';
      const hitRate = (forwardReturns.filter((value) => value * (median >= 0 ? 1 : -1) > 0).length / forwardReturns.length) * 100;

      results.push({
        assetId: asset,
        label: displayLabel(assetMeta[asset], asset),
        medianReturn: median,
        meanReturn: mean,
        stdReturn: std,
        hitRate,
        sampleSize: forwardReturns.length,
        direction,
      });
    }

    return results.sort((left, right) => Math.abs(right.medianReturn) - Math.abs(left.medianReturn));
  }, [assetMeta, endOffset, eventReturns, rotationAssets, selectedEvents, startOffset]);

  const chartData = useMemo(
    () => rotationMetrics.map((metric) => ({
      name: metric.label,
      value: metric.medianReturn,
      fill: metric.medianReturn >= 0 ? '#22c55e' : '#ef4444',
    })),
    [rotationMetrics],
  );

  const poiOptions = useMemo(
    () => positivePois.map((poi, index) => ({
      label: `${poi.label} (${poi.offset}D)`,
      value: index.toString(),
    })),
    [positivePois],
  );

  const stats = useMemo(() => {
    if (rotationMetrics.length === 0) return { best: '--', worst: '--', avg: '--', positive: 0 };
    const returns = rotationMetrics.map((metric) => metric.medianReturn);
    const positive = rotationMetrics.filter((metric) => metric.medianReturn > 0).length;
    const isRates = assetMeta?.[rotationMetrics[0].assetId]?.is_rates_bp ?? false;
    return {
      best: fmtReturn(Math.max(...returns), isRates, 2),
      worst: fmtReturn(Math.min(...returns), isRates, 2),
      avg: fmtReturn(nanMean(returns), isRates, 2),
      positive,
    };
  }, [assetMeta, rotationMetrics]);

  const groupOptions = useMemo(() => groupOptionsFromData(allClasses), [allClasses]);

  const formatMetric = (value: number, assetId: string) => {
    const isRates = assetMeta?.[assetId]?.is_rates_bp ?? false;
    return fmtReturn(value, isRates, 2);
  };

  return (
    <ChartCard
      title="Rotation Analysis"
      subtitle={`${rotationGroup} | ${horizonLabel} | ${selectedEvents.length} analogue events`}
    >
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select label="Basket" value={rotationGroup} onChange={setRotationGroup} options={groupOptions} />
          <Select
            label="Mode"
            value={mode}
            onChange={(value) => setMode(value as RotationMode)}
            options={[
              { value: 'preset', label: 'Preset POIs From D0' },
              { value: 'from-live', label: 'Custom X Days From Live' },
            ]}
          />
          {mode === 'preset' ? (
            <Select label="Horizon" value={poiIndex.toString()} onChange={(value) => setPoiIndex(parseInt(value, 10))} options={poiOptions} />
          ) : (
            <SliderControl label="Forward" value={customForwardDays} onChange={setCustomForwardDays} min={1} max={63} step={1} suffix="d" />
          )}
        </div>

        {mode === 'from-live' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color="teal">Live D+{displayDay}</Badge>
            <Badge color="dim">{displayDate || '--'}</Badge>
          </div>
        )}

        {rotationMetrics.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-text-dim">
            No rotation data available for the selected basket and horizon.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Best" value={stats.best} sub="leader" color="#22c55e" />
              <StatBox label="Worst" value={stats.worst} sub="laggard" color="#ef4444" />
              <StatBox label="Average" value={stats.avg} sub="basket median" color="#00d4aa" />
              <StatBox label="Positive" value={stats.positive} sub={`of ${rotationMetrics.length}`} color="#f59e0b" />
            </div>

            <div className="w-full h-80 bg-bg-cell/30 rounded-sm border border-border/40 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 180, bottom: 5 }}>
                  <CartesianGrid stroke="#1e1e22" strokeDasharray="2 8" />
                  <XAxis type="number" stroke="#71717a" style={{ fontSize: '11px' }} />
                  <YAxis dataKey="name" type="category" stroke="#71717a" style={{ fontSize: '11px' }} width={175} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #2a2a2e',
                      borderRadius: '4px',
                      color: '#e4e4e7',
                      fontSize: '11px',
                      padding: '6px 8px',
                    }}
                    formatter={(value: number, _name, payload: any) => {
                      const assetId = rotationMetrics.find((metric) => metric.label === payload?.payload?.name)?.assetId;
                      return [assetId ? formatMetric(value, assetId) : value.toFixed(2), 'Median'];
                    }}
                    cursor={{ fill: 'rgba(0,212,170,0.05)' }}
                  />
                  <ReferenceLine x={0} stroke="#1e1e22" />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto border border-border/40 rounded-sm">
              <table className="w-full text-2xs font-mono">
                <thead>
                  <tr className="border-b border-border/40 bg-bg-cell/80">
                    <th className="px-3 py-2 text-left text-text-muted">Asset</th>
                    <th className="px-3 py-2 text-right text-text-muted">Median</th>
                    <th className="px-3 py-2 text-right text-text-muted">Mean</th>
                    <th className="px-3 py-2 text-right text-text-muted">Std Dev</th>
                    <th className="px-3 py-2 text-right text-text-muted">Hit Rate</th>
                    <th className="px-3 py-2 text-center text-text-muted">Bias</th>
                    <th className="px-3 py-2 text-center text-text-muted">N</th>
                  </tr>
                </thead>
                <tbody>
                  {rotationMetrics.map((metric) => (
                    <tr key={metric.assetId} className={`border-b border-border/20 hover:bg-bg-hover/20 transition-colors bg-bg-cell/20 border-l-2 ${metric.direction === 'positive' ? 'border-l-[#22c55e]' : 'border-l-[#ef4444]'}`}>
                      <td className="px-3 py-2 text-text-secondary">{metric.label}</td>
                      <td className={`px-3 py-2 text-right font-mono ${metric.medianReturn >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{formatMetric(metric.medianReturn, metric.assetId)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${metric.meanReturn >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{formatMetric(metric.meanReturn, metric.assetId)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-muted">{formatMetric(metric.stdReturn, metric.assetId)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${metric.hitRate >= 65 ? 'text-[#22c55e]' : metric.hitRate >= 50 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>{metric.hitRate.toFixed(0)}%</td>
                      <td className="px-3 py-2 text-center">
                        <Badge color={metric.direction === 'positive' ? 'green' : 'red'}>
                          {metric.direction === 'positive' ? 'LONG BIAS' : 'SHORT BIAS'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center text-text-muted">{metric.sampleSize}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <BottomDescription className="space-y-1">
              <p>Rotation ranks which assets in the selected basket historically led or lagged after similar events. Use preset horizons for notebook-style post-event views, or switch to live mode to ask what tends to rotate from the current live state over the next X trading days.</p>
              <p>Preset mode measures rotation from D0 to the selected POI. Live mode measures from live D+{displayDay} to D+{displayDay + customForwardDays}.</p>
              <p className="text-text-dim/70">Use leaders vs laggards for rotation clues, not as a substitute for the full analogue ranking.</p>
            </BottomDescription>
          </>
        )}
      </div>
    </ChartCard>
  );
}
