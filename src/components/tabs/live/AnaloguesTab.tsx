'use client';
import { useMemo, useCallback } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, SliderControl, StatBox, EmptyState, Badge } from '@/components/ui/ChartCard';
import { runAnalogueMatch, selectEvents } from '@/engine/similarity';
import { ANALOGUE_WEIGHTS } from '@/config/engine';

export function AnaloguesTab() {
  const {
    eventReturns, live, scores, setScores, scoreCutoff, setCutoff, triggerZScores,
  } = useDashboard();

  const hasLive = live.returns !== null && live.dayN !== null;

  const handleMatch = useCallback(() => {
    if (!live.returns || live.dayN === null) return;
    const result = runAnalogueMatch(
      eventReturns,
      live.returns,
      live.tags,
      live.triggerPctile,
      live.cpi,
      live.fed,
      live.dayN,
      triggerZScores,
    );
    setScores(result);
  }, [eventReturns, live, triggerZScores, setScores]);

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);

  const stats = useMemo(() => {
    if (scores.length === 0) return { topScore: 0, avgScore: 0, selected: 0 };
    const composites = scores.map(s => s.composite);
    const topScore = Math.max(...composites);
    const avgScore = composites.reduce((a, b) => a + b, 0) / composites.length;
    return { topScore, avgScore, selected: selectedEvents.length };
  }, [scores, selectedEvents]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Analogue Matching"
        subtitle={`${scores.length} events scored · Day+${live.dayN ?? 0} live path`}
        controls={
          <div className="flex items-center gap-3">
            <SliderControl label="Cutoff" value={scoreCutoff} onChange={setCutoff} min={0} max={1} step={0.05} />
            <Button onClick={handleMatch} disabled={!hasLive}>
              {scores.length > 0 ? '↻ Re-score' : '▶ Run'}
            </Button>
          </div>
        }
      >
        {!hasLive ? (
          <EmptyState
            title="No Live Event"
            message="Configure live event in L1 Config and pull data to begin matching"
          />
        ) : scores.length === 0 ? (
          <EmptyState
            title="Ready to Score"
            message={`Click "Run" to find analogues matching ${live.name}`}
          />
        ) : (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="px-4 pt-4 grid grid-cols-3 gap-3">
              <StatBox
                label="Top Score"
                value={`${(stats.topScore * 100).toFixed(0)}%`}
                color={stats.topScore >= 0.7 ? '#69f0ae' : stats.topScore >= 0.5 ? '#ffd740' : '#ff5252'}
              />
              <StatBox
                label="Avg Score"
                value={`${(stats.avgScore * 100).toFixed(0)}%`}
                color="#00d4aa"
              />
              <StatBox
                label="Selected"
                value={stats.selected}
                sub={`of ${scores.length} total`}
                color="#ffffff"
              />
            </div>

            {/* Score bars */}
            <div className="px-4 pb-4 space-y-2 max-h-[400px] overflow-y-auto">
              {scores.map((s, i) => {
                const above = s.composite >= scoreCutoff;
                const isGood = s.composite >= 0.7;
                const isOk = s.composite >= 0.5;
                const barColor = isGood ? '#22c55e' : isOk ? '#fbbf24' : '#ef4444';

                return (
                  <div
                    key={s.event}
                    className={`transition-all p-2.5 border border-border/30 rounded-sm ${
                      above ? 'bg-bg-cell/40 hover:bg-bg-cell/60' : 'opacity-40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary truncate">
                          {i + 1}. {s.event}
                        </div>
                        <div className="text-2xs text-text-dim mt-0.5">
                          Composite: {(s.composite * 100).toFixed(1)}% | Quant: {(s.quant * 100).toFixed(0)}% | Tag: {(s.tag * 100).toFixed(0)}% | Macro: {(s.macro * 100).toFixed(0)}%
                        </div>
                      </div>
                      {above && <Badge color="green">SELECTED</Badge>}
                    </div>
                    {/* Composite bar with gradient */}
                    <div className="w-full h-2 bg-bg-primary rounded-sm overflow-hidden">
                      <div
                        className="h-full transition-all rounded-sm"
                        style={{
                          width: `${s.composite * 100}%`,
                          background: `linear-gradient(90deg, ${barColor}40, ${barColor}ff)`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border/30 text-2xs text-text-dim space-y-1">
              <div>Weights: Q×{ANALOGUE_WEIGHTS.quant.toFixed(2)} | T×{ANALOGUE_WEIGHTS.tag.toFixed(2)} | M×{ANALOGUE_WEIGHTS.macro.toFixed(2)}</div>
              <div>{selectedEvents.length} of {scores.length} events above cutoff threshold</div>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
