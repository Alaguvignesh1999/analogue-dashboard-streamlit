'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { POIS } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { nanMean, nanMedian, nanStd } from '@/lib/math';
import { fmtReturn } from '@/lib/format';
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

const ROTATION_GROUPS = ['Sector ETFs', 'Thematic ETFs', 'Bond ETFs', 'Country ETFs', 'Oil & Energy', 'Risk Barometer'];

export function RotationTab() {
  const { eventReturns, assetMeta, activeEvents } = useDashboard();

  const [poiIndex, setPoiIndex] = useState(2);
  const [rotationGroup, setRotationGroup] = useState('Sector ETFs');

  const rotationAssets = useMemo(
    () => (CUSTOM_GROUPS[rotationGroup] || []).filter((asset) => assetMeta[asset]),
    [assetMeta, rotationGroup],
  );

  const rotationMetrics = useMemo(() => {
    const results: RotationMetrics[] = [];
    if (!eventReturns || !assetMeta || !activeEvents || activeEvents.size === 0) return results;

    const poi = POIS[poiIndex];
    if (!poi) return results;

    for (const asset of rotationAssets) {
      const forwardReturns: number[] = [];

      for (const eventName of activeEvents) {
        const atPoi = poiRet(eventReturns, asset, eventName, poi.offset);
        const atZero = poiRet(eventReturns, asset, eventName, 0);
        if (Number.isNaN(atPoi) || Number.isNaN(atZero)) continue;
        forwardReturns.push(atPoi - atZero);
      }

      if (forwardReturns.length < 2) continue;

      const median = nanMedian(forwardReturns);
      const mean = nanMean(forwardReturns);
      const std = nanStd(forwardReturns);
      const hitRate = (forwardReturns.filter((value) => value > 0).length / forwardReturns.length) * 100;

      results.push({
        assetId: asset,
        label: displayLabel(assetMeta[asset], asset),
        medianReturn: median,
        meanReturn: mean,
        stdReturn: std,
        hitRate,
        sampleSize: forwardReturns.length,
        direction: median >= 0 ? 'positive' : 'negative',
      });
    }

    return results.sort((left, right) => right.medianReturn - left.medianReturn);
  }, [activeEvents, assetMeta, eventReturns, poiIndex, rotationAssets]);

  const chartData = useMemo(
    () => rotationMetrics.map((metric) => ({
      name: metric.label,
      value: metric.medianReturn,
      fill: metric.medianReturn >= 0 ? '#22c55e' : '#ef4444',
    })),
    [rotationMetrics],
  );

  const positivePois = useMemo(() => POIS.filter((poi) => poi.offset >= 0), []);

  const poiOptions = useMemo(
    () => positivePois.map((poi, index) => ({
      label: `${poi.label} (${poi.offset}D)`,
      value: index.toString(),
    })),
    [positivePois],
  );

  const activePoi = positivePois[poiIndex] || positivePois.find((poi) => poi.offset === 21) || positivePois[0];
  const horizonDays = Math.abs(activePoi?.offset || 0);

  const stats = useMemo(() => {
    if (rotationMetrics.length === 0) return { best: '—', worst: '—', avg: '—', positive: 0 };
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

  const groupOptions = useMemo(
    () => ROTATION_GROUPS.filter((groupName) => CUSTOM_GROUPS[groupName]).map((groupName) => ({ label: groupName, value: groupName })),
    [],
  );

  const formatMetric = (value: number, assetId: string) => {
    const isRates = assetMeta?.[assetId]?.is_rates_bp ?? false;
    return fmtReturn(value, isRates, 2);
  };

  return (
    <ChartCard
      title="Rotation Analysis"
      subtitle={`${rotationGroup} performance from D0 to ${activePoi?.label || 'selected horizon'} across ${(activeEvents?.size || 0)} active events`}
    >
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="text-2xs text-text-dim border border-border/40 bg-bg-cell/30 px-3 py-2">
          Rotation ranks which assets in the selected basket historically led or lagged after events similar to the current active set. Use it to spot relative winners, laggards, and whether the basket tends to broaden out or concentrate into a few names.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Basket" value={rotationGroup} onChange={setRotationGroup} options={groupOptions} />
          <Select label="Horizon" value={poiIndex.toString()} onChange={(value) => setPoiIndex(parseInt(value, 10))} options={poiOptions} />
        </div>

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
                    <th className="px-3 py-2 text-center text-text-muted">Direction</th>
                    <th className="px-3 py-2 text-center text-text-muted">N</th>
                  </tr>
                </thead>
                <tbody>
                  {rotationMetrics.map((metric) => {
                    const returnColor = metric.medianReturn > 0.5 ? 'text-[#22c55e]' : metric.medianReturn < -0.5 ? 'text-[#ef4444]' : 'text-text-muted';
                    const hitRateColor = metric.hitRate >= 65 ? 'text-[#22c55e]' : metric.hitRate >= 50 ? 'text-[#f59e0b]' : 'text-[#ef4444]';
                    const borderColor = metric.direction === 'positive' ? 'border-l-[#22c55e]' : 'border-l-[#ef4444]';
                    return (
                      <tr key={metric.assetId} className={`border-b border-border/20 hover:bg-bg-hover/20 transition-colors bg-bg-cell/20 border-l-2 ${borderColor}`}>
                        <td className="px-3 py-2 text-text-secondary">{metric.label}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatMetric(metric.medianReturn, metric.assetId)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatMetric(metric.meanReturn, metric.assetId)}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-muted">{formatMetric(metric.stdReturn, metric.assetId)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${hitRateColor}`}>{metric.hitRate.toFixed(0)}%</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-2xs font-semibold ${
                            metric.direction === 'positive' ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#ef4444]/20 text-[#ef4444]'
                          }`}>
                            {metric.direction === 'positive' ? 'LONG BIAS' : 'SHORT BIAS'}
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
              <p>Values measure the move from D0 to {activePoi?.label || `D+${horizonDays}`}. Hit rate is the share of events with a positive forward return.</p>
              <p className="text-text-dim/70">Use leaders vs laggards for rotation ideas, not as a substitute for the full analogue ranking.</p>
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
}
