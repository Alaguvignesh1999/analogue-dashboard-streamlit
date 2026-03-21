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

interface SectorMetrics {
  assetId: string;
  label: string;
  medianReturn: number;
  meanReturn: number;
  stdReturn: number;
  hitRate: number;
  sampleSize: number;
  direction: 'positive' | 'negative';
}

export function RotationTab() {
  const {
    eventReturns,
    assetMeta,
    activeEvents,
  } = useDashboard();

  const [poiIndex, setPoiIndex] = useState(0);

  const sectorAssets = useMemo(() => {
    const sectors = CUSTOM_GROUPS['Sector ETFs'] || [];
    const thematics = CUSTOM_GROUPS['Thematic ETFs'] || [];
    const bonds = CUSTOM_GROUPS['Bond ETFs'] || [];
    return [...sectors, ...thematics, ...bonds];
  }, []);

  const sectorMetrics = useMemo(() => {
    const results: SectorMetrics[] = [];

    if (!eventReturns || !assetMeta || !activeEvents || activeEvents.size === 0) {
      return results;
    }

    const poi = POIS[poiIndex];
    if (!poi) return results;

    const poiOffset = poi.offset;

    for (const asset of sectorAssets) {
      const forwardReturns: number[] = [];
      const directions: number[] = [];

      for (const eventName of activeEvents) {
        const atPoi = poiRet(eventReturns, asset, eventName, poiOffset);
        const atZero = poiRet(eventReturns, asset, eventName, 0);

        if (isNaN(atPoi) || isNaN(atZero)) {
          continue;
        }

        const forwardReturn = atPoi - atZero;
        forwardReturns.push(forwardReturn);
        directions.push(forwardReturn > 0 ? 1 : forwardReturn < 0 ? -1 : 0);
      }

      if (forwardReturns.length === 0) continue;

      const median = nanMedian(forwardReturns);
      const mean = nanMean(forwardReturns);
      const std = nanStd(forwardReturns);

      const positiveCount = directions.filter((d) => d > 0).length;
      const hitRate = (positiveCount / forwardReturns.length) * 100;

      const meta = assetMeta[asset];
      results.push({
        assetId: asset,
        label: displayLabel(meta, asset),
        medianReturn: median,
        meanReturn: mean,
        stdReturn: std,
        hitRate,
        sampleSize: forwardReturns.length,
        direction: median > 0 ? 'positive' : 'negative',
      });
    }

    return results.sort((a, b) => b.medianReturn - a.medianReturn);
  }, [eventReturns, assetMeta, activeEvents, poiIndex, sectorAssets]);

  const chartData = useMemo(() => {
    return sectorMetrics.map((m) => ({
      name: m.label,
      value: m.medianReturn,
      fill: m.medianReturn >= 0 ? '#22c55e' : '#ef4444',
    }));
  }, [sectorMetrics]);

  const poiOptions = useMemo(() => {
    return POIS.map((poi, idx) => ({
      label: `${poi.label} (${Math.abs(poi.offset)}D)`,
      value: idx.toString(),
    }));
  }, []);

  const formatReturn = (value: number, assetId: string): string => {
    const meta = assetMeta?.[assetId];
    const isRates = meta?.is_rates_bp ?? false;
    return fmtReturn(value, isRates, 2);
  };

  const poi = POIS[poiIndex];
  const horizonDays = poi ? Math.abs(poi.offset) : 20;

  const stats = useMemo(() => {
    if (sectorMetrics.length === 0) return { best: '—', worst: '—', portfolio: '—', avg: 0 };
    const returns = sectorMetrics.map(m => m.medianReturn);
    const best = Math.max(...returns);
    const worst = Math.min(...returns);
    const avg = nanMean(returns);
    return {
      best: formatReturn(best, sectorMetrics[0].assetId),
      worst: formatReturn(worst, sectorMetrics[0].assetId),
      portfolio: formatReturn(avg, sectorMetrics[0].assetId),
      avg,
    };
  }, [sectorMetrics]);

  return (
    <ChartCard
      title="Sector Rotation Analysis"
      subtitle={`Post-event sector performance over ${horizonDays} trading days`}
    >
      <div className="p-4 space-y-4 animate-fade-in">
        <Select
          label="Horizon"
          value={poiIndex.toString()}
          onChange={(val) => setPoiIndex(parseInt(val))}
          options={poiOptions}
        />

        {sectorMetrics.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-text-dim">
            No sector data available for selected parameters
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatBox
                label="Best"
                value={stats.best}
                sub="sector performer"
                color="#22c55e"
              />
              <StatBox
                label="Worst"
                value={stats.worst}
                sub="sector performer"
                color="#ef4444"
              />
              <StatBox
                label="Portfolio"
                value={stats.portfolio}
                sub="median return"
                color={stats.avg > 0 ? '#22c55e' : '#ef4444'}
              />
            </div>

            <div className="w-full h-80 bg-bg-cell/30 rounded-sm border border-border/40 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 180, bottom: 5 }}
                >
                  <CartesianGrid stroke="#1e1e22" strokeDasharray="2 8" />
                  <XAxis type="number" stroke="#71717a" style={{ fontSize: '11px' }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#71717a"
                    style={{ fontSize: '11px' }}
                    width={175}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #2a2a2e',
                      borderRadius: '4px',
                      color: '#e4e4e7',
                      fontSize: '11px',
                      padding: '6px 8px',
                    }}
                    formatter={(value: number) => fmtReturn(value, false, 2)}
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
                    <th className="px-3 py-2 text-left text-text-muted">Sector / ETF</th>
                    <th className="px-3 py-2 text-right text-text-muted">Median Ret</th>
                    <th className="px-3 py-2 text-right text-text-muted">Mean</th>
                    <th className="px-3 py-2 text-right text-text-muted">Std Dev</th>
                    <th className="px-3 py-2 text-right text-text-muted">Hit Rate</th>
                    <th className="px-3 py-2 text-center text-text-muted">Dir</th>
                    <th className="px-3 py-2 text-center text-text-muted">N</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorMetrics.map((m) => {
                    const returnColor = m.medianReturn > 0.5 ? 'text-[#22c55e]' : m.medianReturn < -0.5 ? 'text-[#ef4444]' : 'text-text-muted';
                    const hitRateColor = m.hitRate >= 65 ? 'text-[#22c55e]' : m.hitRate >= 50 ? 'text-[#f59e0b]' : 'text-[#ef4444]';
                    const borderColor = m.direction === 'positive' ? 'border-l-[#22c55e]' : 'border-l-[#ef4444]';
                    return (
                      <tr
                        key={m.assetId}
                        className={`border-b border-border/20 hover:bg-bg-hover/20 transition-colors bg-bg-cell/20 border-l-2 ${borderColor}`}
                      >
                        <td className="px-3 py-2 text-text-secondary">{m.label}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatReturn(m.medianReturn, m.assetId)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${returnColor}`}>{formatReturn(m.meanReturn, m.assetId)}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-muted">{formatReturn(m.stdReturn, m.assetId)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${hitRateColor}`}>{m.hitRate.toFixed(0)}%</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-2xs font-semibold ${
                            m.direction === 'positive'
                              ? 'bg-[#22c55e]/20 text-[#22c55e]'
                              : 'bg-[#ef4444]/20 text-[#ef4444]'
                          }`}>
                            {m.direction === 'positive' ? '↑' : '↓'}
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
              <p>Forward returns from Day 0 to {poi?.label.toLowerCase()} ({horizonDays}D) across {activeEvents?.size || 0} events.</p>
              <p className="text-text-dim/70">Hit Rate = % of events with positive return. Direction shows median sign.</p>
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
}
