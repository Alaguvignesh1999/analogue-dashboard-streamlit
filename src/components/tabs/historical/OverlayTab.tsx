'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl } from '@/components/ui/ChartCard';
import { displayLabel, unitLabel } from '@/engine/returns';
import { POIS, PRE_WINDOW_TD, POST_WINDOW_TD } from '@/config/engine';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Sleek neon-on-dark palette
const PALETTE = [
  '#00e5ff','#ff5252','#69f0ae','#b388ff','#ffab40',
  '#ff80ab','#40c4ff','#ccff90','#ffd740','#ea80fc',
  '#84ffff','#ff6e40','#a7ffeb',
];
const DASHES: (string | undefined)[] = [
  undefined,undefined,undefined,undefined,
  '10 4','10 4','10 4','10 4',
  '4 4','4 4','4 4','4 4','10 3 3 3',
];

// Axis and grid colors — clearly visible on dark background
const AX_TICK   = '#8a8a9a';
const AX_LINE   = '#2a2a3a';
const GRID_CLR  = '#1c1c2c';
const ZERO_CLR  = '#3a3a4e';

export function OverlayTab() {
  const { eventReturns, assetMeta, allClasses, events, activeEvents, live } = useDashboard();

  const [selectedClass, setSelectedClass] = useState('Oil & Energy');
  const [selectedAsset, setSelectedAsset] = useState('Brent Futures');
  const [anchorMode, setAnchorMode] = useState<'day0'|'stepin'>('day0');
  const [stepDay, setStepDay] = useState(0);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const lastClickTime = useRef(0);
  const lastClickKey = useRef('');

  const classAssets = useMemo(() =>
    Object.entries(assetMeta).filter(([,m]) => m.class === selectedClass).map(([l]) => l),
    [assetMeta, selectedClass]);

  useEffect(() => {
    if (classAssets.length > 0 && !classAssets.includes(selectedAsset))
      setSelectedAsset(classAssets[0]);
  }, [classAssets, selectedAsset]);

  useEffect(() => { setHiddenLines(new Set()); }, [selectedAsset]);

  const activeEventNames = useMemo(() =>
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]);

  const { chartData, allLineKeys } = useMemo(() => {
    const offsets = Array.from({length: PRE_WINDOW_TD+POST_WINDOW_TD+1}, (_,i) => i-PRE_WINDOW_TD);
    const poiSet = new Set(POIS.map(p => p.offset));
    const keys: string[] = [];

    const data = offsets.map(offset => {
      const pt: Record<string, any> = { offset };
      for (const en of activeEventNames) {
        const isM = en.endsWith('†');
        const s = eventReturns[selectedAsset]?.[en];
        if (!s) continue;
        if (!keys.includes(en)) keys.push(en);
        if (isM && !poiSet.has(offset)) { pt[en] = null; continue; }
        let val: number|null = s[offset] ?? null;
        if (val !== null && anchorMode === 'stepin' && stepDay !== 0)
          val = val - (s[stepDay] ?? 0);
        pt[en] = val;
      }
      if (live.returns?.[selectedAsset]) {
        const lr = live.returns[selectedAsset];
        const dn = live.dayN ?? 0;
        if (offset >= 0 && offset <= dn) {
          let val: number|null = lr[offset] ?? null;
          if (val !== null && anchorMode === 'stepin' && stepDay !== 0)
            val = val - (lr[stepDay] ?? 0);
          pt['__live__'] = val;
        }
      }
      return pt;
    });
    if (live.returns?.[selectedAsset] && !keys.includes('__live__')) keys.push('__live__');
    return { chartData: data, allLineKeys: keys };
  }, [eventReturns, selectedAsset, activeEventNames, anchorMode, stepDay, live]);

  // Auto-scale Y from visible lines
  const yDomain = useMemo(() => {
    const vals: number[] = [];
    for (const pt of chartData) {
      for (const key of allLineKeys) {
        if (hiddenLines.has(key)) continue;
        const v = pt[key];
        if (v !== null && v !== undefined && typeof v === 'number' && isFinite(v)) vals.push(v);
      }
    }
    if (vals.length === 0) return [-5, 5] as [number, number];
    vals.sort((a,b) => a-b);
    const lo = vals[Math.floor(vals.length * 0.01)];
    const hi = vals[Math.ceil(vals.length * 0.99) - 1];
    const pad = Math.max((hi - lo) * 0.12, 0.5);
    return [lo - pad, hi + pad] as [number, number];
  }, [chartData, allLineKeys, hiddenLines]);

  const handleLegendClick = useCallback((key: string) => {
    const now = Date.now();
    const isDbl = (now - lastClickTime.current < 350) && lastClickKey.current === key;
    lastClickTime.current = now;
    lastClickKey.current = key;
    if (isDbl) {
      const others = allLineKeys.filter(k => k !== key);
      setHiddenLines(others.every(k => hiddenLines.has(k)) ? new Set() : new Set(others));
    } else {
      setHiddenLines(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    }
  }, [allLineKeys, hiddenLines]);

  const meta = assetMeta[selectedAsset];
  const unit = unitLabel(meta);
  const dLabel = displayLabel(meta, selectedAsset);
  const dayN = live.dayN;

  // Custom tooltip — sorts entries by value descending, adds color dots
  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const sorted = [...payload]
      .filter((p: any) => p.value !== null && p.value !== undefined && !isNaN(p.value))
      .sort((a: any, b: any) => Math.abs(b.value) - Math.abs(a.value));
    if (sorted.length === 0) return null;
    return (
      <div style={{
        background: 'rgba(12,12,18,0.97)', border: '1px solid #2a2a3a', borderRadius: 3,
        fontSize: 11, fontFamily: 'JetBrains Mono', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        padding: '8px 12px', maxHeight: 420, overflowY: 'auto',
      }}>
        <div style={{ color: AX_TICK, fontWeight: 600, marginBottom: 6, borderBottom: '1px solid #1c1c2c', paddingBottom: 4 }}>
          Day {Number(label) >= 0 ? '+' : ''}{label}
        </div>
        {sorted.map((entry: any) => {
          const v = Number(entry.value);
          const name = entry.dataKey === '__live__' ? `▶ ${live.name}` : entry.dataKey;
          return (
            <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1.5px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, flexShrink: 0,
                boxShadow: `0 0 4px ${entry.color}60` }} />
              <span style={{ color: '#8a8a9a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{name}</span>
              <span style={{ color: v >= 0 ? '#69f0ae' : '#ff5252', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                {v >= 0 ? '+' : ''}{v.toFixed(2)} {unit}
              </span>
            </div>
          );
        })}
      </div>
    );
  }, [unit, live.name]);

  return (
    <ChartCard
      title={dLabel}
      subtitle={`${activeEventNames.length} events · ${unit} · ${anchorMode === 'stepin' ? `anchored D+${stepDay}` : 'anchored Day 0'}`}
      controls={
        <div className="flex items-center gap-2 flex-wrap">
          <Select label="" value={selectedClass} onChange={setSelectedClass}
            options={allClasses.map(c => ({ value: c, label: c }))} />
          <Select label="" value={selectedAsset} onChange={setSelectedAsset}
            options={classAssets.map(a => ({ value: a, label: displayLabel(assetMeta[a], a) }))} />
          <div className="flex">
            {(['day0','stepin'] as const).map(m => (
              <button key={m} onClick={() => setAnchorMode(m)}
                className={`px-2.5 py-1 text-[10px] tracking-wide uppercase border-y border-r first:border-l first:rounded-l-sm last:rounded-r-sm transition-all
                  ${anchorMode === m ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/30' : 'bg-transparent text-[#6a6a7a] border-[#2a2a3a] hover:text-[#9a9aaa]'}`}>
                {m === 'day0' ? 'Day 0' : 'Step-In'}
              </button>
            ))}
          </div>
          {anchorMode === 'stepin' && (
            <SliderControl label="" value={stepDay} onChange={setStepDay}
              min={-PRE_WINDOW_TD} max={POST_WINDOW_TD} />
          )}
        </div>
      }
    >
      <div className="flex">
        <div className="flex-1 h-[560px] pt-1 pr-1 pb-2 pl-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 28, right: 12, bottom: 22, left: 8 }}>
              <CartesianGrid stroke={GRID_CLR} strokeDasharray="2 8" />
              <XAxis
                dataKey="offset" stroke={AX_LINE}
                tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }}
                ticks={POIS.map(p => p.offset)}
                tickFormatter={v => POIS.find(p => p.offset === v)?.label || ''}
                axisLine={{ stroke: AX_LINE }}
                tickLine={{ stroke: AX_LINE }}
              />
              <YAxis
                domain={yDomain} stroke={AX_LINE}
                tick={{ fontSize: 10, fill: AX_TICK, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`}
                axisLine={{ stroke: AX_LINE }}
                tickLine={{ stroke: AX_LINE }}
                width={48}
              />
              <Tooltip
                content={CustomTooltip}
                isAnimationActive={false}
                cursor={{ stroke: '#3a3a4a', strokeWidth: 1, strokeDasharray: '4 4' }}
                wrapperStyle={{ zIndex: 100 }}
              />

              <ReferenceLine y={0} stroke={ZERO_CLR} strokeWidth={1} />
              <ReferenceLine x={0} stroke="#00e5ff" strokeDasharray="4 4" strokeWidth={1.2}
                label={{ value: 'D+0', position: 'insideTopRight', fill: '#00e5ff', fontSize: 10, fontWeight: 700, offset: 8 }} />
              {POIS.filter(p => p.offset !== 0).map(p => (
                <ReferenceLine key={p.label} x={p.offset} stroke={GRID_CLR} strokeDasharray="2 6" />
              ))}
              {anchorMode === 'stepin' && stepDay !== 0 && (
                <ReferenceLine x={stepDay} stroke="#ffab40" strokeDasharray="6 3" strokeWidth={1}
                  label={{ value: `Step D+${stepDay}`, position: 'insideTopRight', fill: '#ffab40', fontSize: 9, offset: 8 }} />
              )}
              {dayN !== null && (
                <ReferenceLine x={dayN} stroke="#ffab40" strokeDasharray="3 3" strokeWidth={1.5}
                  label={{ value: `D+${dayN}`, position: 'insideTopRight', fill: '#ffab40', fontSize: 10, fontWeight: 700, offset: 8 }} />
              )}

              {activeEventNames.map((en, i) => (
                <Line key={en} dataKey={en}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={en.endsWith('†') ? 1.2 : 1.6}
                  dot={en.endsWith('†') ? { r: 3, fill: PALETTE[i % PALETTE.length], strokeWidth: 0 } : false}
                  connectNulls={false}
                  strokeDasharray={DASHES[i % DASHES.length]}
                  hide={hiddenLines.has(en)}
                  isAnimationActive={false}
                />
              ))}
              {live.returns?.[selectedAsset] && (
                <Line dataKey="__live__" stroke="#ffab40" strokeWidth={2.5}
                  dot={{ r: 2, fill: '#ffab40', strokeWidth: 0 }}
                  connectNulls={false} hide={hiddenLines.has('__live__')}
                  isAnimationActive={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Sidebar legend */}
        <div className="w-[190px] shrink-0 border-l border-[#1c1c2c] overflow-y-auto max-h-[560px] py-2 px-1.5"
          style={{ background: 'linear-gradient(180deg, #0d0d14 0%, #09090e 100%)' }}>
          <div className="text-[9px] text-[#5a5a6a] mb-2 px-1.5 uppercase tracking-widest">
            Click: toggle · Dbl: isolate
          </div>
          {activeEventNames.map((en, i) => {
            const hidden = hiddenLines.has(en);
            const color = PALETTE[i % PALETTE.length];
            return (
              <button key={en} onClick={() => handleLegendClick(en)}
                className="flex items-center gap-1.5 w-full text-left px-1.5 py-[3px] rounded-sm transition-all group"
                style={{ opacity: hidden ? 0.2 : 1 }}>
                <span className="w-3 h-[2px] shrink-0 rounded-full transition-all group-hover:h-[3px]"
                  style={{ backgroundColor: color, boxShadow: hidden ? 'none' : `0 0 6px ${color}40` }} />
                <span className={`text-[10px] truncate transition-colors ${hidden ? 'text-[#3a3a4a]' : 'text-[#9a9aaa] group-hover:text-[#d0d0e0]'}`}>
                  {en}
                </span>
              </button>
            );
          })}
          {live.returns?.[selectedAsset] && (
            <>
              <div className="border-t border-[#1c1c2c] my-1.5 mx-1" />
              <button onClick={() => handleLegendClick('__live__')}
                className="flex items-center gap-1.5 w-full text-left px-1.5 py-[3px] rounded-sm transition-all group"
                style={{ opacity: hiddenLines.has('__live__') ? 0.2 : 1 }}>
                <span className="w-3 h-[2px] shrink-0 rounded-full"
                  style={{ backgroundColor: '#ffab40', boxShadow: '0 0 8px #ffab4060' }} />
                <span className="text-[10px] text-[#ffab40] truncate font-medium">▶ {live.name}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </ChartCard>
  );
}
