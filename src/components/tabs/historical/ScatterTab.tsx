'use client';

import { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl, EmptyState } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel, eventDateMap, isAssetAvailableForEvent } from '@/engine/returns';
import { getSeriesPointAtOrBefore } from '@/engine/live';
import { POIS, PRE_WINDOW_TD, POST_WINDOW_TD } from '@/config/engine';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const PALETTE = [
  '#00e5ff', '#ff5252', '#69f0ae', '#b388ff', '#ffab40',
  '#ff80ab', '#40c4ff', '#ccff90', '#ffd740', '#ea80fc',
  '#84ffff', '#ff6e40', '#a7ffeb',
];

interface ScatterPoint {
  x: number;
  y: number;
  event: string;
  isLive: boolean;
}

export function ScatterTab() {
  const { eventReturns, assetMeta, allLabels, events, activeEvents, availability, live } = useDashboard();

  const [xAsset, setXAsset] = useState<string>('');
  const [yAsset, setYAsset] = useState<string>('');
  const [poiIdx, setPoiIdx] = useState<number>(0);
  const [stepMode, setStepMode] = useState<boolean>(false);
  const [stepDay, setStepDay] = useState<number>(0);

  useEffect(() => {
    if (!xAsset && allLabels.length > 0) {
      setXAsset(allLabels[0]);
      setYAsset(allLabels[Math.min(1, allLabels.length - 1)]);
    }
  }, [allLabels, xAsset]);

  const assets = useMemo(() => allLabels.slice().sort(), [allLabels]);
  const poi = POIS[poiIdx] || POIS[0];
  const eventDates = useMemo(() => eventDateMap(events), [events]);

  const chartData = useMemo(() => {
    if (!xAsset || !yAsset || !poi) return [];

    const points: ScatterPoint[] = [];
    for (const event of events) {
      if (!activeEvents.has(event.name)) continue;
      if (!isAssetAvailableForEvent(xAsset, eventDates[event.name], availability)) continue;
      if (!isAssetAvailableForEvent(yAsset, eventDates[event.name], availability)) continue;

      let xValue = poiRet(eventReturns, xAsset, event.name, poi.offset);
      let yValue = poiRet(eventReturns, yAsset, event.name, poi.offset);

      if (stepMode) {
        const xBase = poiRet(eventReturns, xAsset, event.name, stepDay);
        const yBase = poiRet(eventReturns, yAsset, event.name, stepDay);
        xValue = xValue - xBase;
        yValue = yValue - yBase;
      }

      if (Number.isNaN(xValue) || Number.isNaN(yValue)) continue;
      points.push({ x: xValue, y: yValue, event: event.name, isLive: false });
    }

    if (live.returns && live.dayN !== null) {
      const xLivePoint = getSeriesPointAtOrBefore(live.returns[xAsset], live.dayN);
      const yLivePoint = getSeriesPointAtOrBefore(live.returns[yAsset], live.dayN);
      if (xLivePoint && yLivePoint) {
        const xBasePoint = stepMode ? getSeriesPointAtOrBefore(live.returns[xAsset], stepDay) : null;
        const yBasePoint = stepMode ? getSeriesPointAtOrBefore(live.returns[yAsset], stepDay) : null;
        if (stepMode && (!xBasePoint || !yBasePoint)) {
          return points;
        }
        const adjustedX = stepMode ? xLivePoint.value - xBasePoint!.value : xLivePoint.value;
        const adjustedY = stepMode ? yLivePoint.value - yBasePoint!.value : yLivePoint.value;
        points.push({ x: adjustedX, y: adjustedY, event: live.name, isLive: true });
      }
    }

    return points;
  }, [activeEvents, availability, eventDates, eventReturns, events, live.dayN, live.name, live.returns, poi, stepDay, stepMode, xAsset, yAsset]);

  const regression = useMemo(() => {
    if (chartData.length < 2) return null;

    const xs = chartData.map((point) => point.x);
    const ys = chartData.map((point) => point.y);
    const n = xs.length;
    const sumX = xs.reduce((sum, value) => sum + value, 0);
    const sumY = ys.reduce((sum, value) => sum + value, 0);
    const sumXX = xs.reduce((sum, value) => sum + value * value, 0);
    const sumXY = xs.reduce((sum, value, index) => sum + value * ys[index], 0);

    const denominator = n * sumXX - sumX * sumX;
    if (Math.abs(denominator) < 1e-10) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const yMean = sumY / n;
    const ssTotal = ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
    const ssResidual = ys.reduce((sum, value, index) => {
      const predicted = slope * xs[index] + intercept;
      return sum + (value - predicted) ** 2;
    }, 0);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const line = Array.from({ length: 20 }, (_, index) => {
      const x = minX + ((maxX - minX) * index) / 19;
      return { x, y: slope * x + intercept };
    });

    return {
      line,
      r2: ssTotal > 0 ? 1 - ssResidual / ssTotal : null,
    };
  }, [chartData]);

  const xLabel = xAsset ? displayLabel(assetMeta[xAsset], xAsset) : 'X Asset';
  const yLabel = yAsset ? displayLabel(assetMeta[yAsset], yAsset) : 'Y Asset';
  const xUnit = xAsset ? unitLabel(assetMeta[xAsset]) : '';
  const yUnit = yAsset ? unitLabel(assetMeta[yAsset]) : '';

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard title="Regime Scatter" subtitle="Asset selectors now use the full validated asset universe.">
        <div className="space-y-4 p-4 border-b border-border/40">
          <div className="text-2xs text-text-dim border border-border/40 bg-bg-cell/20 px-3 py-2">
            Use this to test whether two assets tend to move together at the chosen POI across the active event set. Step Mode converts both axes into moves from a chosen entry day instead of absolute event-window values. R2 measures how tightly the points cluster around the fitted line; it does not imply causality.
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Select
              label="X"
              value={xAsset}
              onChange={setXAsset}
              options={assets.map((asset) => ({ value: asset, label: displayLabel(assetMeta[asset], asset) }))}
            />
            <Select
              label="Y"
              value={yAsset}
              onChange={setYAsset}
              options={assets.map((asset) => ({ value: asset, label: displayLabel(assetMeta[asset], asset) }))}
            />
            <Select
              label="POI"
              value={poiIdx.toString()}
              onChange={(value) => setPoiIdx(parseInt(value, 10))}
              options={POIS.map((value, index) => ({ value: index.toString(), label: value.label }))}
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="scatter-step-mode"
                checked={stepMode}
                onChange={(event) => setStepMode(event.target.checked)}
                className="h-4 w-4 accent-accent-teal cursor-pointer"
              />
              <label htmlFor="scatter-step-mode" className="text-2xs font-medium text-text-secondary cursor-pointer">
                Step Mode
              </label>
            </div>
          </div>

          {stepMode && (
            <SliderControl
              label="Step Day"
              value={stepDay}
              onChange={setStepDay}
              min={-PRE_WINDOW_TD}
              max={POST_WINDOW_TD}
              step={1}
              suffix="d"
            />
          )}
        </div>

        {chartData.length === 0 ? (
          <EmptyState
            title="No points available"
            message="Choose two assets with valid event coverage. Pre-inception combinations are now filtered out instead of plotting empty or invalid points."
          />
        ) : (
          <div className="h-[560px] border-t border-border/40">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                <CartesianGrid strokeDasharray="2 8" stroke="#1e1e22" vertical={false} />
                <XAxis
                  dataKey="x"
                  type="number"
                  name={xLabel}
                  label={{
                    value: `${xLabel} (${xUnit})`,
                    position: 'bottom',
                    offset: 10,
                    fill: '#71717a',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono',
                  }}
                  tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#1e1e22' }}
                  tickLine={{ stroke: '#1e1e22' }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  name={yLabel}
                  label={{
                    value: `${yLabel} (${yUnit})`,
                    angle: -90,
                    position: 'insideLeft',
                    offset: -10,
                    fill: '#71717a',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono',
                  }}
                  tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#1e1e22' }}
                  tickLine={{ stroke: '#1e1e22' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(12,12,18,0.96)',
                    border: '1px solid #1e1e22',
                    borderRadius: '4px',
                    padding: '8px',
                    fontFamily: 'JetBrains Mono',
                  }}
                  formatter={(value: any) => typeof value === 'number' ? value.toFixed(3) : value}
                  cursor={{ fill: 'rgba(0, 212, 170, 0.08)' }}
                />

                {regression?.line && (
                  <Scatter
                    name="Regression"
                    data={regression.line}
                    fill="#b388ff"
                    line
                    lineType="joint"
                    shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={0} fill="none" />}
                  />
                )}

                <Scatter
                  name="Events"
                  data={chartData}
                  shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    const activeEventList = events.filter((event) => activeEvents.has(event.name));
                    const eventIndex = activeEventList.findIndex((event) => event.name === payload.event);
                    const color = payload.isLive ? '#ffab40' : PALETTE[eventIndex % PALETTE.length];
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={payload.isLive ? 5 : 4}
                        fill={color}
                        opacity={0.85}
                        style={{
                          filter: payload.isLive
                            ? 'drop-shadow(0 0 8px #ffab40)'
                            : `drop-shadow(0 0 4px ${color}40)`,
                        }}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
          <div className="text-3xs text-text-dim uppercase tracking-wider mb-1 font-semibold">Points</div>
          <div className="text-sm font-bold text-text-primary font-mono">{chartData.length}</div>
        </div>
        {regression?.r2 !== null && regression?.r2 !== undefined && (
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider mb-1 font-semibold">R2</div>
            <div className="text-sm font-bold text-accent-teal font-mono">{regression.r2.toFixed(3)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
