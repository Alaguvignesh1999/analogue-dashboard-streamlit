'use client';

import { useMemo, useState, useCallback } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Button } from '@/components/ui/ChartCard';
import { filterScoresByActiveEvents, selectEvents } from '@/engine/similarity';
import { poiRet, displayLabel } from '@/engine/returns';
import { getEffectiveScoringDate, getEffectiveScoringDay } from '@/engine/live';
import { SIMILARITY_ASSET_POOL } from '@/config/engine';
import { nanMean, nanStd, nanMin, nanMax, nanPercentile } from '@/lib/math';
import { fmtReturn, stars } from '@/lib/format';

export function MemoTab() {
  const { eventReturns, assetMeta, scores, scoreCutoff, horizon, live, activeEvents } = useDashboard();
  const [memoText, setMemoText] = useState('');
  const [copied, setCopied] = useState(false);

  const activeScores = useMemo(() => filterScoresByActiveEvents(scores, activeEvents), [activeEvents, scores]);
  const selectedEvents = useMemo(() => selectEvents(activeScores, scoreCutoff), [activeScores, scoreCutoff]);
  const memoAssets = useMemo(
    () => SIMILARITY_ASSET_POOL.filter((asset) => assetMeta[asset]),
    [assetMeta],
  );
  const dayN = getEffectiveScoringDay(live, memoAssets);
  const effectiveDate = getEffectiveScoringDate(live, memoAssets);

  const generateMemo = useCallback(() => {
    const lines: string[] = [];

    lines.push('# Trade Memo');
    lines.push('');
    lines.push('## Event Context');
    lines.push(`- Live event: ${live.name || '--'}`);
    lines.push(`- Requested Day 0: ${live.day0 || '--'}`);
    lines.push(`- Live date basis: D+${dayN}${effectiveDate ? ` (${effectiveDate})` : ''}`);
    lines.push(`- Horizon: D+${dayN} to D+${dayN + horizon}`);
    lines.push(`- Analogues selected: ${selectedEvents.length} of ${activeScores.length} active events (cutoff ${scoreCutoff.toFixed(2)})`);
    lines.push('');

    lines.push('## Top Analogues');
    const sortedScores = [...activeScores].sort((left, right) => right.composite - left.composite).slice(0, 8);
    for (const score of sortedScores) {
      const selected = score.composite >= scoreCutoff ? '[selected]' : '[watch]';
      lines.push(
        `- ${selected} ${score.event}: composite ${(score.composite * 100).toFixed(0)}%, quant ${(score.quant * 100).toFixed(0)}%, tag ${(score.tag * 100).toFixed(0)}%, macro ${(score.macro * 100).toFixed(0)}%`
      );
    }
    lines.push('');

    lines.push('## Top Signals');
    const assetSignals: Array<{ asset: string; med: number; iqr: number; hit: number; sharpe: number; rating: string; isRates: boolean; n: number }> = [];
    for (const asset of memoAssets) {
      const isRates = assetMeta[asset]?.is_rates_bp || false;
      const forwardValues: number[] = [];
      for (const eventName of selectedEvents) {
        const atDn = poiRet(eventReturns, asset, eventName, dayN);
        const atFo = poiRet(eventReturns, asset, eventName, dayN + horizon);
        if (!Number.isNaN(atDn) && !Number.isNaN(atFo)) {
          forwardValues.push(atFo - atDn);
        }
      }
      if (forwardValues.length < 2) continue;
      const med = nanPercentile(forwardValues, 50);
      const iqr = nanPercentile(forwardValues, 75) - nanPercentile(forwardValues, 25);
      const dir = med >= 0 ? 1 : -1;
      const hit = forwardValues.filter((value) => value * dir > 0).length / forwardValues.length;
      const sharpe = nanMean(forwardValues.map((value) => value * dir)) / (nanStd(forwardValues.map((value) => value * dir)) + 1e-9);
      assetSignals.push({ asset, med, iqr, hit, sharpe, rating: stars(iqr, med), isRates, n: forwardValues.length });
    }
    assetSignals.sort((left, right) => Math.abs(right.sharpe) - Math.abs(left.sharpe));
    for (const signal of assetSignals.slice(0, 12)) {
      const direction = signal.med >= 0 ? 'LONG' : 'SHORT';
      lines.push(
        `- ${direction} ${displayLabel(assetMeta[signal.asset], signal.asset)}: median ${fmtReturn(signal.med, signal.isRates)}, hit ${(signal.hit * 100).toFixed(0)}%, Sharpe ${signal.sharpe.toFixed(2)}, quality ${signal.rating}, n=${signal.n}`
      );
    }
    lines.push('');

    const allForwards: number[] = [];
    for (const signal of assetSignals) {
      for (const eventName of selectedEvents) {
        const atDn = poiRet(eventReturns, signal.asset, eventName, dayN);
        const atFo = poiRet(eventReturns, signal.asset, eventName, dayN + horizon);
        if (!Number.isNaN(atDn) && !Number.isNaN(atFo)) {
          allForwards.push(atFo - atDn);
        }
      }
    }

    lines.push('## Risk Summary');
    if (allForwards.length > 0) {
      lines.push(`- Cross-asset range: ${nanMin(allForwards).toFixed(1)} to ${nanMax(allForwards).toFixed(1)}`);
      lines.push(`- 5th percentile: ${nanPercentile(allForwards, 5).toFixed(1)}`);
      lines.push(`- 95th percentile: ${nanPercentile(allForwards, 95).toFixed(1)}`);
    } else {
      lines.push('- No aggregate forward distribution available.');
    }
    lines.push(`- Historical analogue count: ${selectedEvents.length}`);
    lines.push(`- Provenance: ${live.requestMode || (live.returns ? 'loaded live' : 'none')}${live.snapshotDate ? `, snapshot ${live.snapshotDate}` : ''}`);

    setMemoText(lines.join('\n'));
  }, [activeScores, assetMeta, dayN, effectiveDate, eventReturns, horizon, live.day0, live.name, live.requestMode, live.returns, live.snapshotDate, scoreCutoff, selectedEvents, memoAssets]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(memoText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [memoText]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard title="Trade Memo" subtitle="Auto-generated summary from the current analogue state and live date basis">
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <Button onClick={generateMemo} size="sm">Generate Memo</Button>
            {memoText && (
              <Button onClick={copyToClipboard} variant={copied ? 'secondary' : 'primary'} size="sm">
                {copied ? 'Copied to clipboard' : 'Copy to clipboard'}
              </Button>
            )}
          </div>

          {memoText ? (
            <div className="border border-border/30 rounded-sm bg-bg-cell/20 overflow-hidden">
              <pre className="text-2xs font-mono text-text-secondary whitespace-pre-wrap p-4 max-h-[600px] overflow-y-auto leading-relaxed">
                {memoText}
              </pre>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center border border-border/30 rounded-sm bg-bg-cell/20">
              <div className="text-xs text-text-dim font-medium">No memo generated yet</div>
              <div className="text-2xs text-text-muted mt-1">Generate a memo to create a shareable summary of the current setup.</div>
            </div>
          )}

          <BottomDescription className="space-y-1">
            <div>
              The memo reflects the current app state exactly as loaded: shared live snapshot, private scenario, or demo mode. It is meant as a shareable summary, not a separate calculation path, so its provenance should match the live status shown elsewhere in the dashboard.
            </div>
            {memoText && (
              <div>
                Generated from {selectedEvents.length} selected analogues using live date basis D+{dayN}{effectiveDate ? ` (${effectiveDate})` : ''}.
              </div>
            )}
          </BottomDescription>
        </div>
      </ChartCard>
    </div>
  );
}
