'use client';
import { useMemo, useState, useCallback } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Button, Badge } from '@/components/ui/ChartCard';
import { selectEvents } from '@/engine/similarity';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { SIMILARITY_ASSET_POOL } from '@/config/engine';
import { nanMedian, nanMean, nanStd, nanMin, nanMax, nanPercentile } from '@/lib/math';
import { fmtReturn, stars, entrySignal } from '@/lib/format';

export function MemoTab() {
  const { eventReturns, assetMeta, scores, scoreCutoff, horizon, live } = useDashboard();
  const [memoText, setMemoText] = useState('');
  const [copied, setCopied] = useState(false);

  const selectedEvents = useMemo(() => selectEvents(scores, scoreCutoff), [scores, scoreCutoff]);
  const dayN = live.dayN ?? 0;

  const generateMemo = useCallback(() => {
    const lines: string[] = [];

    lines.push('┌─────────────────────────────────────────────────────┐');
    lines.push('│  TRADE MEMO  ─  ANALOGUE DASHBOARD                  │');
    lines.push('└─────────────────────────────────────────────────────┘');
    lines.push('');

    // Event info
    lines.push('EVENT CONTEXT');
    lines.push('─────────────────────────────────────────────────────');
    lines.push(`  Live Event:  ${live.name || 'N/A'}`);
    lines.push(`  Day 0:       ${live.day0 || 'N/A'}`);
    lines.push(`  Current:     D+${dayN}`);
    lines.push(`  Horizon:     +${horizon}d  (D+${dayN} → D+${dayN + horizon})`);
    lines.push(`  Analogues:   ${selectedEvents.length} of ${scores.length} selected  (cutoff: ${scoreCutoff.toFixed(2)})`);
    lines.push('');

    // Top analogues
    lines.push('TOP ANALOGUES');
    lines.push('─────────────────────────────────────────────────────');
    const sortedScores = [...scores].sort((a, b) => b.composite - a.composite).slice(0, 8);
    for (const s of sortedScores) {
      const check = s.composite >= scoreCutoff ? '✓' : '•';
      const comp = (s.composite * 100).toFixed(0);
      const q = (s.quant * 100).toFixed(0);
      const t = (s.tag * 100).toFixed(0);
      const m = (s.macro * 100).toFixed(0);
      lines.push(`  ${check}  ${s.event.padEnd(28)}  composite=${comp}%  q=${q}%  t=${t}%  m=${m}%`);
    }
    lines.push('');

    // Top signals
    lines.push('TOP SIGNALS');
    lines.push('─────────────────────────────────────────────────────');

    const assetSignals: { asset: string; med: number; iqr: number; hit: number; sharpe: number; rating: string; isRates: boolean; n: number }[] = [];
    for (const lbl of SIMILARITY_ASSET_POOL) {
      const meta = assetMeta[lbl];
      const isRates = meta?.is_rates_bp || false;
      const fwds: number[] = [];
      for (const en of selectedEvents) {
        const atDn = poiRet(eventReturns, lbl, en, dayN);
        const atFo = poiRet(eventReturns, lbl, en, dayN + horizon);
        if (!isNaN(atDn) && !isNaN(atFo)) fwds.push(atFo - atDn);
      }
      if (fwds.length < 2) continue;
      const med = nanMedian(fwds);
      const iqr = nanPercentile(fwds, 75) - nanPercentile(fwds, 25);
      const dir = med >= 0 ? 1 : -1;
      const hit = fwds.filter(v => v * dir > 0).length / fwds.length;
      const sharpe = nanMean(fwds.map(v => v * dir)) / (nanStd(fwds.map(v => v * dir)) + 1e-9);
      assetSignals.push({ asset: lbl, med, iqr, hit, sharpe, rating: stars(iqr, med), isRates, n: fwds.length });
    }
    assetSignals.sort((a, b) => Math.abs(b.sharpe) - Math.abs(a.sharpe));

    for (const s of assetSignals.slice(0, 12)) {
      const label = displayLabel(assetMeta[s.asset], s.asset);
      const dir = s.med >= 0 ? 'LONG' : 'SHORT';
      lines.push(`  ${dir.padEnd(5)}  ${label.padEnd(20)}  med=${fmtReturn(s.med, s.isRates).padStart(8)}  hit=${(s.hit * 100).toFixed(0)}%  Sharpe=${s.sharpe.toFixed(2)}  ${s.rating}  n=${s.n}`);
    }
    lines.push('');

    // Risk notes
    lines.push('RISK SUMMARY');
    lines.push('─────────────────────────────────────────────────────');
    const allFwds: number[] = [];
    for (const s of assetSignals) {
      for (const en of selectedEvents) {
        const atDn = poiRet(eventReturns, s.asset, en, dayN);
        const atFo = poiRet(eventReturns, s.asset, en, dayN + horizon);
        if (!isNaN(atDn) && !isNaN(atFo)) allFwds.push(atFo - atDn);
      }
    }
    if (allFwds.length > 0) {
      lines.push(`  Cross-asset range:   ${nanMin(allFwds).toFixed(1)} to ${nanMax(allFwds).toFixed(1)}`);
      lines.push(`  5th percentile:       ${nanPercentile(allFwds, 5).toFixed(1)}`);
      lines.push(`  95th percentile:      ${nanPercentile(allFwds, 95).toFixed(1)}`);
    }
    lines.push(`  Historical lookback:  ${selectedEvents.length} analogue events`);
    lines.push('');
    lines.push('└─────────────────────────────────────────────────────┘');

    setMemoText(lines.join('\n'));
  }, [eventReturns, assetMeta, scores, scoreCutoff, selectedEvents, dayN, horizon, live]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(memoText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [memoText]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard title="Trade Memo" subtitle="Auto-generated summary from current analogue state">
        <div className="p-4 space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={generateMemo} size="sm">
              Generate Memo
            </Button>
            {memoText && (
              <Button
                onClick={copyToClipboard}
                variant={copied ? 'secondary' : 'primary'}
                size="sm"
              >
                {copied ? '✓ Copied to Clipboard' : 'Copy to Clipboard'}
              </Button>
            )}
          </div>

          {/* Memo Display */}
          {memoText ? (
            <div className="border border-border/30 rounded-sm bg-bg-cell/20 overflow-hidden">
              <pre className="text-2xs font-mono text-text-secondary whitespace-pre-wrap p-4 max-h-[600px] overflow-y-auto leading-relaxed">
                {memoText}
              </pre>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center border border-border/30 rounded-sm bg-bg-cell/20">
              <div className="text-xs text-text-dim font-medium">No memo generated yet</div>
              <div className="text-2xs text-text-muted mt-1">
                Click &quot;Generate Memo&quot; to create trade summary
              </div>
            </div>
          )}

          {/* Footer */}
          {memoText && (
            <div className="text-2xs text-text-dim border-t border-border/30 pt-3">
              Generated from {selectedEvents.length} selected analogues
            </div>
          )}
        </div>
      </ChartCard>
    </div>
  );
}
