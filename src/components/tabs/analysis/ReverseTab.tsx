'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, StatBox } from '@/components/ui/ChartCard';
import { runAnalogueMatch } from '@/engine/similarity';
import { getLiveScoringDay, getLiveScoringReturns } from '@/engine/live';
import { nanMean } from '@/lib/math';

interface ReverseMatch {
  rank: number;
  eventName: string;
  cosineSimilarity: number;
  sharedAssets: number;
}

export function ReverseTab() {
  const { eventReturns, eventTags, macroContext, triggerZScores, similarityAssets, live, events } = useDashboard();
  const scoringReturns = getLiveScoringReturns(live);
  const scoringDayN = getLiveScoringDay(live);

  const [topN, setTopN] = useState<number>(5);

  const { matches, stats } = useMemo(() => {
    if (!scoringReturns || Object.keys(eventReturns).length === 0) {
      return { matches: [], stats: { topScore: 0, avgScore: 0, topEvent: '' } };
    }

    const scores = runAnalogueMatch(
      eventReturns,
      scoringReturns,
      live.tags,
      live.triggerZScore,
      live.cpi,
      live.fed,
      scoringDayN,
      triggerZScores,
      {
        weights: { quant: 1, tag: 0, macro: 0 },
        simAssets: similarityAssets,
        events,
        eventTags,
        macroContext,
      },
    );

    const results: ReverseMatch[] = scores.map((score) => ({
      rank: 0,
      eventName: score.event,
      cosineSimilarity: score.quant,
      sharedAssets: score.sharedAssetCount,
    }));

    const topResults = results.slice(0, topN).map((m, idx) => ({ ...m, rank: idx + 1 }));
    const values = topResults.map(m => m.cosineSimilarity);

    return {
      matches: topResults,
      stats: {
        topScore: topResults.length > 0 ? topResults[0].cosineSimilarity : 0,
        avgScore: topResults.length > 0 ? nanMean(values) : 0,
        topEvent: topResults.length > 0 ? topResults[0].eventName : '',
      },
    };
  }, [eventReturns, eventTags, events, live.cpi, live.fed, live.tags, live.triggerZScore, macroContext, scoringDayN, scoringReturns, similarityAssets, topN, triggerZScores]);

  const topNOptions = Array.from({ length: 11 }, (_, i) => {
    const val = 3 + i * 1;
    return { label: val.toString(), value: val.toString() };
  });

  if (!live || !scoringReturns) {
    return (
      <ChartCard
        title="Reverse Analogue Lookup"
        subtitle="Find historical events matching current return pattern via cosine similarity"
      >
        <div className="flex items-center justify-center h-24 text-xs text-text-dim">
          No live data available. Load current market data to find analogues.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Reverse Analogue Lookup"
      subtitle="Find historical events matching current return pattern via cosine similarity"
    >
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="flex items-end gap-3">
          <Select
            label="Top N"
            value={topN.toString()}
            onChange={(val) => setTopN(parseInt(val))}
            options={topNOptions}
          />
          <div className="text-2xs text-text-dim">
            Matching {Object.keys(eventReturns).length} historical events
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatBox
            label="Top Match"
            value={(stats.topScore * 100).toFixed(1)}
            sub={`${stats.topEvent ? stats.topEvent.substring(0, 15) : '—'}`}
            color="#00d4aa"
          />
          <StatBox
            label="Avg Match"
            value={(stats.avgScore * 100).toFixed(1)}
            sub="%"
            color="#f59e0b"
          />
          <StatBox
            label="Assets Shared"
            value={similarityAssets.length}
            sub="in comparison pool"
            color="#71717a"
          />
        </div>

        {matches.length === 0 ? (
          <div className="flex items-center justify-center h-20 border border-border/40 rounded-sm bg-bg-cell/30 text-xs text-text-dim">
            No matches found with available data
          </div>
        ) : (
          <div className="space-y-2">
            {matches.map((match) => {
              const pct = (match.cosineSimilarity * 100);
              const barWidth = Math.max(pct, 3);
              return (
                <div key={match.eventName} className="space-y-1">
                  <div className="flex items-center justify-between text-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-text-muted font-mono w-5">{match.rank}.</span>
                      <span className="text-text-secondary font-mono truncate">{match.eventName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-text-muted">
                      <span className="font-mono">{pct.toFixed(1)}%</span>
                      <span className="text-text-dim">({match.sharedAssets})</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-bg-cell/80 rounded-full overflow-hidden border border-border/30">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: pct >= 75 ? '#00d4aa' : pct >= 50 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-2xs text-text-dim border-t border-border/40 pt-3 space-y-1">
          <p>Cosine similarity of current return pattern (trading day {scoringDayN}) against historical event returns.</p>
          <p className="text-text-dim/70">Asset count in parentheses indicates valid comparisons per event.</p>
        </div>
      </div>
    </ChartCard>
  );
}
