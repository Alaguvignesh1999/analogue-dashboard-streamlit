'use client';
import { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, StatBox } from '@/components/ui/ChartCard';
import { DiagnosticsStrip } from '@/components/ui/DiagnosticsStrip';
import { displayLabel, unitLabel, poiRet } from '@/engine/returns';
import { getLiveDisplayDay, getLiveDisplayDate } from '@/engine/live';
import { filterScoresByActiveEvents, selectEvents, compositeReturn } from '@/engine/similarity';
import { POIS, POST_WINDOW_TD } from '@/config/engine';
import { nanMedian } from '@/lib/math';
import { fmtReturn } from '@/lib/format';
import { CHART_THEME } from '@/config/theme';
import { dayZeroMarkerStyle, getEventLineStyle, THEME_FONTS, themedHeatColor, themeDashPattern, themeStrokeWidth } from '@/theme/chart';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';

function heatColor(value: number, maxAbs: number, isRates: boolean): string {
  return themedHeatColor(value, maxAbs, !isRates);
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
  const displayDayN = getLiveDisplayDay(live);
  const displayDate = getLiveDisplayDate(live);
  const meta = assetMeta[selectedAsset];
  const isRates = meta?.is_rates_bp || false;
  const unit = unitLabel(meta);
  const dayZeroStyle = dayZeroMarkerStyle();

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
    const futurePois = POIS.filter((poi) => poi.offset > displayDayN);
    if (futurePois.length === 0 || selectedEvents.length === 0) return null;

    let maxAbs = 0;
      const rows = futurePois.map((poi) => {
        const values: number[] = [];
        for (const eventName of selectedEvents) {
        const startValue = poiRet(eventReturns, selectedAsset, eventName, displayDayN);
        const finishValue = poiRet(eventReturns, selectedAsset, eventName, poi.offset);
        if (!Number.isNaN(startValue) && !Number.isNaN(finishValue)) values.push(finishValue - startValue);
      }
      const med = values.length >= 2 ? nanMedian(values) : Number.NaN;
      maxAbs = Math.max(maxAbs, Math.abs(med) || 0);
      return { label: poi.label, offset: poi.offset, med, n: values.length };
    });

    return { rows, maxAbs: maxAbs || 5 };
  }, [eventReturns, selectedAsset, selectedEvents, displayDayN]);

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
        subtitle={`${selectedEvents.length} analogues | live D+${displayDayN}${displayDate ? ` (${displayDate})` : ''} | ${unit}`}
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
            <DiagnosticsStrip
              live={live}
              labels={[selectedAsset]}
              scoringMode="live-sim"
              extra={<span>Path asset: {displayLabel(meta, selectedAsset)}</span>}
            />

            <div className="px-4 pt-4 grid grid-cols-3 gap-3">
              <StatBox label="Live Path" value={`${chartStats.current > 0 ? '+' : ''}${chartStats.current.toFixed(1)}`} color={chartStats.current >= 0 ? CHART_THEME.up : CHART_THEME.down} />
              <StatBox label="Range" value={`+/-${chartStats.range.toFixed(1)}`} color={CHART_THEME.accentTeal} />
              <StatBox label="Analogues" value={selectedEvents.length} sub={displayDate || '--'} color={CHART_THEME.textPrimary} />
            </div>

            <div className="h-[400px] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 12, bottom: 16, left: 8 }}>
                  <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="2 8" vertical={false} />
                  <XAxis
                    dataKey="offset"
                    stroke={CHART_THEME.axisLine}
                    tick={{ fontSize: 10, fill: CHART_THEME.textMuted, fontFamily: THEME_FONTS.mono }}
                    tickFormatter={(value) => `D+${value}`}
                  />
                  <YAxis
                    stroke={CHART_THEME.axisLine}
                    tick={{ fontSize: 10, fill: CHART_THEME.textMuted, fontFamily: THEME_FONTS.mono }}
                    tickFormatter={(value: number) => `${value > 0 ? '+' : ''}${value.toFixed(0)}`}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.gridBright}`, borderRadius: 2, fontSize: 11, fontFamily: THEME_FONTS.mono, color: CHART_THEME.textPrimary }}
                    labelFormatter={(value) => `Day +${value}`}
                  />
                  <Legend
                    height={32}
                    wrapperStyle={{ paddingTop: '8px', fontSize: 11, color: CHART_THEME.textSecondary, fontFamily: THEME_FONTS.mono }}
                    iconType="line"
                  />
                  <ReferenceLine y={0} stroke={CHART_THEME.zero} strokeWidth={1} />
                  <ReferenceLine
                    x={0}
                    stroke={dayZeroStyle.stroke}
                    strokeDasharray={dayZeroStyle.strokeDasharray}
                    strokeWidth={dayZeroStyle.strokeWidth}
                  />
                  <ReferenceLine
                    x={displayDayN}
                    stroke={CHART_THEME.live}
                    strokeDasharray={themeDashPattern('3 3')}
                    label={{ value: `D+${displayDayN}`, position: 'top', fill: CHART_THEME.live, fontSize: 10 }}
                  />
                  {selectedEvents.map((eventName, index) => {
                    const lineStyle = getEventLineStyle(eventName, index, 1);
                    return (
                      <Line
                        key={eventName}
                        dataKey={eventName}
                        stroke={lineStyle.color}
                        strokeWidth={lineStyle.strokeWidth}
                        strokeOpacity={0.85}
                        dot={false}
                        connectNulls={false}
                        strokeDasharray={lineStyle.strokeDasharray}
                        isAnimationActive={false}
                      />
                    );
                  })}
                  <Line dataKey="Composite" stroke={CHART_THEME.accentTeal} strokeWidth={themeStrokeWidth(2.5)} strokeDasharray={themeDashPattern('6 3')} dot={false} connectNulls={false} isAnimationActive={false} name="Composite" />
                  {live.returns?.[selectedAsset] && (
                    <Line
                      dataKey="__live__"
                      stroke={CHART_THEME.live}
                      strokeWidth={themeStrokeWidth(2.5)}
                      dot={{ r: 2.5, fill: CHART_THEME.live, strokeWidth: 0 }}
                      connectNulls={false}
                      isAnimationActive={false}
                      name="Live"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <BottomDescription>
              The orange live line and orange vertical marker use the same live D+N logic as Overlay, so both tabs show the same current live point.
            </BottomDescription>
          </>
        )}
      </ChartCard>

      {fwdHeatmap && selectedEvents.length > 0 && (
        <ChartCard title="Forward Returns" subtitle={`Median forward from live D+${displayDayN} to future POIs`}>
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
