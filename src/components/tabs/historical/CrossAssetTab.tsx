'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select } from '@/components/ui/ChartCard';
import { displayLabel, unitLabel } from '@/engine/returns';
import { POIS, PRE_WINDOW_TD, POST_WINDOW_TD } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Axis and grid colors
const AX_TICK = '#8a8a9a';
const AX_LINE = '#2a2a3a';
const GRID_CLR = '#1c1c2c';
const ZERO_CLR = '#3a3a4e';

// Sleek neon-on-dark palette
const PALETTE = [
  '#00e5ff', '#ff5252', '#69f0ae', '#b388ff', '#ffab40',
  '#ff80ab', '#40c4ff', '#ccff90', '#ffd740', '#ea80fc',
  '#84ffff', '#ff6e40', '#a7ffeb', '#ff7043', '#4fc3f7', '#aed581',
];

export function CrossAssetTab() {
  const { eventReturns, assetMeta, allLabels, allClasses, events, activeEvents, live } = useDashboard();

  const [selectedGroup, setSelectedGroup] = useState<string>('Oil & Energy');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const lastClickTime = useRef(0);
  const lastClickKey = useRef('');

  // Get active event names
  const activeEventNames = useMemo(() =>
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]);

  // Initialize selected event
  useEffect(() => {
    if (activeEventNames.length > 0 && (!selectedEvent || !activeEventNames.includes(selectedEvent))) {
      setSelectedEvent(activeEventNames[0]);
    }
  }, [activeEventNames, selectedEvent]);

  // Get assets in the selected group
  const groupAssets = useMemo(() => {
    const groupAssetNames = CUSTOM_GROUPS[selectedGroup] || [];
    return groupAssetNames.filter(a => allLabels.includes(a));
  }, [selectedGroup, allLabels]);

  // Reset hidden lines when group changes
  useEffect(() => {
    setHiddenLines(new Set());
  }, [selectedGroup, selectedEvent]);

  // Build chart data: all assets normalized to Day 0 = 0
  const { chartData, allLineKeys } = useMemo(() => {
    if (!selectedEvent || groupAssets.length === 0) {
      return { chartData: [], allLineKeys: [] };
    }

    const offsets = Array.from({ length: PRE_WINDOW_TD + POST_WINDOW_TD + 1 }, (_, i) => i - PRE_WINDOW_TD);
    const poiSet = new Set(POIS.map(p => p.offset));
    const keys: string[] = [];

    const data = offsets.map(offset => {
      const pt: Record<string, any> = { offset };

      for (const asset of groupAssets) {
        const assetReturns = eventReturns[asset]?.[selectedEvent];
        if (!assetReturns) continue;

        if (!keys.includes(asset)) keys.push(asset);

        const isM = selectedEvent.endsWith('†');
        if (isM && !poiSet.has(offset)) {
          pt[asset] = null;
          continue;
        }

        // Normalize: Day 0 = 0
        const day0Val = assetReturns[0] ?? 0;
        const val = assetReturns[offset] ?? null;
        pt[asset] = val !== null ? val - day0Val : null;
      }

      // Add live event overlay if available
      if (live.returns && selectedEvent === live.name) {
        const lr = live.returns[selectedEvent];
        const dn = live.dayN ?? 0;
        if (offset >= 0 && offset <= dn && lr) {
          const day0Val = lr[0] ?? 0;
          const val = lr[offset] ?? null;
          pt['__live__'] = val !== null ? val - day0Val : null;
        }
      }

      return pt;
    });

    if (live.returns && selectedEvent === live.name && !keys.includes('__live__')) {
      keys.push('__live__');
    }

    return { chartData: data, allLineKeys: keys };
  }, [eventReturns, selectedEvent, groupAssets, live]);

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
    vals.sort((a, b) => a - b);
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

  // Get unit label from first asset in group
  const unit = useMemo(() => {
    if (groupAssets.length === 0) return '%';
    const meta = assetMeta[groupAssets[0]];
    return unitLabel(meta);
  }, [groupAssets, assetMeta]);

  const dayN = live.dayN;

  // Custom tooltip
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
              <span style={{
                width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, flexShrink: 0,
                boxShadow: `0 0 4px ${entry.color}60`
              }} />
              <span style={{
                color: '#8a8a9a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', maxWidth: 160
              }}>{name}</span>
              <span style={{
                color: v >= 0 ? '#69f0ae' : '#ff5252', fontWeight: 600, minWidth: 60, textAlign: 'right'
              }}>
                {v >= 0 ? '+' : ''}{v.toFixed(2)} {unit}
              </span>
            </div>
          );
        })}
      </div>
    );
  }, [unit, live.name]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Cross-Asset Returns"
        subtitle={`${selectedEvent} · ${selectedGroup} · ${allLineKeys.length} assets`}
        controls={
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={selectedEvent}
              onChange={setSelectedEvent}
              options={activeEventNames.map(e => ({ value: e, label: e }))}
            />
            <Select
              value={selectedGroup}
              onChange={setSelectedGroup}
              options={Object.keys(CUSTOM_GROUPS).map(g => ({ value: g, label: g }))}
            />
          </div>
        }
      >
        <div className="flex h-[560px] border-t border-border/40">
          <div className="flex-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 16, right: 12, bottom: 20, left: 8 }}>
                <CartesianGrid stroke="#1e1e22" strokeDasharray="2 8" />
                <XAxis
                  dataKey="offset"
                  stroke="#1e1e22"
                  tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'JetBrains Mono' }}
                  ticks={POIS.map(p => p.offset)}
                  tickFormatter={v => POIS.find(p => p.offset === v)?.label || ''}
                  axisLine={{ stroke: '#1e1e22' }}
                  tickLine={{ stroke: '#1e1e22' }}
                />
                <YAxis
                  domain={yDomain}
                  stroke="#1e1e22"
                  tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`}
                  axisLine={{ stroke: '#1e1e22' }}
                  tickLine={{ stroke: '#1e1e22' }}
                  width={48}
                />
                <Tooltip
                  content={CustomTooltip}
                  isAnimationActive={false}
                  cursor={{ stroke: '#3a3a4a', strokeWidth: 1, strokeDasharray: '4 4' }}
                  wrapperStyle={{ zIndex: 100 }}
                />

                <ReferenceLine y={0} stroke="#3a3a4e" strokeWidth={1} />
                <ReferenceLine
                  x={0}
                  stroke="#00d4aa"
                  strokeDasharray="4 4"
                  strokeWidth={1.2}
                  label={{
                    value: 'D+0',
                    position: 'insideTopRight',
                    fill: '#00d4aa',
                    fontSize: 10,
                    fontWeight: 700,
                    offset: 8
                  }}
                />
                {POIS.filter(p => p.offset !== 0).map(p => (
                  <ReferenceLine
                    key={p.label}
                    x={p.offset}
                    stroke="#1e1e22"
                    strokeDasharray="2 6"
                  />
                ))}
                {dayN !== null && (
                  <ReferenceLine
                    x={dayN}
                    stroke="#ffab40"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{
                      value: `D+${dayN}`,
                      position: 'insideTopRight',
                      fill: '#ffab40',
                      fontSize: 10,
                      fontWeight: 700,
                      offset: 8
                    }}
                  />
                )}

                {allLineKeys.map((key, i) => {
                  if (key === '__live__') {
                    return (
                      <Line
                        key={key}
                        dataKey={key}
                        stroke="#ffab40"
                        strokeWidth={2.5}
                        dot={{ r: 2, fill: '#ffab40', strokeWidth: 0 }}
                        connectNulls={false}
                        hide={hiddenLines.has(key)}
                        isAnimationActive={false}
                      />
                    );
                  }

                  const isMilestone = selectedEvent.endsWith('†');
                  return (
                    <Line
                      key={key}
                      dataKey={key}
                      stroke={PALETTE[i % PALETTE.length]}
                      strokeWidth={isMilestone ? 1.2 : 1.6}
                      dot={isMilestone ? { r: 3, fill: PALETTE[i % PALETTE.length], strokeWidth: 0 } : false}
                      connectNulls={false}
                      hide={hiddenLines.has(key)}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="w-[200px] shrink-0 border-l border-border/40 overflow-y-auto py-3 px-2 bg-bg-cell/20">
            <div className="text-3xs text-text-dim uppercase tracking-widest mb-3 px-1 font-semibold">
              Legend
            </div>
            <div className="space-y-1.5">
              {allLineKeys.map((key, i) => {
                const hidden = hiddenLines.has(key);
                const isLive = key === '__live__';
                const color = isLive ? '#ffab40' : PALETTE[i % PALETTE.length];
                const displayName = isLive ? `▶ ${live.name}` : key;

                return (
                  <button
                    key={key}
                    onClick={() => handleLegendClick(key)}
                    className="flex items-center gap-2 w-full text-left px-2 py-2 rounded-sm transition-all table-row-hover group"
                    title="Click to toggle, double-click to isolate"
                    style={{ opacity: hidden ? 0.3 : 1 }}
                  >
                    <span
                      className="w-2 h-[2px] shrink-0 rounded-full transition-all group-hover:h-[3px]"
                      style={{
                        backgroundColor: color,
                        boxShadow: hidden ? 'none' : `0 0 6px ${color}60`
                      }}
                    />
                    <span
                      className={`text-2xs truncate transition-colors font-mono ${
                        hidden
                          ? 'text-text-dim'
                          : 'text-text-secondary group-hover:text-text-primary'
                      }`}
                    >
                      {displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
