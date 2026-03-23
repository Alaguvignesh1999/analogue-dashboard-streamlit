'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard } from '@/components/ui/ChartCard';
import { getLiveDisplayDate, getLiveDisplayDay } from '@/engine/live';
import { nanMedian, nanPercentile } from '@/lib/math';
import { PRE_WINDOW_TD, POST_WINDOW_TD, POIS } from '@/config/engine';
import { CHART_THEME } from '@/config/theme';
import { alphaThemeColor, dayZeroMarkerStyle, getEventLineStyle, THEME_FONTS, themeStrokeWidth } from '@/theme/chart';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';

export function VixTab() {
  const { eventReturns, events, activeEvents, live } = useDashboard();

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name) && !!eventReturns.VIX?.[event.name]).map((event) => event.name),
    [activeEvents, eventReturns, events],
  );
  const liveVixDay = getLiveDisplayDay(live);
  const liveVixDate = getLiveDisplayDate(live);
  const dayZeroStyle = dayZeroMarkerStyle();

  const { chartData, hasData, medianStats } = useMemo(() => {
    const offsets = Array.from({ length: PRE_WINDOW_TD + POST_WINDOW_TD + 1 }, (_, index) => index - PRE_WINDOW_TD);

    const data = offsets.map((offset) => {
      const point: Record<string, any> = { offset };
      const values: number[] = [];
      for (const eventName of activeEventNames) {
        const value = eventReturns.VIX?.[eventName]?.[offset];
        if (value !== undefined) {
          point[eventName] = value;
          values.push(value);
        }
      }
      point.med = values.length >= 2 ? nanMedian(values) : null;
      point.q1 = values.length >= 2 ? nanPercentile(values, 25) : null;
      point.q3 = values.length >= 2 ? nanPercentile(values, 75) : null;

      if (live.returns?.VIX) {
        const liveValue = live.returns.VIX[offset];
        if (liveValue !== undefined) point.__live__ = liveValue;
      }

      return point;
    });

    const medianValues = data.map((point) => point.med).filter((value: number | null) => value !== null) as number[];
    const maxMed = medianValues.length > 0 ? Math.max(...medianValues) : 0;
    const minMed = medianValues.length > 0 ? Math.min(...medianValues) : 0;

    return {
      chartData: data,
      hasData: activeEventNames.length > 0,
      medianStats: { max: maxMed, min: minMed, range: maxMed - minMed },
    };
  }, [activeEventNames, eventReturns, live]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="VIX Path Analysis"
        subtitle={`${activeEventNames.length} events | median +/- IQR band${liveVixDate ? ` | live D+${liveVixDay} (${liveVixDate})` : ''}`}
      >
        {!hasData ? (
          <div className="h-[420px] flex items-center justify-center text-text-dim text-xs">
            No VIX data is available for the currently selected events.
          </div>
        ) : (
          <div className="h-[420px] border-t border-border/40">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 16, right: 12, bottom: 20, left: 8 }}>
                <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="2 8" vertical={false} />
                <XAxis
                  dataKey="offset"
                  stroke={CHART_THEME.axisLine}
                  tick={{ fontSize: 10, fill: CHART_THEME.textMuted, fontFamily: THEME_FONTS.mono }}
                  ticks={POIS.map((poi) => poi.offset)}
                  tickFormatter={(value) => POIS.find((poi) => poi.offset === value)?.label || ''}
                />
                <YAxis
                  stroke={CHART_THEME.axisLine}
                  tick={{ fontSize: 10, fill: CHART_THEME.textMuted, fontFamily: THEME_FONTS.mono }}
                  tickFormatter={(value: number) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: CHART_THEME.tooltipBg,
                    border: `1px solid ${CHART_THEME.gridBright}`,
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: THEME_FONTS.mono,
                    color: CHART_THEME.textPrimary,
                  }}
                  labelFormatter={(value) => `Day ${Number(value) >= 0 ? '+' : ''}${value}`}
                />
                <ReferenceLine y={0} stroke={CHART_THEME.zero} strokeWidth={1} />
                <ReferenceLine x={0} stroke={dayZeroStyle.stroke} strokeDasharray={dayZeroStyle.strokeDasharray} strokeWidth={dayZeroStyle.strokeWidth} />

                <Area dataKey="q3" stroke="none" fill={alphaThemeColor('accentBlue', '0.10')} />
                <Area dataKey="q1" stroke="none" fill={CHART_THEME.bg} />
                <Line dataKey="med" stroke={CHART_THEME.accentBlue} strokeWidth={themeStrokeWidth(2.5)} dot={false} connectNulls={false} />

                {activeEventNames.map((eventName, index) => {
                  const lineStyle = getEventLineStyle(eventName, index, 0.8);
                  return (
                    <Line
                      key={eventName}
                      dataKey={eventName}
                      stroke={lineStyle.color}
                      strokeWidth={lineStyle.strokeWidth}
                      strokeOpacity={0.6}
                      strokeDasharray={lineStyle.strokeDasharray}
                      dot={false}
                      connectNulls={false}
                    />
                  );
                })}

                {live.returns?.VIX && (
                  <Line
                    dataKey="__live__"
                    stroke={CHART_THEME.live}
                    strokeWidth={themeStrokeWidth(2.5)}
                    dot={{ r: 2, fill: CHART_THEME.live, strokeWidth: 0 }}
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <BottomDescription>
          The blue band shows the historical VIX distribution across the active event set, while the live line now includes the available pre-event build-up as well as the post-event path. Compare both shape and level: a live line above the upper band means volatility is running hotter than most analogues at the same point in the event window.
        </BottomDescription>
      </ChartCard>

      {hasData && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">Max</div>
            <div className="text-lg font-bold text-accent-blue font-mono">{medianStats.max.toFixed(1)}%</div>
          </div>
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">Range</div>
            <div className="text-lg font-bold text-text-primary font-mono">{medianStats.range.toFixed(1)}%</div>
          </div>
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">Min</div>
            <div className="text-lg font-bold text-down font-mono">{medianStats.min.toFixed(1)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
