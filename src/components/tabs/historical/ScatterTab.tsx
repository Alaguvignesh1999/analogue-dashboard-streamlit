'use client';
import { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
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

const AX_TICK = '#8a8a9a';
const AX_LINE = '#2a2a3a';
const GRID_CLR = '#1c1c2c';

const PALETTE = [
  '#00e5ff',
  '#ff5252',
  '#69f0ae',
  '#b388ff',
  '#ffab40',
  '#ff80ab',
  '#40c4ff',
  '#ccff90',
  '#ffd740',
  '#ea80fc',
  '#84ffff',
  '#ff6e40',
  '#a7ffeb',
];

export function ScatterTab() {
  const { eventReturns, assetMeta, allClasses, events, activeEvents, live } =
    useDashboard();

  const [xAsset, setXAsset] = useState<string>('');
  const [yAsset, setYAsset] = useState<string>('');
  const [poiIdx, setPoiIdx] = useState<number>(0);
  const [stepMode, setStepMode] = useState<boolean>(false);
  const [stepDay, setStepDay] = useState<number>(0);

  // Initialize default assets
  useEffect(() => {
    if (allClasses.length > 0 && !xAsset) {
      const assets = allClasses.filter((cls) => assetMeta[cls]);
      if (assets.length > 0) {
        setXAsset(assets[0]);
        setYAsset(assets[assets.length > 1 ? 1 : 0]);
      }
    }
  }, [allClasses, assetMeta, xAsset]);

  const assets = useMemo(() => {
    return allClasses.filter((cls) => assetMeta[cls]);
  }, [allClasses, assetMeta]);

  const poi = useMemo(() => {
    return POIS[poiIdx] || POIS[0];
  }, [poiIdx]);

  const maxStepDay = useMemo(() => {
    return Math.min(PRE_WINDOW_TD, POST_WINDOW_TD) - 1;
  }, []);

  const chartData = useMemo(() => {
    if (!xAsset || !yAsset || !poi) return [];

    const data: Array<{
      x: number;
      y: number;
      event: string;
      xVal: number;
      yVal: number;
      isLive: boolean;
    }> = [];

    // Filter active events and build data points
    const activeEventNames = events.filter((e) => activeEvents.has(e.name));

    activeEventNames.forEach((eventObj, idx) => {
      const eventName = eventObj.name;

      let xVal = poiRet(eventReturns, xAsset, eventName, poi.offset);
      let yVal = poiRet(eventReturns, yAsset, eventName, poi.offset);

      // Step mode: re-base from step day
      if (stepMode && stepDay > 0) {
        const xBase = poiRet(eventReturns, xAsset, eventName, stepDay);
        const yBase = poiRet(eventReturns, yAsset, eventName, stepDay);
        xVal = (xVal - xBase) * 100; // bps
        yVal = (yVal - yBase) * 100; // bps
      }

      if (!isNaN(xVal) && !isNaN(yVal)) {
        data.push({
          x: xVal,
          y: yVal,
          event: eventName,
          xVal,
          yVal,
          isLive: false,
        });
      }
    });

    // Add live point if available
    if (live.returns && live.dayN !== null && live.name) {
      const xLive = live.returns[xAsset]?.[live.dayN];
      const yLive = live.returns[yAsset]?.[live.dayN];

      if (xLive !== undefined && yLive !== undefined) {
        let xVal = xLive;
        let yVal = yLive;

        if (stepMode && stepDay > 0) {
          const xBase = live.returns[xAsset]?.[stepDay] || 0;
          const yBase = live.returns[yAsset]?.[stepDay] || 0;
          xVal = (xVal - xBase) * 100;
          yVal = (yVal - yBase) * 100;
        }

        data.push({
          x: xVal,
          y: yVal,
          event: live.name,
          xVal,
          yVal,
          isLive: true,
        });
      }
    }

    return data;
  }, [
    xAsset,
    yAsset,
    poi,
    eventReturns,
    activeEvents,
    events,
    live,
    stepMode,
    stepDay,
  ]);

  // Calculate regression line as scatter points
  const regressionLinePoints = useMemo(() => {
    if (chartData.length < 2) return [];

    const xVals = chartData.map((d) => d.x);
    const yVals = chartData.map((d) => d.y);

    const n = xVals.length;
    const sumX = xVals.reduce((a, b) => a + b, 0);
    const sumY = yVals.reduce((a, b) => a + b, 0);
    const sumXX = xVals.reduce((a, b) => a + b * b, 0);
    const sumXY = xVals.reduce((a, xy, i) => a + xy * yVals[i], 0);

    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return [];

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);

    // Create 20 points along the regression line
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const x = minX + (maxX - minX) * (i / 20);
      const y = slope * x + intercept;
      points.push({ x, y, regressionLine: true });
    }
    return points;
  }, [chartData]);

  const xLabel = xAsset ? displayLabel(assetMeta[xAsset], xAsset) : 'X Asset';
  const yLabel = yAsset ? displayLabel(assetMeta[yAsset], yAsset) : 'Y Asset';
  const xUnit = xAsset ? unitLabel(assetMeta[xAsset]) : '';
  const yUnit = yAsset ? unitLabel(assetMeta[yAsset]) : '';

  // Calculate R²
  const r2 = useMemo(() => {
    if (chartData.length < 2 || regressionLinePoints.length === 0) return null;
    const yVals = chartData.map(d => d.y);
    const yMean = yVals.reduce((a, b) => a + b, 0) / yVals.length;
    const ssTotal = yVals.reduce((a, v) => a + (v - yMean) ** 2, 0);
    const ssRes = chartData.reduce((sum, d) => {
      const yPred = regressionLinePoints.length > 0 ? d.y : 0;
      return sum + (d.y - yPred) ** 2;
    }, 0);
    return 1 - (ssRes / ssTotal);
  }, [chartData, regressionLinePoints]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard title="Regime Scatter">
        <div className="space-y-4 p-4 border-b border-border/40">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Select
              label="X"
              value={xAsset}
              onChange={setXAsset}
              options={assets.map((a) => ({
                value: a,
                label: displayLabel(assetMeta[a], a),
              }))}
            />
            <Select
              label="Y"
              value={yAsset}
              onChange={setYAsset}
              options={assets.map((a) => ({
                value: a,
                label: displayLabel(assetMeta[a], a),
              }))}
            />
            <Select
              label="POI"
              value={poiIdx.toString()}
              onChange={(v) => setPoiIdx(parseInt(v))}
              options={POIS.map((p, i) => ({
                value: i.toString(),
                label: p.label,
              }))}
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="step-mode"
                checked={stepMode}
                onChange={(e) => setStepMode(e.target.checked)}
                className="h-4 w-4 accent-accent-teal cursor-pointer"
              />
              <label
                htmlFor="step-mode"
                className="text-2xs font-medium text-text-secondary cursor-pointer"
              >
                Step Mode
              </label>
            </div>
          </div>

          {stepMode && (
            <SliderControl
              label={`Step Day`}
              value={stepDay}
              onChange={setStepDay}
              min={0}
              max={maxStepDay}
              step={1}
              suffix="d"
            />
          )}
        </div>

        <div className="h-[560px] border-t border-border/40">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
              data={chartData}
            >
              <CartesianGrid
                strokeDasharray="2 8"
                stroke="#1e1e22"
                vertical={false}
              />
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
                labelStyle={{ color: '#71717a', fontSize: 10 }}
                formatter={(value: any) => value.toFixed(3)}
                cursor={{ fill: 'rgba(0, 212, 170, 0.08)' }}
              />
              {regressionLinePoints.length > 0 && (
                <Scatter
                  name="Regression"
                  data={regressionLinePoints}
                  fill="none"
                  shape={(props: any) => {
                    const { cx, cy } = props;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={2}
                        fill="#b388ff"
                        opacity={0.6}
                      />
                    );
                  }}
                />
              )}
              <Scatter
                name="Events"
                data={chartData}
                fill="#00d4aa"
                shape={(props: any) => {
                  const { cx, cy, payload } = props;
                  const activeEventNames = events.filter((e) =>
                    activeEvents.has(e.name)
                  );
                  const eventIndex = activeEventNames.findIndex(
                    (e) => e.name === payload.event
                  );
                  const color = payload.isLive
                    ? '#ffab40'
                    : PALETTE[eventIndex % PALETTE.length];
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
      </ChartCard>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
          <div className="text-3xs text-text-dim uppercase tracking-wider mb-1 font-semibold">Events</div>
          <div className="text-sm font-bold text-text-primary font-mono">{chartData.length}</div>
        </div>
        {r2 !== null && (
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider mb-1 font-semibold">R²</div>
            <div className="text-sm font-bold text-accent-teal font-mono">{r2.toFixed(3)}</div>
          </div>
        )}
      </div>

      <ChartCard title="Legend">
        <div className="p-4 space-y-2">
          {events
            .filter((e) => activeEvents.has(e.name))
            .map((e, idx) => (
              <div key={e.name} className="flex items-center gap-2 text-2xs">
                <div
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: PALETTE[idx % PALETTE.length],
                    boxShadow: `0 0 4px ${PALETTE[idx % PALETTE.length]}60`,
                  }}
                />
                <span className="text-text-secondary font-mono">{e.name}</span>
              </div>
            ))}
          {live.name && (
            <div className="flex items-center gap-2 text-2xs">
              <div
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: '#ffab40',
                  boxShadow: '0 0 4px #ffab4060',
                }}
              />
              <span className="text-text-secondary font-mono">▶ {live.name}</span>
            </div>
          )}
          {regressionLinePoints.length > 0 && (
            <div className="flex items-center gap-2 text-2xs pt-2 border-t border-border/40">
              <div className="h-2 w-2 rounded-full bg-accent-purple flex-shrink-0" />
              <span className="text-text-secondary font-mono">Regression fit</span>
            </div>
          )}
        </div>
      </ChartCard>
    </div>
  );
}
