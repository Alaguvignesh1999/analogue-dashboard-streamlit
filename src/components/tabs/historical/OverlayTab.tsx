'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, SliderControl } from '@/components/ui/ChartCard';
import { DiagnosticsStrip } from '@/components/ui/DiagnosticsStrip';
import { anchorSeriesValue, displayLabel, isSparsePoiSeries, unitLabel } from '@/engine/returns';
import { getLiveDisplayDay } from '@/engine/live';
import { POIS, PRE_WINDOW_TD, POST_WINDOW_TD } from '@/config/engine';
import { CHART_THEME } from '@/config/theme';
import { alphaThemeColor, dayZeroMarkerStyle, getEventLineStyle, THEME_FONTS, themeDashPattern, themeStrokeWidth, segmentedControlStyle } from '@/theme/chart';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

const DASHES: Array<string | undefined> = [
  undefined, undefined, undefined, undefined,
  '10 4', '10 4', '10 4', '10 4',
  '4 4', '4 4', '4 4', '4 4', '10 3 3 3',
];

export function OverlayTab() {
  const { eventReturns, assetMeta, allClasses, events, activeEvents, live } = useDashboard();

  const [selectedClass, setSelectedClass] = useState('Oil & Energy');
  const [selectedAsset, setSelectedAsset] = useState('Brent Futures');
  const [anchorMode, setAnchorMode] = useState<'day0' | 'stepin'>('day0');
  const [stepDay, setStepDay] = useState(0);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const lastClickTime = useRef(0);
  const lastClickKey = useRef('');

  const classAssets = useMemo(
    () => Object.entries(assetMeta).filter(([, meta]) => meta.class === selectedClass).map(([label]) => label),
    [assetMeta, selectedClass]
  );

  useEffect(() => {
    if (classAssets.length > 0 && !classAssets.includes(selectedAsset)) {
      setSelectedAsset(classAssets[0]);
    }
  }, [classAssets, selectedAsset]);

  useEffect(() => {
    setHiddenLines(new Set());
  }, [selectedAsset]);

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [activeEvents, events]
  );

  const { chartData, allLineKeys, sparseEvents } = useMemo(() => {
    const offsets = Array.from({ length: PRE_WINDOW_TD + POST_WINDOW_TD + 1 }, (_, index) => index - PRE_WINDOW_TD);
    const poiOffsets = new Set(POIS.map((poi) => poi.offset));
    const lineKeys: string[] = [];
    const sparse = new Set<string>();

    const data = offsets.map((offset) => {
      const point: Record<string, number | null> & { offset: number } = { offset };

      for (const eventName of activeEventNames) {
        const series = eventReturns[selectedAsset]?.[eventName];
        if (!series) continue;

        if (!lineKeys.includes(eventName)) lineKeys.push(eventName);
        if (isSparsePoiSeries(series)) sparse.add(eventName);

        if (isSparsePoiSeries(series) && !poiOffsets.has(offset)) {
          point[eventName] = null;
          continue;
        }

        point[eventName] = anchorSeriesValue(
          series,
          offset,
          anchorMode === 'stepin' ? 'stepin' : 'day0',
          stepDay,
        );
      }

      if (live.returns?.[selectedAsset]) {
        const series = live.returns[selectedAsset];
        const liveValue = anchorSeriesValue(
          series,
          offset,
          anchorMode === 'stepin' ? 'stepin' : 'day0',
          stepDay,
        );
        if (liveValue !== null) {
          point.__live__ = liveValue;
        }
      }

      return point;
    });

    if (live.returns?.[selectedAsset] && !lineKeys.includes('__live__')) {
      lineKeys.push('__live__');
    }

    return { chartData: data, allLineKeys: lineKeys, sparseEvents: sparse };
  }, [activeEventNames, anchorMode, eventReturns, live.dayN, live.returns, selectedAsset, stepDay]);

  const yDomain = useMemo(() => {
    const values: number[] = [];
    for (const point of chartData) {
      for (const key of allLineKeys) {
        if (hiddenLines.has(key)) continue;
        const value = point[key as keyof typeof point];
        if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
      }
    }

    if (values.length === 0) return [-5, 5] as [number, number];
    values.sort((left, right) => left - right);

    const low = values[Math.floor(values.length * 0.01)];
    const high = values[Math.ceil(values.length * 0.99) - 1];
    const padding = Math.max((high - low) * 0.12, 0.5);
    return [low - padding, high + padding] as [number, number];
  }, [allLineKeys, chartData, hiddenLines]);

  const handleLegendClick = useCallback((key: string) => {
    const now = Date.now();
    const doubleClick = now - lastClickTime.current < 350 && lastClickKey.current === key;
    lastClickTime.current = now;
    lastClickKey.current = key;

    if (doubleClick) {
      const others = allLineKeys.filter((lineKey) => lineKey !== key);
      setHiddenLines(others.every((lineKey) => hiddenLines.has(lineKey)) ? new Set() : new Set(others));
      return;
    }

    setHiddenLines((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [allLineKeys, hiddenLines]);

  const meta = assetMeta[selectedAsset];
  const unit = unitLabel(meta);
  const title = displayLabel(meta, selectedAsset);
  const liveDay = live.returns?.[selectedAsset] ? getLiveDisplayDay(live) : null;
  const dayZeroStyle = dayZeroMarkerStyle();

  const customTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const rows = [...payload]
      .filter((entry: any) => entry.value !== null && entry.value !== undefined && !Number.isNaN(entry.value))
      .sort((left: any, right: any) => Math.abs(right.value) - Math.abs(left.value));
    if (rows.length === 0) return null;

    return (
      <div style={{
        background: CHART_THEME.tooltipBg,
        border: `1px solid ${CHART_THEME.gridBright}`,
        borderRadius: 3,
        fontSize: 11,
        fontFamily: THEME_FONTS.mono,
        boxShadow: `0 8px 32px ${alphaThemeColor('shadow', '0.18')}`,
        padding: '8px 12px',
        maxHeight: 420,
        overflowY: 'auto',
      }}>
        <div style={{ color: CHART_THEME.textMuted, fontWeight: 600, marginBottom: 6, borderBottom: `1px solid ${CHART_THEME.grid}`, paddingBottom: 4 }}>
          Day {Number(label) >= 0 ? '+' : ''}{label}
        </div>
        {rows.map((entry: any) => {
          const value = Number(entry.value);
          const name = entry.dataKey === '__live__' ? `Live: ${live.name}` : entry.dataKey;
          return (
            <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1.5px 0' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: entry.color,
                  flexShrink: 0,
                  boxShadow: `0 0 4px ${alphaThemeColor('shadow', '0.18')}`,
                }}
              />
              <span style={{ color: CHART_THEME.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {name}
              </span>
              <span style={{ color: value >= 0 ? CHART_THEME.up : CHART_THEME.down, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                {value >= 0 ? '+' : ''}{value.toFixed(2)} {unit}
              </span>
            </div>
          );
        })}
      </div>
    );
  }, [live.name, unit]);

  return (
    <ChartCard
      title={title}
      subtitle={`${activeEventNames.length} events | ${unit} | ${anchorMode === 'stepin' ? `anchored Step D+${stepDay}` : 'anchored Day 0'}`}
      controls={
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedClass} onChange={setSelectedClass} options={allClasses.map((value) => ({ value, label: value }))} />
          <Select
            value={selectedAsset}
            onChange={setSelectedAsset}
            options={classAssets.map((asset) => ({ value: asset, label: displayLabel(assetMeta[asset], asset) }))}
          />
          <div className="flex">
            {(['day0', 'stepin'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setAnchorMode(mode)}
                className="px-2.5 py-1 text-[10px] font-mono tracking-wide uppercase border-y border-r first:border-l first:rounded-l-sm last:rounded-r-sm transition-all"
                style={segmentedControlStyle(anchorMode === mode)}
              >
                {mode === 'day0' ? 'Day 0' : 'Step-In'}
              </button>
            ))}
          </div>
          {anchorMode === 'stepin' && (
            <SliderControl label="" value={stepDay} onChange={setStepDay} min={-PRE_WINDOW_TD} max={POST_WINDOW_TD} />
          )}
        </div>
      }
    >
      <DiagnosticsStrip
        live={live}
        labels={[selectedAsset]}
        scoringMode="live-sim"
        extra={<span>Overlay asset: {title}</span>}
      />
      <div className="flex">
        <div className="flex-1 h-[560px] pt-1 pr-1 pb-2 pl-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 28, right: 12, bottom: 22, left: 8 }}>
              <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="2 8" vertical={false} />
              <XAxis
                dataKey="offset"
                stroke={CHART_THEME.axisLine}
                tick={{ fontSize: 10, fill: CHART_THEME.textMuted, fontFamily: THEME_FONTS.mono }}
                ticks={POIS.map((poi) => poi.offset)}
                tickFormatter={(value) => POIS.find((poi) => poi.offset === value)?.label || ''}
                axisLine={{ stroke: CHART_THEME.axisLine }}
                tickLine={{ stroke: CHART_THEME.axisLine }}
              />
              <YAxis
                domain={yDomain}
                stroke={CHART_THEME.axisLine}
                tick={{ fontSize: 10, fill: CHART_THEME.textMuted, fontFamily: THEME_FONTS.mono }}
                tickFormatter={(value: number) => `${value > 0 ? '+' : ''}${value.toFixed(0)}`}
                axisLine={{ stroke: CHART_THEME.axisLine }}
                tickLine={{ stroke: CHART_THEME.axisLine }}
                width={48}
              />
              <Tooltip
                content={customTooltip}
                isAnimationActive={false}
                cursor={{ stroke: CHART_THEME.zero, strokeWidth: 1, strokeDasharray: '4 4' }}
                wrapperStyle={{ zIndex: 100 }}
              />

              <ReferenceLine y={0} stroke={CHART_THEME.zero} strokeWidth={1} />
              <ReferenceLine
                x={0}
                stroke={dayZeroStyle.stroke}
                strokeDasharray={dayZeroStyle.strokeDasharray}
                strokeWidth={dayZeroStyle.strokeWidth}
                label={{ value: 'D+0', position: 'insideTopRight', fill: dayZeroStyle.stroke, fontSize: 10, fontWeight: 700, offset: 8 }}
              />
              {POIS.filter((poi) => poi.offset !== 0).map((poi) => (
                <ReferenceLine key={poi.label} x={poi.offset} stroke={CHART_THEME.grid} strokeDasharray="2 6" />
              ))}
              {anchorMode === 'stepin' && stepDay !== 0 && (
                <ReferenceLine
                  x={stepDay}
                  stroke={CHART_THEME.live}
                  strokeDasharray={themeDashPattern('6 3')}
                  strokeWidth={themeStrokeWidth(1)}
                  label={{ value: `Step D+${stepDay}`, position: 'insideTopRight', fill: CHART_THEME.live, fontSize: 9, offset: 8 }}
                />
              )}
              {liveDay !== null && (
                <ReferenceLine
                  x={liveDay}
                  stroke={CHART_THEME.live}
                  strokeDasharray={themeDashPattern('3 3')}
                  strokeWidth={themeStrokeWidth(1.5)}
                  label={{ value: `D+${liveDay}`, position: 'insideTopRight', fill: CHART_THEME.live, fontSize: 10, fontWeight: 700, offset: 8 }}
                />
              )}

              {activeEventNames.map((eventName, index) => {
                const lineStyle = getEventLineStyle(eventName, index, sparseEvents.has(eventName) ? 1.2 : 1.6, DASHES[index % DASHES.length]);
                return (
                <Line
                  key={eventName}
                  dataKey={eventName}
                  stroke={lineStyle.color}
                  strokeWidth={lineStyle.strokeWidth}
                  dot={sparseEvents.has(eventName) ? { r: 3, fill: lineStyle.color, strokeWidth: 0 } : false}
                  connectNulls={false}
                  strokeDasharray={lineStyle.strokeDasharray}
                  hide={hiddenLines.has(eventName)}
                  isAnimationActive={false}
                />
                );
              })}

              {live.returns?.[selectedAsset] && (
                <Line
                  dataKey="__live__"
                  stroke={CHART_THEME.live}
                  strokeWidth={themeStrokeWidth(2.5)}
                  dot={{ r: 2, fill: CHART_THEME.live, strokeWidth: 0 }}
                  connectNulls={false}
                  hide={hiddenLines.has('__live__')}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="w-[190px] shrink-0 border-l border-border/60 overflow-y-auto max-h-[560px] py-2 px-1.5 bg-bg-cell/30">
          <div className="text-[9px] text-text-dim mb-2 px-1.5 uppercase tracking-widest">
            Click: toggle | Dbl: isolate
          </div>
          {activeEventNames.map((eventName, index) => {
            const hidden = hiddenLines.has(eventName);
            const color = getEventLineStyle(eventName, index).color;
            return (
              <button
                key={eventName}
                onClick={() => handleLegendClick(eventName)}
                className="flex items-center gap-1.5 w-full text-left px-1.5 py-[3px] rounded-sm transition-all group"
                style={{ opacity: hidden ? 0.2 : 1 }}
              >
                <span className="w-3 h-[2px] shrink-0 rounded-full transition-all group-hover:h-[3px]" style={{ backgroundColor: color, boxShadow: hidden ? 'none' : `0 0 6px ${alphaThemeColor('shadow', '0.16')}` }} />
                <span className={`text-[10px] truncate transition-colors ${hidden ? 'text-text-dim' : 'text-text-secondary group-hover:text-text-primary'}`}>
                  {eventName}
                </span>
              </button>
            );
          })}
          {live.returns?.[selectedAsset] && (
            <>
              <div className="border-t border-border/50 my-1.5 mx-1" />
              <button
                onClick={() => handleLegendClick('__live__')}
                className="flex items-center gap-1.5 w-full text-left px-1.5 py-[3px] rounded-sm transition-all group"
                style={{ opacity: hiddenLines.has('__live__') ? 0.2 : 1 }}
              >
                <span className="w-3 h-[2px] shrink-0 rounded-full" style={{ backgroundColor: CHART_THEME.live, boxShadow: `0 0 8px ${alphaThemeColor('live', '0.35')}` }} />
                <span className="text-[10px] text-live truncate font-medium">Live: {live.name}</span>
              </button>
            </>
          )}
        </div>
      </div>
      <BottomDescription>
        Day 0 mode rebases every series at the event anchor. Step-In mode rebases at the chosen entry day so you can compare paths from a delayed entry. Sparse historical events only plot at POI checkpoints, and the live line now extends through the available pre-event window as well as the post-event path.
      </BottomDescription>
    </ChartCard>
  );
}
