'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, SliderControl } from '@/components/ui/ChartCard';
import { getEffectiveScoringDate, getEffectiveScoringDay, getLiveScoringReturns } from '@/engine/live';
import { buildDecayTimeline, dominantSegments } from '@/engine/decay';
import { EVENT_COLORS } from '@/config/events';
import { CHART_THEME } from '@/config/theme';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, ReferenceArea,
} from 'recharts';

export function DecayTab() {
  const { eventReturns, live, similarityAssets, events, activeEvents, scores, scoreCutoff } = useDashboard();
  const [step, setStep] = useState(1);
  const [computing, setComputing] = useState(false);
  const [timeline, setTimeline] = useState<ReturnType<typeof buildDecayTimeline> | null>(null);

  const scoringReturns = getLiveScoringReturns(live);
  const dayN = getEffectiveScoringDay(live, similarityAssets);
  const effectiveDate = getEffectiveScoringDate(live, similarityAssets);
  const activeScoreSet = useMemo(
    () => filterScoresByActiveEvents(scores, activeEvents),
    [activeEvents, scores],
  );
  const selectedEventNames = useMemo(() => {
    if (activeScoreSet.length > 0) {
      return selectEvents(activeScoreSet, scoreCutoff);
    }
    return events.filter((event) => activeEvents.has(event.name)).map((event) => event.name);
  }, [activeEvents, activeScoreSet, events, scoreCutoff]);
  const timelineKey = useMemo(
    () => JSON.stringify({
      selectedEventNames,
      similarityAssets,
      dayN,
      analysisDayN: live.analysisDayN,
      actualDay0: live.actualDay0,
    }),
    [dayN, live.actualDay0, live.analysisDayN, selectedEventNames, similarityAssets],
  );

  useEffect(() => {
    setTimeline(null);
  }, [timelineKey]);

  function handleBuild() {
    if (!scoringReturns || dayN < 1 || selectedEventNames.length === 0) return;
    setComputing(true);
    requestAnimationFrame(() => {
      const built = buildDecayTimeline(eventReturns, scoringReturns, dayN, selectedEventNames, step, similarityAssets);
      setTimeline(built);
      setComputing(false);
    });
  }

  const { scoreData, rankData, segments, eventNames } = useMemo(() => {
    if (!timeline || timeline.length === 0) return { scoreData: [], rankData: [], segments: [], eventNames: [] as string[] };

    const allEvents = selectedEventNames;
    const segs = dominantSegments(timeline);

    const scoreRows = timeline.map((point) => {
      const row: Record<string, number | null> = { offset: point.offset };
      for (const eventName of allEvents) {
        const score = point.scores.find((item) => item.event === eventName);
        row[eventName] = score?.score ?? null;
      }
      return row;
    });

    const rankRows = timeline.map((point) => {
      const row: Record<string, number | null> = { offset: point.offset };
      for (const eventName of allEvents) {
        const index = point.scores.findIndex((item) => item.event === eventName);
        row[eventName] = index >= 0 ? index + 1 : null;
      }
      return row;
    });

    return { scoreData: scoreRows, rankData: rankRows, segments: segs, eventNames: allEvents };
  }, [selectedEventNames, timeline]);

  const eventColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    events.forEach((event, index) => {
      map[event.name] = EVENT_COLORS[index % EVENT_COLORS.length];
    });
    return map;
  }, [events]);

  return (
    <div className="space-y-4 p-4">
      <ChartCard
        title="Signal Decay Tracker"
        subtitle={`Day 0 -> effective D+${dayN}${effectiveDate ? ` (${effectiveDate})` : ''} | ${selectedEventNames.length} active analogue events`}
        controls={
          <div className="flex items-center gap-3">
            <SliderControl label="Step" value={step} onChange={setStep} min={1} max={5} suffix="d" />
            <Button onClick={handleBuild} disabled={computing || !scoringReturns || dayN < 1 || selectedEventNames.length === 0}>
              {computing ? 'Computing...' : timeline ? 'Rerun Analysis' : 'Build Decay Chart'}
            </Button>
          </div>
        }
      >
        {!timeline ? (
          <div className="h-[400px] flex items-center justify-center text-text-dim text-xs">
            {!live.returns ? 'Pull live data in L1 Config first' : selectedEventNames.length === 0 ? 'Run analogue matching or re-enable events first' : 'Click "Build Decay Chart" to compute'}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="px-4 pt-2 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
              Decay now respects the current active event selection and analogue cutoff. If you deselect an event in Historical Events or tighten the live analogue set, rerun analysis here to rebuild the timeline on that filtered event universe.
            </div>
            <div className="px-4 pt-2">
              <span className="text-2xs text-text-muted">Path similarity score over time on the same selected live sim asset set.</span>
            </div>
            <div className="h-[280px] px-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreData} margin={{ top: 10, right: 30, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                  <XAxis dataKey="offset" stroke={CHART_THEME.textMuted} tick={{ fontSize: 9, fill: CHART_THEME.textMuted }} tickFormatter={(value) => `D+${value}`} />
                  <YAxis domain={[0, 1.05]} stroke={CHART_THEME.textMuted} tick={{ fontSize: 9, fill: CHART_THEME.textMuted }} />
                  <Tooltip contentStyle={{ background: CHART_THEME.bgCell, border: `1px solid ${CHART_THEME.gridBright}`, borderRadius: 0, fontSize: 10, fontFamily: 'JetBrains Mono' }} labelFormatter={(value) => `Day+${value}`} />

                  {segments.map((segment, index) => (
                    <ReferenceArea
                      key={index}
                      x1={segment.start}
                      x2={segment.end}
                      fill={eventColorMap[segment.event] || '#333'}
                      fillOpacity={0.08}
                    />
                  ))}

                  <ReferenceLine x={dayN} stroke={CHART_THEME.live} strokeDasharray="3 3" strokeWidth={1.5} />

                  {eventNames.map((eventName) => (
                    <Line key={eventName} dataKey={eventName} stroke={eventColorMap[eventName]} strokeWidth={1.5} dot={false} connectNulls={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="px-4 pt-2 border-t border-border/30">
              <span className="text-2xs text-text-muted">Rank at each day (#1 = best matching analogue).</span>
            </div>
            <div className="h-[220px] px-4 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rankData} margin={{ top: 10, right: 30, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                  <XAxis dataKey="offset" stroke={CHART_THEME.textMuted} tick={{ fontSize: 9, fill: CHART_THEME.textMuted }} tickFormatter={(value) => `D+${value}`} />
                  <YAxis
                    reversed
                    domain={[0.5, Math.min(eventNames.length, 8) + 0.5]}
                    stroke={CHART_THEME.textMuted}
                    tick={{ fontSize: 9, fill: CHART_THEME.textMuted }}
                    tickFormatter={(value) => `#${value}`}
                    ticks={Array.from({ length: Math.min(eventNames.length, 8) }, (_, index) => index + 1)}
                  />
                  <Tooltip contentStyle={{ background: CHART_THEME.bgCell, border: `1px solid ${CHART_THEME.gridBright}`, borderRadius: 0, fontSize: 10, fontFamily: 'JetBrains Mono' }} labelFormatter={(value) => `Day+${value}`} />

                  <ReferenceLine x={dayN} stroke={CHART_THEME.live} strokeDasharray="3 3" strokeWidth={1.5} />

                  {eventNames.map((eventName) => (
                    <Line key={eventName} dataKey={eventName} stroke={eventColorMap[eventName]} strokeWidth={1.5} dot={{ r: 2 }} connectNulls={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {timeline.length > 0 && (
              <div className="px-4 pb-4">
                <span className="text-2xs text-text-muted block mb-2">Current ranking at effective D+{dayN}:</span>
                <div className="flex flex-wrap gap-2">
                  {timeline[timeline.length - 1].scores.slice(0, 5).map((score, index) => (
                    <div key={score.event} className="flex items-center gap-1.5 px-2 py-1 bg-bg-cell border border-border/50">
                      <span className="text-2xs text-text-dim">#{index + 1}</span>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: eventColorMap[score.event] }} />
                      <span className="text-2xs text-text-secondary">{score.event}</span>
                      <span className="text-2xs text-accent-teal">{score.score.toFixed(3)}</span>
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
