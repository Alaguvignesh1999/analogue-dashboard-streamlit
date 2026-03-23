'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, SliderControl, Badge } from '@/components/ui/ChartCard';
import { DiagnosticsStrip } from '@/components/ui/DiagnosticsStrip';
import { getEffectiveScoringDate, getEffectiveScoringDay, getLiveScoringReturns } from '@/engine/live';
import { buildDecayTimeline, dominantSegments, DecayMode } from '@/engine/decay';
import { EVENT_COLORS } from '@/config/events';
import { CHART_THEME } from '@/config/theme';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, ReferenceArea,
} from 'recharts';

export function DecayTab() {
  const { eventReturns, live, similarityAssets, events, activeEvents, scores, scoreCutoff, scoringMode, setScoringMode } = useDashboard();
  const [step, setStep] = useState(1);

  const scoringReturns = getLiveScoringReturns(live);
  const labelsForMode = scoringMode === 'all-available' ? Object.keys(scoringReturns || {}) : similarityAssets;
  const dayN = getEffectiveScoringDay(live, labelsForMode);
  const effectiveDate = getEffectiveScoringDate(live, labelsForMode);
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
  const timeline = useMemo(() => {
    if (!scoringReturns || dayN < 1 || selectedEventNames.length === 0) return null;
    return buildDecayTimeline(eventReturns, scoringReturns, dayN, selectedEventNames, step, similarityAssets, scoringMode as DecayMode);
  }, [dayN, eventReturns, scoringReturns, selectedEventNames, similarityAssets, step, scoringMode]);

  const { scoreData, rankData, segments, eventNames, latestScores } = useMemo(() => {
    if (!timeline || timeline.length === 0) {
      return { scoreData: [], rankData: [], segments: [], eventNames: [] as string[], latestScores: [] as NonNullable<typeof timeline>[number]['scores'] };
    }

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

    return {
      scoreData: scoreRows,
      rankData: rankRows,
      segments: segs,
      eventNames: allEvents,
      latestScores: timeline[timeline.length - 1].scores,
    };
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
            <div className="flex">
              {(['live-sim', 'all-available'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setScoringMode(mode)}
                  className={`px-2.5 py-1 text-[10px] tracking-wide uppercase border-y border-r first:border-l first:rounded-l-sm last:rounded-r-sm transition-all ${
                    scoringMode === mode
                      ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/30'
                      : 'bg-transparent text-[#6a6a7a] border-[#2a2a3a] hover:text-[#9a9aaa]'
                  }`}
                >
                  {mode === 'live-sim' ? 'Live Sim Assets' : 'All Available'}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <DiagnosticsStrip
          live={live}
          labels={labelsForMode}
          scoringMode={scoringMode}
          extra={<span>Decay now supports coverage-adjusted live-sim and all-available comparison modes.</span>}
        />
        {!timeline ? (
          <div className="h-[400px] flex items-center justify-center text-text-dim text-xs">
            {!live.returns ? 'Pull live data in L1 Config first' : selectedEventNames.length === 0 ? 'Run analogue matching or re-enable events first' : 'Decay will appear once there is a valid live scoring window.'}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="px-4 pt-2 text-2xs text-text-dim border-b border-border/40 bg-bg-cell/20">
              Decay tracks how the analogue ranking evolves as the live event progresses. Coverage-adjusted mode prevents sparse older events from dominating on one or two assets, and event deselection flows straight through this view.
            </div>
            <div className="px-4 pt-2">
              <span className="text-2xs text-text-muted">Path similarity score over time using {scoringMode === 'live-sim' ? 'the current live sim asset set' : 'all available overlapping comparison assets'}.</span>
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

            {latestScores.length > 0 && (
              <div className="px-4 pb-4">
                <span className="text-2xs text-text-muted block mb-2">Current ranking at effective D+{dayN}:</span>
                <div className="flex flex-wrap gap-2">
                  {latestScores.slice(0, 5).map((score, index) => (
                    <div key={score.event} className="flex items-center gap-1.5 px-2 py-1 bg-bg-cell border border-border/50">
                      <span className="text-2xs text-text-dim">#{index + 1}</span>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: eventColorMap[score.event] }} />
                      <span className="text-2xs text-text-secondary">{score.event}</span>
                      <span className="text-2xs text-accent-teal">{score.score.toFixed(3)}</span>
                      <Badge color={score.confidenceLabel === 'high' ? 'green' : score.confidenceLabel === 'medium' ? 'amber' : 'red'}>
                        {(score.coverageRatio * 100).toFixed(0)}%
                      </Badge>
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
