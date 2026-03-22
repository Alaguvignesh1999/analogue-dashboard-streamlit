'use client';
import { useMemo } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard } from '@/components/ui/ChartCard';
import { getEffectiveScoringDate, getEffectiveScoringDay } from '@/engine/live';
import { nanMedian, nanPercentile } from '@/lib/math';
import { PRE_WINDOW_TD, POST_WINDOW_TD, POIS } from '@/config/engine';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';

const PALETTE = [
  '#00e5ff', '#ff5252', '#69f0ae', '#b388ff', '#ffab40',
  '#ff80ab', '#40c4ff', '#ccff90', '#ffd740', '#ea80fc',
  '#84ffff', '#ff6e40', '#a7ffeb',
];

export function VixTab() {
  const { eventReturns, events, activeEvents, live } = useDashboard();

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name) && !!eventReturns.VIX?.[event.name]).map((event) => event.name),
    [activeEvents, eventReturns, events],
  );
  const liveVixDay = getEffectiveScoringDay(live, ['VIX']);
  const liveVixDate = getEffectiveScoringDate(live, ['VIX']);

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

      if (live.returns?.VIX && live.dayN !== null && offset >= 0 && offset <= live.dayN) {
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
        subtitle={`${activeEventNames.length} events · median ± IQR band${liveVixDate ? ` · live scored to D+${liveVixDay} (${liveVixDate})` : ''}`}
      >
        <div className="px-4 py-3 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
          The teal band shows the historical VIX distribution across the active event set, while the orange line is the current live path. Compare both shape and level: a live line above the upper band means volatility is running hotter than most analogues at the same point in the event window.
        </div>
        {!hasData ? (
          <div className="h-[420px] flex items-center justify-center text-text-dim text-xs">
            No VIX data is available for the currently selected events.
          </div>
        ) : (
          <div className="h-[420px] border-t border-border/40">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 16, right: 12, bottom: 20, left: 8 }}>
                <CartesianGrid stroke="#1e1e22" strokeDasharray="2 8" />
                <XAxis
                  dataKey="offset"
                  stroke="#1e1e22"
                  tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'JetBrains Mono' }}
                  ticks={POIS.map((poi) => poi.offset)}
                  tickFormatter={(value) => POIS.find((poi) => poi.offset === value)?.label || ''}
                />
                <YAxis
                  stroke="#1e1e22"
                  tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(value: number) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(12,12,18,0.96)',
                    border: '1px solid #1e1e22',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono',
                  }}
                  labelFormatter={(value) => `Day ${Number(value) >= 0 ? '+' : ''}${value}`}
                />
                <ReferenceLine y={0} stroke="#3a3a4e" strokeWidth={1} />
                <ReferenceLine x={0} stroke="#00d4aa" strokeDasharray="4 4" strokeWidth={1.2} />

                <Area dataKey="q3" stroke="none" fill="rgba(0,212,170,0.1)" />
                <Area dataKey="q1" stroke="none" fill="#09090b" />
                <Line dataKey="med" stroke="#00d4aa" strokeWidth={2.5} dot={false} connectNulls={false} />

                {activeEventNames.map((eventName, index) => (
                  <Line key={eventName} dataKey={eventName} stroke={PALETTE[index % PALETTE.length]} strokeWidth={0.8} strokeOpacity={0.3} dot={false} connectNulls={false} />
                ))}

                {live.returns?.VIX && (
                  <Line dataKey="__live__" stroke="#ffab40" strokeWidth={2.5} dot={{ r: 2, fill: '#ffab40', strokeWidth: 0 }} connectNulls={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {hasData && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">Max</div>
            <div className="text-lg font-bold text-accent-teal font-mono">{medianStats.max.toFixed(1)}%</div>
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
