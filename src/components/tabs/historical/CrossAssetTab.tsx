'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, EmptyState, Button, Badge } from '@/components/ui/ChartCard';
import { anchorSeriesValue, displayLabel, isSparsePoiSeries, unitLabel } from '@/engine/returns';
import { POIS, PRE_WINDOW_TD, POST_WINDOW_TD } from '@/config/engine';
import { CUSTOM_GROUPS } from '@/config/assets';
import { CHART_PALETTE, CHART_THEME } from '@/config/theme';
import { alphaThemeColor, dayZeroMarkerStyle, THEME_COLORS, THEME_FONTS, themeStrokeWidth } from '@/theme/chart';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

const ALL_ASSETS_GROUP = 'All Assets';

export function CrossAssetTab() {
  const {
    eventReturns,
    assetMeta,
    allLabels,
    events,
    activeEvents,
    crossAssetSelection,
    setCrossAssetSelection,
    toggleCrossAssetSelection,
  } = useDashboard();

  const [selectedGroup, setSelectedGroup] = useState<string>(ALL_ASSETS_GROUP);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [assetQuery, setAssetQuery] = useState('');
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const lastClickTime = useRef(0);
  const lastClickKey = useRef('');

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [activeEvents, events]
  );
  const dayZeroStyle = dayZeroMarkerStyle();

  useEffect(() => {
    if (activeEventNames.length > 0 && (!selectedEvent || !activeEventNames.includes(selectedEvent))) {
      setSelectedEvent(activeEventNames[0]);
    }
  }, [activeEventNames, selectedEvent]);

  const groupOptions = useMemo(
    () => [{ value: ALL_ASSETS_GROUP, label: ALL_ASSETS_GROUP }].concat(
      Object.keys(CUSTOM_GROUPS).sort().map((group) => ({ value: group, label: group }))
    ),
    []
  );

  const browsingAssets = useMemo(() => {
    if (selectedGroup === ALL_ASSETS_GROUP) return allLabels;
    return (CUSTOM_GROUPS[selectedGroup] || []).filter((label) => allLabels.includes(label));
  }, [allLabels, selectedGroup]);

  const filteredBrowsingAssets = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    if (!query) return browsingAssets;
    return browsingAssets.filter((asset) => {
      const pretty = displayLabel(assetMeta[asset], asset).toLowerCase();
      return pretty.includes(query) || asset.toLowerCase().includes(query);
    });
  }, [assetMeta, assetQuery, browsingAssets]);

  const selectedAssets = useMemo(
    () => Array.from(crossAssetSelection).filter((label) => allLabels.includes(label)),
    [allLabels, crossAssetSelection]
  );

  const unitSummary = useMemo(() => {
    const units = new Set(selectedAssets.map((asset) => unitLabel(assetMeta[asset])));
    if (units.size === 0) return '%';
    if (units.size === 1) return Array.from(units)[0];
    return 'mixed units';
  }, [assetMeta, selectedAssets]);

  const setGroupSelection = useCallback((mode: 'add' | 'remove') => {
    const next = new Set(crossAssetSelection);
    for (const asset of filteredBrowsingAssets) {
      if (mode === 'add') next.add(asset);
      else next.delete(asset);
    }
    setCrossAssetSelection(next);
  }, [crossAssetSelection, filteredBrowsingAssets, setCrossAssetSelection]);

  const clearAll = useCallback(() => {
    setCrossAssetSelection(new Set());
  }, [setCrossAssetSelection]);

  const { chartData, allLineKeys, sparseEvent } = useMemo(() => {
    if (!selectedEvent || selectedAssets.length === 0) {
      return { chartData: [], allLineKeys: [] as string[], sparseEvent: false };
    }

    const offsets = Array.from({ length: PRE_WINDOW_TD + POST_WINDOW_TD + 1 }, (_, index) => index - PRE_WINDOW_TD);
    const poiOffsets = new Set(POIS.map((poi) => poi.offset));
    const lineKeys = [...selectedAssets];
    const sparseEvent = selectedAssets.some((asset) => isSparsePoiSeries(eventReturns[asset]?.[selectedEvent]));

    const data = offsets.map((offset) => {
      const point: Record<string, number | null> & { offset: number } = { offset };
      for (const asset of selectedAssets) {
        const series = eventReturns[asset]?.[selectedEvent];
        if (!series) {
          point[asset] = null;
          continue;
        }

        if (sparseEvent && !poiOffsets.has(offset)) {
          point[asset] = null;
          continue;
        }

        point[asset] = anchorSeriesValue(series, offset, 'day0');
      }
      return point;
    });

    return { chartData: data, allLineKeys: lineKeys, sparseEvent };
  }, [eventReturns, selectedAssets, selectedEvent]);

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
          return (
            <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1.5px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, flexShrink: 0, boxShadow: `0 0 4px ${alphaThemeColor('shadow', '0.18')}` }} />
              <span style={{ color: CHART_THEME.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {displayLabel(assetMeta[entry.dataKey], entry.dataKey)}
              </span>
              <span style={{ color: value >= 0 ? CHART_THEME.up : CHART_THEME.down, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                {value >= 0 ? '+' : ''}{value.toFixed(2)} {unitSummary}
              </span>
            </div>
          );
        })}
      </div>
    );
  }, [assetMeta, unitSummary]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Cross-Asset Returns"
        subtitle={`${selectedEvent || 'No event selected'} | ${selectedAssets.length} selected assets | ${unitSummary}`}
        controls={
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedEvent} onChange={setSelectedEvent} options={activeEventNames.map((event) => ({ value: event, label: event }))} />
            <Select value={selectedGroup} onChange={setSelectedGroup} options={groupOptions} />
          </div>
        }
      >
        <div className="p-4 border-b border-border/40 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" size="xs" onClick={() => setGroupSelection('add')}>Add Group</Button>
              <Button variant="secondary" size="xs" onClick={() => setGroupSelection('remove')}>Remove Group</Button>
              <Button variant="ghost" size="xs" onClick={clearAll}>Clear All</Button>
            </div>
            <div className="flex items-center gap-2">
              <Badge color="teal">{selectedAssets.length} selected</Badge>
              <Badge color="dim">{filteredBrowsingAssets.length} in browser</Badge>
            </div>
          </div>

          <input
            value={assetQuery}
            onChange={(event) => setAssetQuery(event.target.value)}
            placeholder="Search assets..."
            className="input-field w-full"
          />

          <div className="max-h-[140px] overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {filteredBrowsingAssets.map((asset) => {
              const selected = crossAssetSelection.has(asset);
              return (
                <button
                  key={asset}
                  onClick={() => toggleCrossAssetSelection(asset)}
                  className={`text-left px-2.5 py-2 rounded-sm border transition-all ${
                    selected
                      ? 'text-text-primary'
                      : 'border-border/40 bg-bg-cell/30 text-text-secondary hover:border-border/70'
                  }`}
                  style={selected ? {
                    borderColor: THEME_COLORS.controlActiveBorder,
                    backgroundColor: alphaThemeColor('controlActiveBg', '0.08'),
                    color: THEME_COLORS.textPrimary,
                  } : undefined}
                >
                  <div className="text-2xs font-medium">{displayLabel(assetMeta[asset], asset)}</div>
                  <div className="text-[10px] opacity-70 mt-1">{assetMeta[asset]?.class || 'Unknown'}</div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedAssets.length === 0 ? (
          <EmptyState
            title="No assets selected"
            message="Selection persists independently from the group browser. Search or browse above, then compare the chosen assets on the same event."
          />
        ) : (
          <div className="flex h-[560px] border-t border-border/40">
            <div className="flex-1 relative">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 12, bottom: 20, left: 8 }}>
                  <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="2 8" />
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

                  {allLineKeys.map((key, index) => (
                    <Line
                      key={key}
                      dataKey={key}
                      stroke={CHART_PALETTE[index % CHART_PALETTE.length]}
                      strokeWidth={themeStrokeWidth(sparseEvent ? 1.2 : 1.6)}
                      dot={sparseEvent ? { r: 3, fill: CHART_PALETTE[index % CHART_PALETTE.length], strokeWidth: 0 } : false}
                      connectNulls={false}
                      hide={hiddenLines.has(key)}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="w-[220px] shrink-0 border-l border-border/40 overflow-y-auto py-3 px-2 bg-bg-cell/20">
              <div className="text-3xs text-text-dim uppercase tracking-widest mb-3 px-1 font-semibold">
                Selected Assets
              </div>
              <div className="space-y-1.5">
                {allLineKeys.map((key, index) => {
                  const hidden = hiddenLines.has(key);
                  const color = CHART_PALETTE[index % CHART_PALETTE.length];
                  return (
                    <button
                      key={key}
                      onClick={() => handleLegendClick(key)}
                      className="flex items-center gap-2 w-full text-left px-2 py-2 rounded-sm transition-all table-row-hover group"
                      title="Click to toggle, double-click to isolate"
                      style={{ opacity: hidden ? 0.3 : 1 }}
                    >
                      <span className="w-2 h-[2px] shrink-0 rounded-full transition-all group-hover:h-[3px]" style={{ backgroundColor: color, boxShadow: hidden ? 'none' : `0 0 6px ${alphaThemeColor('shadow', '0.16')}` }} />
                      <span className={`text-2xs truncate transition-colors font-mono ${hidden ? 'text-text-dim' : 'text-text-secondary group-hover:text-text-primary'}`}>
                        {displayLabel(assetMeta[key], key)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <BottomDescription>
          Asset selection persists independently of the group browser, so you can browse one group without losing assets already chosen from another. All series are anchored to Day 0 for the selected event; if units differ across assets, treat the chart as a visual relative comparison rather than a like-for-like magnitude comparison.
        </BottomDescription>
      </ChartCard>
    </div>
  );
}
