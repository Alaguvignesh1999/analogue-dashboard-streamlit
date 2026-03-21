'use client';
import { useMemo } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard } from '@/components/ui/ChartCard';
import { nanMedian, nanPercentile } from '@/lib/math';
import { PRE_WINDOW_TD, POST_WINDOW_TD, POIS } from '@/config/engine';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';

const PALETTE = [
  '#00e5ff','#ff5252','#69f0ae','#b388ff','#ffab40',
  '#ff80ab','#40c4ff','#ccff90','#ffd740','#ea80fc',
  '#84ffff','#ff6e40','#a7ffeb',
];
const AX_TICK = '#8a8a9a';
const AX_LINE = '#2a2a3a';
const GRID_CLR = '#1c1c2c';

export function VixTab() {
  const { eventReturns, events, activeEvents, live } = useDashboard();

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name) && !!eventReturns.VIX?.[event.name]).map((event) => event.name),
    [activeEvents, eventReturns, events]
  );

  const { chartData, hasData, medianStats } = useMemo(() => {
    const vixLabel = 'VIX';
    const offsets = Array.from({ length: PRE_WINDOW_TD + POST_WINDOW_TD + 1 }, (_, i) => i - PRE_WINDOW_TD);

    const data = offsets.map(offset => {
      const pt: Record<string, any> = { offset };
      const vals: number[] = [];
      for (const en of activeEventNames) {
        const v = eventReturns[vixLabel]?.[en]?.[offset];
        if (v !== undefined) {
          pt[en] = v;
          vals.push(v);
        }
      }
      pt.med = vals.length >= 2 ? nanMedian(vals) : null;
      pt.q1 = vals.length >= 2 ? nanPercentile(vals, 25) : null;
      pt.q3 = vals.length >= 2 ? nanPercentile(vals, 75) : null;

      if (live.returns?.[vixLabel] && live.dayN !== null && offset >= 0 && offset <= live.dayN) {
        const lv = live.returns[vixLabel][offset];
        if (lv !== undefined) pt['__live__'] = lv;
      }
      return pt;
    });

    // Calculate median range for stats
    const medianVals = data.map(d => d.med).filter((v: number | null) => v !== null) as number[];
    const maxMed = medianVals.length > 0 ? Math.max(...medianVals) : 0;
    const minMed = medianVals.length > 0 ? Math.min(...medianVals) : 0;

    return {
      chartData: data,
      hasData: activeEventNames.length > 0,
      medianStats: { max: maxMed, min: minMed, range: maxMed - minMed },
    };
  }, [eventReturns, activeEventNames, live]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="VIX Path Analysis"
        subtitle={`${activeEventNames.length} events · Median ± IQR band`}
      >
        {!hasData ? (
          <div className="h-[420px] flex items-center justify-center text-text-dim text-xs">
            No non-milestone events selected
          </div>
        ) : (
          <div className="h-[420px] border-t border-border/40">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 16, right: 12, bottom: 20, left: 8 }}>
                <CartesianGrid stroke="#1e1e22" strokeDasharray="2 8" />
                <XAxis dataKey="offset" stroke="#1e1e22"
                  tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'JetBrains Mono' }}
                  ticks={POIS.map(p => p.offset)}
                  tickFormatter={v => POIS.find(p => p.offset === v)?.label || ''}
                />
                <YAxis stroke="#1e1e22"
                  tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
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
                  labelFormatter={v => `Day ${Number(v) >= 0 ? '+' : ''}${v}`}
                />
                <ReferenceLine y={0} stroke="#3a3a4e" strokeWidth={1} />
                <ReferenceLine x={0} stroke="#00d4aa" strokeDasharray="4 4" strokeWidth={1.2} />

                <Area dataKey="q3" stroke="none" fill="rgba(0,212,170,0.1)" />
                <Area dataKey="q1" stroke="none" fill="#09090b" />
                <Line dataKey="med" stroke="#00d4aa" strokeWidth={2.5} dot={false} connectNulls={false} />

                {activeEventNames.map((en, i) => (
                  <Line key={en} dataKey={en} stroke={PALETTE[i % PALETTE.length]}
                    strokeWidth={0.8} strokeOpacity={0.3} dot={false} connectNulls={false} />
                ))}

                {live.returns?.['VIX'] && (
                  <Line dataKey="__live__" stroke="#ffab40" strokeWidth={2.5}
                    dot={{ r: 2, fill: '#ffab40', strokeWidth: 0 }} connectNulls={false} />
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
            <div className="text-lg font-bold text-accent-teal font-mono">
              {medianStats.max.toFixed(1)}%
            </div>
          </div>
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">Range</div>
            <div className="text-lg font-bold text-text-primary font-mono">
              {medianStats.range.toFixed(1)}%
            </div>
          </div>
          <div className="p-3 bg-bg-cell/50 border border-border/40 rounded-sm">
            <div className="text-3xs text-text-dim uppercase tracking-wider font-semibold mb-1">Min</div>
            <div className="text-lg font-bold text-down font-mono">
              {medianStats.min.toFixed(1)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
