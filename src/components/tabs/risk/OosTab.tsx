'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { ChartCard, Select, SliderControl, StatBox, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel, unitLabel } from '@/engine/returns';
import { SIMILARITY_ASSET_POOL, POIS } from '@/config/engine';
import { cosine, nanMean, nanMedian } from '@/lib/math';
import { fmtReturn } from '@/lib/format';

interface OosResult {
  event: string;
  predicted: number;
  actual: number;
  error: number;
  dirMatch: boolean;
}

export function OosTab() {
  const { eventReturns, assetMeta, events, activeEvents, horizon } = useDashboard();
  const [holdout, setHoldout] = useState(3);
  const [poiOffset, setPoiOffset] = useState(21);

  const activeEventNames = useMemo(() =>
    events.filter(e => activeEvents.has(e.name)).map(e => e.name),
    [events, activeEvents]
  );

  // Leave-N-Out OOS validation
  const { results, summary } = useMemo(() => {
    if (activeEventNames.length < holdout + 2) {
      return { results: [] as OosResult[], summary: { dirAcc: 0, mae: 0, n: 0 } };
    }

    const heldOut = activeEventNames.slice(-holdout);
    const calibration = activeEventNames.slice(0, -holdout);
    const pool = SIMILARITY_ASSET_POOL;
    const oos: OosResult[] = [];

    for (const testEvt of heldOut) {
      // Build test vector: returns across asset pool at poiOffset
      const testVec: number[] = [];
      for (const asset of pool) {
        const v = poiRet(eventReturns, asset, testEvt, poiOffset);
        testVec.push(isNaN(v) ? 0 : v);
      }

      // Compute similarity to each calibration event
      const sims: { evt: string; sim: number }[] = [];
      for (const calEvt of calibration) {
        const calVec: number[] = [];
        for (const asset of pool) {
          const v = poiRet(eventReturns, asset, calEvt, poiOffset);
          calVec.push(isNaN(v) ? 0 : v);
        }
        sims.push({ evt: calEvt, sim: cosine(testVec, calVec) });
      }

      // Top-K analogues (30%)
      sims.sort((a, b) => b.sim - a.sim);
      const topK = Math.max(1, Math.ceil(calibration.length * 0.3));
      const topEvents = sims.slice(0, topK).map(s => s.evt);

      // Predict median forward return for a reference asset
      const refAsset = pool[0];
      const predictedVals: number[] = [];
      for (const en of topEvents) {
        const v = poiRet(eventReturns, refAsset, en, poiOffset);
        if (!isNaN(v)) predictedVals.push(v);
      }
      const predicted = predictedVals.length > 0 ? nanMedian(predictedVals) : 0;

      // Actual
      const actual = poiRet(eventReturns, refAsset, testEvt, poiOffset);
      const actualVal = isNaN(actual) ? 0 : actual;

      const error = actualVal - predicted;
      const dirMatch = (predicted >= 0 && actualVal >= 0) || (predicted < 0 && actualVal < 0);

      oos.push({ event: testEvt, predicted, actual: actualVal, error, dirMatch });
    }

    const dirMatches = oos.filter(r => r.dirMatch).length;
    const mae = oos.length > 0 ? nanMean(oos.map(r => Math.abs(r.error))) || 0 : 0;

    return {
      results: oos,
      summary: { dirAcc: oos.length > 0 ? dirMatches / oos.length : 0, mae, n: oos.length },
    };
  }, [activeEventNames, holdout, poiOffset, eventReturns]);

  const fwdOptions = POIS.filter(p => p.offset > 0).map(p => ({ value: String(p.offset), label: `${p.label} (D+${p.offset})` }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Out-of-Sample Validation"
        subtitle={`Leave-${holdout}-Out · ${activeEventNames.length} events · ref: ${SIMILARITY_ASSET_POOL[0]}`}
        controls={
          <div className="flex items-center gap-4">
            <SliderControl label="Hold-out" value={holdout} onChange={setHoldout} min={1} max={5} />
            <Select label="Target" value={String(poiOffset)} onChange={v => setPoiOffset(Number(v))} options={fwdOptions} />
          </div>
        }
      >
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 p-4 bg-bg-cell/30">
          <StatBox
            label="Direction Accuracy"
            value={`${(summary.dirAcc * 100).toFixed(0)}%`}
            color={summary.dirAcc >= 0.6 ? '#22c55e' : '#ef4444'}
          />
          <StatBox
            label="MAE"
            value={summary.mae.toFixed(2)}
            color="#a1a1b0"
          />
          <StatBox
            label="Test Cases"
            value={summary.n}
            color="#a1a1b0"
          />
        </div>

        {/* Results Table */}
        <div className="border-t border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-2xs font-mono">
              <thead>
                <tr className="bg-bg-cell/80 border-b border-border/40">
                  {['#', 'Event', 'Predicted', 'Actual', 'Error', 'Dir'].map(h => (
                    <th key={h} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-dim text-xs">
                      Need at least {holdout + 2} active events
                    </td>
                  </tr>
                ) : results.map((r, i) => {
                  const isRates = assetMeta[SIMILARITY_ASSET_POOL[0]]?.is_rates_bp || false;
                  return (
                    <tr key={r.event} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                      <td className="px-3 py-2 text-text-dim">{i + 1}</td>
                      <td className="px-3 py-2 text-text-primary font-medium">{r.event}</td>
                      <td className="px-3 py-2 text-text-secondary">{fmtReturn(r.predicted, isRates)}</td>
                      <td className="px-3 py-2 text-text-primary font-medium">{fmtReturn(r.actual, isRates)}</td>
                      <td className={`px-3 py-2 font-semibold ${Math.abs(r.error) < 2 ? 'text-up' : 'text-down'}`}>
                        {r.error > 0 ? '+' : ''}{r.error.toFixed(1)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge color={r.dirMatch ? 'green' : 'red'}>
                          {r.dirMatch ? 'Match' : 'Mismatch'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-4 py-3 text-2xs text-text-dim bg-bg-cell/30">
          <span className="font-mono">
            Hold {holdout} recent, score via cosine ({SIMILARITY_ASSET_POOL.length}-asset pool), predict median from top 30%
          </span>
        </div>
      </ChartCard>
    </div>
  );
}
