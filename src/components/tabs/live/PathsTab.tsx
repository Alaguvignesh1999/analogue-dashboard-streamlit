'use client';
import { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox } from '@/components/ui/ChartCard';
import { displayLabel, unitLabel, poiRet } from '@/engine/returns';
import { getEffectiveScoringDate, getEffectiveScoringDay, getLiveScoringDay } from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents, compositeReturn } from '@/engine/similarity';
import { POIS, POST_WINDOW_TD } from '@/config/engine';
import { nanMedian } from '@/lib/math';
import { fmtReturn } from '@/lib/format';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';

const PALETTE = ['#00e5ff', '#ff5252', '#69f0ae', '#b388ff', '#ffab40', '#ff80ab', '#40c4ff', '#ccff90', '#ffd740', '#ea80fc', '#84ffff', '#ff6e40', '#a7ffeb'];
const AX_TICK = '#8a8a9a';
const AX_LINE = '#2a2a3a';
const GRID_CLR = '#1e1e22';

function heatColor(value: number, maxAbs: number, isRates: boolean): string {
  if (Number.isNaN(value)) return 'transparent';
  const intensity = Math.min(Math.abs(value) / (maxAbs + 1e-9), 1);
  const alpha = 0.15 + intensity * 0.55;
  const isGood = isRates ? value < 0 : value > 0;
  return isGood ? `rgba(34,197,94,${alpha.toFixed(2)})` : `rgba(239,68,68,${alpha.toFixed(2)})`;
}

