'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl } from '@/components/ui/ChartCard';
import { anchorSeriesValue, displayLabel, isSparsePoiSeries, unitLabel } from '@/engine/returns';
import { POIS, PRE_WINDOW_TD, POST_WINDOW_TD } from '@/config/engine';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

const PALETTE = [
  '#00e5ff', '#ff5252', '#69f0ae', '#b388ff', '#ffab40',
  '#ff80ab', '#40c4ff', '#ccff90', '#ffd740', '#ea80fc',
  '#84ffff', '#ff6e40', '#a7ffeb',
];
const DASHES: Array<string | undefined> = [
  undefined, undefined, undefined, undefined,
  '10 4', '10 4', '10 4', '10 4',
  '4 4', '4 4', '4 4', '4 4', '10 3 3 3',
];

const AXIS_TICK = '#8a8a9a';
const AXIS_LINE = '#2a2a3a';
const GRID = '#1c1c2c';
const ZERO = '#3a3a4e';

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
        const dayN = live.dayN ?? 0;
        if (offset >= 0 && offset <= dayN) {
          point.__live__ = anchorSeriesValue(
            series,
            offset,
            anchorMode === 'stepin' ? 'stepin' : 'day0',
            stepDay,
          );
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
  const liveDay = live.dayN;

  const customTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const rows = [...payload]
      .filter((entry: any) => entry.value !== null && entry.value !== undefined && !Number.isNaN(entry.value))
      .sort((left: any, right: any) => Math.abs(right.value) - Math.abs(left.value));
    if (rows.length === 0) return null;

    return (
      <div style={{
        background: 'rgba(12,12,18,0.97)',
        border: '1px solid #2a2a3a',
        borderRadius: 3,
        fontSize: 11,
        fontFamily: 'JetBrains Mono',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        padding: '8px 12px',
        maxHeight: 420,
        overflowY: 'auto',
      }}>
        <div style={{ color: AXIS_TICK, fontWeight: 600, marginBottom: 6, borderBottom: '1px solid #1c1c2c', paddingBottom: 4 }}>
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
                  boxShadow: `0 0 4px ${entry.color}60`,
                }}
              />
              <span style={{ color: '#8a8a9a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {name}
              </span>
              <span style={{ color: value >= 0 ? '#69f0ae' : '#ff5252', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
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
                className={`px-2.5 py-1 text-[10px] tracking-wide uppercase border-y border-r first:border-l first:rounded-l-sm last:rounded-r-sm transition-all ${
                  anchorMode === mode
                    ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/30'
                    : 'bg-transparent text-[#6a6a7a] border-[#2a2a3a] hover:text-[#9a9aaa]'
                }`}
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
      <div className="flex">
        <div className="flex-1 h-[560px] pt-1 pr-1 pb-2 pl-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 28, right: 12, bottom: 22, left: 8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="2 8" />
              <XAxis
                dataKey="offset"
                stroke={AXIS_LINE}
                tick={{ fontSize: 10, fill: AXIS_TICK, fontFamily: 'JetBrains Mono' }}
                ticks={POIS.map((poi) => poi.offset)}
                tickFormatter={(value) => POIS.find((poi) => poi.offset === value)?.label || ''}
                axisLine={{ stroke: AXIS_LINE }}
                tickLine={{ stroke: AXIS_LINE }}
              />
              <YAxis
                domain={yDomain}
                stroke={AXIS_LINE}
                tick={{ fontSize: 10, fill: AXIS_TICK, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(value: number) => `${value > 0 ? '+' : ''}${value.toFixed(0)}`}
                axisLine={{ stroke: AXIS_LINE }}
                tickLine={{ stroke: AXIS_LINE }}
                width={48}
              />
              <Tooltip
                content={customTooltip}
                isAnimationActive={false}
                cursor={{ stroke: '#3a3a4a', strokeWidth: 1, strokeDasharray: '4 4' }}
                wrapperStyle={{ zIndex: 100 }}
              />

              <ReferenceLine y={0} stroke={ZERO} strokeWidth={1} />
              <ReferenceLine
                x={0}
                stroke="#00e5ff"
                strokeDasharray="4 4"
                strokeWidth={1.2}
                label={{ value: 'D+0', position: 'insideTopRight', fill: '#00e5ff', fontSize: 10, fontWeight: 700, offset: 8 }}
              />
              {POIS.filter((poi) => poi.offset !== 0).map((poi) => (
                <ReferenceLine key={poi.label} x={poi.offset} stroke={GRID} strokeDasharray="2 6" />
              ))}
              {anchorMode === 'stepin' && stepDay !== 0 && (
                <ReferenceLine
                  x={stepDay}
                  stroke="#ffab40"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                  label={{ value: `Step D+${stepDay}`, position: 'insideTopRight', fill: '#ffab40', fontSize: 9, offset: 8 }}
                />
              )}
              {liveDay !== null && (
                <ReferenceLine
                  x={liveDay}
                  stroke="#ffab40"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{ value: `D+${liveDay}`, position: 'insideTopRight', fill: '#ffab40', fontSize: 10, fontWeight: 700, offset: 8 }}
                />
              )}

              {activeEventNames.map((eventName, index) => (
                <Line
                  key={eventName}
                  dataKey={eventName}
                  stroke={PALETTE[index % PALETTE.length]}
                  strokeWidth={sparseEvents.has(eventName) ? 1.2 : 1.6}
                  dot={sparseEvents.has(eventName) ? { r: 3, fill: PALETTE[index % PALETTE.length], strokeWidth: 0 } : false}
                  connectNulls={false}
                  strokeDasharray={DASHES[index % DASHES.length]}
                  hide={hiddenLines.has(eventName)}
                  isAnimationActive={false}
                />
              ))}

              {live.returns?.[selectedAsset] && (
                <Line
                  dataKey="__live__"
                  stroke="#ffab40"
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: '#ffab40', strokeWidth: 0 }}
                  connectNulls={false}
                  hide={hiddenLines.has('__live__')}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="w-[190px] shrink-0 border-l border-[#1c1c2c] overflow-y-auto max-h-[560px] py-2 px-1.5" style={{ background: 'linear-gradient(180deg, #0d0d14 0%, #09090e 100%)' }}>
          <div className="text-[9px] text-[#5a5a6a] mb-2 px-1.5 uppercase tracking-widest">
            Click: toggle | Dbl: isolate
          </div>
          {activeEventNames.map((eventName, index) => {
            const hidden = hiddenLines.has(eventName);
            const color = PALETTE[index % PALETTE.length];
            return (
              <button
                key={eventName}
                onClick={() => handleLegendClick(eventName)}
                className="flex items-center gap-1.5 w-full text-left px-1.5 py-[3px] rounded-sm transition-all group"
                style={{ opacity: hidden ? 0.2 : 1 }}
              >
                <span className="w-3 h-[2px] shrink-0 rounded-full transition-all group-hover:h-[3px]" style={{ backgroundColor: color, boxShadow: hidden ? 'none' : `0 0 6px ${color}40` }} />
                <span className={`text-[10px] truncate transition-colors ${hidden ? 'text-[#3a3a4a]' : 'text-[#9a9aaa] group-hover:text-[#d0d0e0]'}`}>
                  {eventName}
                </span>
              </button>
            );
          })}
          {live.returns?.[selectedAsset] && (
            <>
              <div className="border-t border-[#1c1c2c] my-1.5 mx-1" />
              <button
                onClick={() => handleLegendClick('__live__')}
                className="flex items-center gap-1.5 w-full text-left px-1.5 py-[3px] rounded-sm transition-all group"
                style={{ opacity: hiddenLines.has('__live__') ? 0.2 : 1 }}
              >
                <span className="w-3 h-[2px] shrink-0 rounded-full" style={{ backgroundColor: '#ffab40', boxShadow: '0 0 8px #ffab4060' }} />
                <span className="text-[10px] text-[#ffab40] truncate font-medium">Live: {live.name}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </ChartCard>
  );
}
