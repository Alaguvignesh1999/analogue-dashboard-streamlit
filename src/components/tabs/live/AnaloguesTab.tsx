'use client';

import { useMemo, useCallback } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, SliderControl, StatBox, EmptyState, Badge } from '@/components/ui/ChartCard';
import { getEffectiveScoringDate, getEffectiveScoringDay } from '@/engine/live';
import { runAnalogueMatch, selectEvents } from '@/engine/similarity';

export function AnaloguesTab() {
  const {
    eventReturns,
    events,
    eventTags,
    macroContext,
    live,
    scores,
    setScores,
    scoreCutoff,
    setCutoff,
    triggerZScores,
    analogueWeights,
    setAnalogueWeights,
    similarityAssets,
  } = useDashboard();

  const scoringDayN = live.scoringReturns || live.returns ? getEffectiveScoringDay(live, similarityAssets) : null;
  const scoringDate = live.scoringReturns || live.returns ? getEffectiveScoringDate(live, similarityAssets) : null;
  const scoringReturns = live.scoringReturns ?? live.returns;
  const hasLive = scoringReturns !== null && scoringDayN !== null;

  const handleMatch = useCallback(() => {
    if (!scoringReturns || scoringDayN === null) return;
    const result = runAnalogueMatch(
      eventReturns,
      scoringReturns,
      live.tags,
      live.triggerZScore,
      live.cpi,
      live.fed,
      scoringDayN,
      triggerZScores,
      {
        weights: analogueWeights,
        simAssets: similarityAssets,
        events,
        eventTags,
        macroContext,
      }
    );
    setScores(result);
  }, [analogueWeights, eventReturns, eventTags, events, live.cpi, live.fed, live.tags, live.triggerZScore, macroContext, scoringDayN, scoringReturns, setScores, triggerZScores]);

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);

  const stats = useMemo(() => {
    if (scores.length === 0) return { topScore: 0, avgScore: 0, selected: 0 };
    const composites = scores.map((score) => score.composite);
    return {
      topScore: Math.max(...composites),
      avgScore: composites.reduce((sum, value) => sum + value, 0) / composites.length,
      selected: selectedEvents.length,
    };
  }, [scores, selectedEvents.length]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Analogue Matching"
        subtitle={`${scores.length} events scored | scoring D+${scoringDayN ?? 0}${scoringDate ? ` (${scoringDate})` : ''} | weighted scoring`}
        controls={
          <div className="flex items-center gap-3">
            <SliderControl label="Cutoff" value={scoreCutoff} onChange={setCutoff} min={0} max={1} step={0.05} />
            <Button onClick={handleMatch} disabled={!hasLive}>
              {scores.length > 0 ? 'Re-score' : 'Run'}
            </Button>
          </div>
        }
      >
        {!hasLive ? (
          <EmptyState
            title="No Live Event"
            message="Configure live event in L1 Config and pull data to begin matching."
          />
        ) : (
          <div className="space-y-4">
            <div className="px-4 pt-4 grid grid-cols-3 gap-3">
              <StatBox
                label="Top Score"
                value={`${(stats.topScore * 100).toFixed(0)}%`}
                color={stats.topScore >= 0.7 ? '#69f0ae' : stats.topScore >= 0.5 ? '#ffd740' : '#ff5252'}
              />
              <StatBox label="Avg Score" value={`${(stats.avgScore * 100).toFixed(0)}%`} color="#00d4aa" />
              <StatBox label="Selected" value={stats.selected} sub={`of ${scores.length} total`} color="#ffffff" />
            </div>

            <div className="px-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <SliderControl
                label="Quant"
                value={analogueWeights.quant}
                onChange={(value) => setAnalogueWeights({ quant: value })}
                min={0}
                max={1}
                step={0.05}
              />
              <SliderControl
                label="Tag"
                value={analogueWeights.tag}
                onChange={(value) => setAnalogueWeights({ tag: value })}
                min={0}
                max={1}
                step={0.05}
              />
              <SliderControl
                label="Macro"
                value={analogueWeights.macro}
                onChange={(value) => setAnalogueWeights({ macro: value })}
                min={0}
                max={1}
                step={0.05}
              />
            </div>

            <div className="px-4 text-2xs text-text-dim">
              Weights auto-normalize to 1.00 and feed the composite score directly. Matching pool: {similarityAssets.length} assets.
            </div>

            {scores.length === 0 ? (
              <EmptyState title="Ready to Score" message={`Click "Run" to find analogues matching ${live.name}.`} />
            ) : (
              <div className="px-4 pb-4 space-y-2 max-h-[440px] overflow-y-auto">
                {scores.map((score, index) => {
                  const selected = score.composite >= scoreCutoff;
                  const quantContribution = score.quant * analogueWeights.quant;
                  const tagContribution = score.tag * analogueWeights.tag;
                  const macroContribution = score.macro * analogueWeights.macro;

                  return (
                    <div
                      key={score.event}
                      className={`transition-all p-2.5 border border-border/30 rounded-sm ${
                        selected ? 'bg-bg-cell/40 hover:bg-bg-cell/60' : 'opacity-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-text-primary truncate">
                            {index + 1}. {score.event}
                          </div>
                          <div className="text-2xs text-text-dim mt-0.5">
                            Composite {(score.composite * 100).toFixed(1)}% | Shared assets {score.sharedAssetCount}
                          </div>
                        </div>
                        {selected && <Badge color="green">SELECTED</Badge>}
                      </div>

                      <div className="w-full h-2 bg-bg-primary rounded-sm overflow-hidden flex">
                        <div style={{ width: `${quantContribution * 100}%`, background: '#00e5ff' }} />
                        <div style={{ width: `${tagContribution * 100}%`, background: '#ffab40' }} />
                        <div style={{ width: `${macroContribution * 100}%`, background: '#b388ff' }} />
                      </div>

                      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-text-dim">
                        <div>Quant: {(score.quant * 100).toFixed(0)}%</div>
                        <div>Tag: {(score.tag * 100).toFixed(0)}%</div>
                        <div>Macro: {(score.macro * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-4 py-3 border-t border-border/30 text-2xs text-text-dim space-y-1">
              <div>
                Weights: Q x {analogueWeights.quant.toFixed(2)} | T x {analogueWeights.tag.toFixed(2)} | M x {analogueWeights.macro.toFixed(2)}
              </div>
              <div>{selectedEvents.length} of {scores.length} events above cutoff threshold</div>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