export function PathsTab() {
  const { eventReturns, assetMeta, allClasses, scores, scoreCutoff, live, activeEvents } = useDashboard();

  const [selectedClass, setSelectedClass] = useState('Oil & Energy');
  const [selectedAsset, setSelectedAsset] = useState('Brent Futures');

  const classAssets = useMemo(
    () => Object.entries(assetMeta).filter(([, meta]) => meta.class === selectedClass).map(([label]) => label),
    [assetMeta, selectedClass],
  );

  useEffect(() => {
    if (classAssets.length > 0 && !classAssets.includes(selectedAsset)) {
      setSelectedAsset(classAssets[0]);
    }
  }, [classAssets, selectedAsset]);

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const dayN = getEffectiveScoringDay(live, [selectedAsset]);
  const displayDayN = getLiveScoringDay(live);
  const effectiveDate = getEffectiveScoringDate(live, [selectedAsset]);
  const meta = assetMeta[selectedAsset];
  const isRates = meta?.is_rates_bp || false;
  const unit = unitLabel(meta);

  const chartData = useMemo(() => {
    const offsets = Array.from({ length: POST_WINDOW_TD + 1 }, (_, index) => index);
    const composite = compositeReturn(eventReturns, selectedAsset, selectedEvents, activeScores);

    return offsets.map((offset) => {
      const point: Record<string, number> & { offset: number } = { offset };
      for (const eventName of selectedEvents) {
        const value = eventReturns[selectedAsset]?.[eventName]?.[offset];
        if (value !== undefined) point[eventName] = value;
      }
      if (composite && composite[offset] !== undefined) point.Composite = composite[offset];
      if (live.returns?.[selectedAsset] && offset <= displayDayN) {
        const liveValue = live.returns[selectedAsset][offset];
        if (liveValue !== undefined) point.__live__ = liveValue;
      }
      return point;
    });
  }, [activeScores, eventReturns, selectedAsset, selectedEvents, live, displayDayN]);

  const fwdHeatmap = useMemo(() => {
    const futurePois = POIS.filter((poi) => poi.offset > dayN);
    if (futurePois.length === 0 || selectedEvents.length === 0) return null;

    let maxAbs = 0;
    const rows = futurePois.map((poi) => {
      const values: number[] = [];
      for (const eventName of selectedEvents) {
        const startValue = poiRet(eventReturns, selectedAsset, eventName, dayN);
        const finishValue = poiRet(eventReturns, selectedAsset, eventName, poi.offset);
        if (!Number.isNaN(startValue) && !Number.isNaN(finishValue)) values.push(finishValue - startValue);
      }
      const med = values.length >= 2 ? nanMedian(values) : Number.NaN;
      maxAbs = Math.max(maxAbs, Math.abs(med) || 0);
      return { label: poi.label, offset: poi.offset, med, n: values.length };
    });

    return { rows, maxAbs: maxAbs || 5 };
  }, [eventReturns, selectedAsset, selectedEvents, dayN]);

  const chartStats = useMemo(() => {
    if (selectedEvents.length === 0 || chartData.length === 0) return { range: 0, current: 0 };
    const livePoints = chartData.filter((point) => point.__live__ !== undefined);
    const lastLivePoint = livePoints.length > 0 ? livePoints[livePoints.length - 1] : chartData[chartData.length - 1];
    const range = Math.max(...chartData.map((point) => Math.abs(point.Composite || 0)), 1);
    const current = lastLivePoint.__live__ ?? 0;
    return { range, current };
  }, [chartData, selectedEvents]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title={`Path - ${displayLabel(meta, selectedAsset)}`}
        subtitle={`${selectedEvents.length} analogues | effective D+${dayN}${effectiveDate ? ` (${effectiveDate})` : ''} | display D+${displayDayN} | ${unit}`}
        controls={
          <div className="flex items-center gap-2">
            <Select label="" value={selectedClass} onChange={setSelectedClass} options={allClasses.map((groupName) => ({ value: groupName, label: groupName }))} />
            <Select label="" value={selectedAsset} onChange={setSelectedAsset} options={classAssets.map((asset) => ({ value: asset, label: displayLabel(assetMeta[asset], asset) }))} />
          </div>
        }
      >
        {selectedEvents.length === 0 ? (
          <div className="h-[420px] flex items-center justify-center text-text-dim text-sm">
            No analogues selected. Adjust cutoff or run matching.
          </div>
        ) : (
          <>
            <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
              The orange line is the live display path through the latest available calendar day, while the score marker shows the effective trading day used for matching. The composite line is the weighted analogue blend for the same asset and event window.
            </div>

            <div className="px-4 pt-4 grid grid-cols-3 gap-3">
              <StatBox label="Live Path" value={`${chartStats.current > 0 ? '+' : ''}${chartStats.current.toFixed(1)}`} color={chartStats.current >= 0 ? '#22c55e' : '#ef4444'} />
              <StatBox label="Range" value={`+/-${chartStats.range.toFixed(1)}`} color="#00d4aa" />
              <StatBox label="Analogues" value={selectedEvents.length} color="#ffffff" />
            </div>

            <div className="h-[400px] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 12, bottom: 16, left: 8 }}>
                  <CartesianGrid stroke={GRID_CLR} strokeDasharray="2 8" />
                  <XAxis
                    dataKey="offset"
                    stroke={AX_LINE}
                    tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }}
                    tickFormatter={(value) => `D+${value}`}
                  />
                  <YAxis
                    stroke={AX_LINE}
                    tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }}
                    tickFormatter={(value: number) => `${value > 0 ? '+' : ''}${value.toFixed(0)}`}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{ background: 'rgba(12,12,18,0.96)', border: '1px solid #2a2a3a', borderRadius: 2, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    labelFormatter={(value) => `Day +${value}`}
                  />
                  <Legend
                    height={32}
                    wrapperStyle={{ paddingTop: '8px', fontSize: 11, color: '#a1a1aa', fontFamily: 'JetBrains Mono' }}
                    iconType="line"
                  />
                  <ReferenceLine y={0} stroke="#3a3a4e" strokeWidth={1} />
                  <ReferenceLine x={dayN} stroke="#ffab40" strokeDasharray="3 3" label={{ value: 'Score', position: 'top', fill: '#ffab40', fontSize: 10 }} />

                  {selectedEvents.map((eventName, index) => (
                    <Line
                      key={eventName}
                      dataKey={eventName}
                      stroke={PALETTE[index % PALETTE.length]}
                      strokeWidth={1}
                      strokeOpacity={0.6}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ))}
                  <Line dataKey="Composite" stroke="#00d4aa" strokeWidth={2.5} strokeDasharray="6 3" dot={false} connectNulls={false} isAnimationActive={false} name="Composite" />
                  {live.returns?.[selectedAsset] && (
                    <Line
                      dataKey="__live__"
                      stroke="#ffab40"
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: '#ffab40', strokeWidth: 0 }}
                      connectNulls={false}
                      isAnimationActive={false}
                      name="Live"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </ChartCard>

      {fwdHeatmap && selectedEvents.length > 0 && (
        <ChartCard title="Forward Returns" subtitle={`Median forward from effective D+${dayN} to each POI`}>
          <div className="p-4 flex gap-1.5 flex-wrap">
            {fwdHeatmap.rows.map((row) => (
              <div
                key={row.label}
                className="flex-1 min-w-[100px] text-center p-3 border border-border/40 rounded-sm transition-all"
                style={{ backgroundColor: heatColor(row.med, fwdHeatmap.maxAbs, isRates) }}
              >
                <div className="text-2xs text-text-muted font-medium">{row.label}</div>
                <div className={`text-sm font-mono font-semibold mt-1.5 ${Number.isNaN(row.med) ? 'text-text-dim' : row.med >= 0 ? 'text-up' : 'text-down'}`}>
                  {Number.isNaN(row.med) ? '--' : fmtReturn(row.med, isRates)}
                </div>
                <div className="text-[9px] text-text-dim mt-1">n={row.n}</div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
