'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, SliderControl } from '@/components/ui/ChartCard';
import { buildDecayTimeline, eventScoreTimeline, eventRankTimeline, dominantSegments } from '@/engine/decay';
import { EVENT_COLORS, EVENTS } from '@/config/events';
import { CHART_THEME } from '@/config/theme';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, ReferenceArea,
} from 'recharts';

export function DecayTab() {
  const { eventReturns, live } = useDashboard();
  const [step, setStep] = useState(1);
  const [computing, setComputing] = useState(false);
  const [timeline, setTimeline] = useState<ReturnType<typeof buildDecayTimeline> | null>(null);

  const dayN = live.dayN ?? 0;

  function handleBuild() {
    if (!live.returns || dayN < 1) return;
    setComputing(true);
    // Use requestAnimationFrame to let UI update before heavy computation
    requestAnimationFrame(() => {
      const tl = buildDecayTimeline(eventReturns, live.returns!, dayN, step);
      setTimeline(tl);
      setComputing(false);
    });
  }

  const { scoreData, rankData, segments, eventNames } = useMemo(() => {
    if (!timeline || timeline.length === 0) return { scoreData: [], rankData: [], segments: [], eventNames: [] };

    const allEvents = EVENTS.map(e => e.name);
    const segs = dominantSegments(timeline);

    // Score chart data
    const sData = timeline.map(dp => {
      const point: Record<string, number | null> = { offset: dp.offset };
      for (const ev of allEvents) {
        const s = dp.scores.find(s => s.event === ev);
        point[ev] = s?.score ?? null;
      }
      return point;
    });

    // Rank chart data
    const rData = timeline.map(dp => {
      const point: Record<string, number | null> = { offset: dp.offset };
      for (const ev of allEvents) {
        const idx = dp.scores.findIndex(s => s.event === ev);
        point[ev] = idx >= 0 ? idx + 1 : null;
      }
      return point;
    });

    return { scoreData: sData, rankData: rData, segments: segs, eventNames: allEvents };
  }, [timeline]);

  const eventColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    EVENTS.forEach((e, i) => { map[e.name] = EVENT_COLORS[i % EVENT_COLORS.length]; });
    return map;
  }, []);

  return (
    <div className="space-y-4 p-4">
      <ChartCard
        title="Signal Decay Tracker"
        subtitle={`Day 0 → Day+${dayN} · When #1 analogue changes → event tracking a different path`}
        controls={
          <div className="flex items-center gap-3">
            <SliderControl label="Step" value={step} onChange={setStep} min={1} max={5} suffix="d" />
            <Button onClick={handleBuild} disabled={computing || !live.returns || dayN < 1}>
              {computing ? '⟳ Computing...' : '▶ Build Decay Chart'}
            </Button>
          </div>
        }
      >
        {!timeline ? (
          <div className="h-[400px] flex items-center justify-center text-text-dim text-xs">
            {!live.returns ? '← Pull live data in L1 Config first' : 'Click "Build Decay Chart" to compute'}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Score panel */}
            <div className="px-4 pt-2">
              <span className="text-2xs text-text-muted">Path similarity score (higher = closer match to live)</span>
            </div>
            <div className="h-[280px] px-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreData} margin={{ top: 10, right: 30, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                  <XAxis dataKey="offset" stroke={CHART_THEME.textMuted}
                    tick={{ fontSize: 9, fill: CHART_THEME.textMuted }}
                    tickFormatter={v => `D+${v}`} />
                  <YAxis domain={[0, 1.05]} stroke={CHART_THEME.textMuted}
                    tick={{ fontSize: 9, fill: CHART_THEME.textMuted }} />
                  <Tooltip
                    contentStyle={{ background: CHART_THEME.bgCell, border: `1px solid ${CHART_THEME.gridBright}`, borderRadius: 0, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    labelFormatter={v => `Day+${v}`} />
                  
                  {/* Dominant segments as background shading */}
                  {segments.map((seg, i) => (
                    <ReferenceArea
                      key={i}
                      x1={seg.start} x2={seg.end}
                      fill={eventColorMap[seg.event] || '#333'}
                      fillOpacity={0.08}
                    />
                  ))}

                  <ReferenceLine x={dayN} stroke={CHART_THEME.live} strokeDasharray="3 3" strokeWidth={1.5} />

                  {eventNames.map((en, i) => (
                    <Line key={en} dataKey={en}
                      stroke={eventColorMap[en]}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Rank panel */}
            <div className="px-4 pt-2 border-t border-border/30">
              <span className="text-2xs text-text-muted">Rank at each day (#1 = best matching analogue right now)</span>
            </div>
            <div className="h-[220px] px-4 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rankData} margin={{ top: 10, right: 30, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                  <XAxis dataKey="offset" stroke={CHART_THEME.textMuted}
                    tick={{ fontSize: 9, fill: CHART_THEME.textMuted }}
                    tickFormatter={v => `D+${v}`} />
                  <YAxis reversed domain={[0.5, Math.min(eventNames.length, 8) + 0.5]}
                    stroke={CHART_THEME.textMuted}
                    tick={{ fontSize: 9, fill: CHART_THEME.textMuted }}
                    tickFormatter={v => `#${v}`}
                    ticks={Array.from({ length: Math.min(eventNames.length, 8) }, (_, i) => i + 1)} />
                  <Tooltip
                    contentStyle={{ background: CHART_THEME.bgCell, border: `1px solid ${CHART_THEME.gridBright}`, borderRadius: 0, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    labelFormatter={v => `Day+${v}`} />

                  <ReferenceLine x={dayN} stroke={CHART_THEME.live} strokeDasharray="3 3" strokeWidth={1.5} />

                  {eventNames.map((en) => (
                    <Line key={en} dataKey={en}
                      stroke={eventColorMap[en]}
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      connectNulls={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Current ranking table */}
            {timeline.length > 0 && (
              <div className="px-4 pb-4">
                <span className="text-2xs text-text-muted block mb-2">Current ranking at Day+{dayN}:</span>
                <div className="flex flex-wrap gap-2">
                  {timeline[timeline.length - 1].scores.slice(0, 5).map((s, i) => (
                    <div key={s.event} className="flex items-center gap-1.5 px-2 py-1 bg-bg-cell border border-border/50">
                      <span className="text-2xs text-text-dim">#{i + 1}</span>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: eventColorMap[s.event] }} />
                      <span className="text-2xs text-text-secondary">{s.event}</span>
                      <span className="text-2xs text-accent-teal">{s.score.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
