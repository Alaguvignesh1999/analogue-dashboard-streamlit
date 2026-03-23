'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/store/dashboard';
import { BottomDescription, ChartCard, Select, SliderControl, StatBox, Badge } from '@/components/ui/ChartCard';
import { poiRet, displayLabel } from '@/engine/returns';
import { SIMILARITY_ASSET_POOL, POIS } from '@/config/engine';
import { cosine, nanMean, nanMedian } from '@/lib/math';
import { fmtReturn } from '@/lib/format';

interface OosResult {
  event: string;
  predicted: number;
  actual: number;
  error: number;
  dirMatch: boolean;
  overlap: number;
}

function buildOverlapVector(
  eventReturns: Record<string, Record<string, Record<number, number>>>,
  eventName: string,
  offset: number,
  assets: string[],
): Array<{ asset: string; value: number }> {
  const vector: Array<{ asset: string; value: number }> = [];
  for (const asset of assets) {
    const value = poiRet(eventReturns, asset, eventName, offset);
    if (!Number.isNaN(value)) {
      vector.push({ asset, value });
    }
  }
  return vector;
}

export function OosTab() {
  const { eventReturns, assetMeta, events, activeEvents, horizon } = useDashboard();
  const [holdout, setHoldout] = useState(3);
  const [poiOffset, setPoiOffset] = useState(21);
  const [referenceAsset, setReferenceAsset] = useState(SIMILARITY_ASSET_POOL[0]);

  const activeEventNames = useMemo(
    () => events.filter((event) => activeEvents.has(event.name)).map((event) => event.name),
    [events, activeEvents],
  );

  const referenceOptions = useMemo(
    () => SIMILARITY_ASSET_POOL.filter((asset) => assetMeta[asset]).map((asset) => ({ value: asset, label: displayLabel(assetMeta[asset], asset) })),
    [assetMeta],
  );

  const { results, summary } = useMemo(() => {
    if (activeEventNames.length < holdout + 2) {
      return { results: [] as OosResult[], summary: { dirAcc: 0, mae: 0, n: 0 } };
    }

    const heldOut = activeEventNames.slice(-holdout);
    const calibration = activeEventNames.slice(0, -holdout);
    const pool = SIMILARITY_ASSET_POOL;
    const outOfSample: OosResult[] = [];

    for (const testEvent of heldOut) {
      const testVector = buildOverlapVector(eventReturns, testEvent, poiOffset, pool);
      if (testVector.length < 2) continue;

      const similarities: { evt: string; sim: number; overlap: number }[] = [];
      for (const calibrationEvent of calibration) {
        const calibrationVector = buildOverlapVector(eventReturns, calibrationEvent, poiOffset, pool);
        const sharedAssets = testVector
          .map((point) => point.asset)
          .filter((asset) => calibrationVector.some((candidate) => candidate.asset === asset));
        if (sharedAssets.length < 2) continue;

        const testValues = sharedAssets.map((asset) => testVector.find((point) => point.asset === asset)!.value);
        const calValues = sharedAssets.map((asset) => calibrationVector.find((point) => point.asset === asset)!.value);
        similarities.push({ evt: calibrationEvent, sim: cosine(testValues, calValues), overlap: sharedAssets.length });
      }

      if (similarities.length === 0) continue;

      similarities.sort((left, right) => right.sim - left.sim);
      const topK = Math.max(1, Math.ceil(similarities.length * 0.3));
      const topEvents = similarities.slice(0, topK);

      const predictedValues: number[] = [];
      for (const item of topEvents) {
        const value = poiRet(eventReturns, referenceAsset, item.evt, poiOffset);
        if (!Number.isNaN(value)) predictedValues.push(value);
      }
      if (predictedValues.length === 0) continue;

      const actual = poiRet(eventReturns, referenceAsset, testEvent, poiOffset);
      if (Number.isNaN(actual)) continue;

      const predicted = nanMedian(predictedValues);
      const error = actual - predicted;
      const dirMatch = (predicted >= 0 && actual >= 0) || (predicted < 0 && actual < 0);
      const overlap = Math.round(nanMean(topEvents.map((item) => item.overlap)));

      outOfSample.push({ event: testEvent, predicted, actual, error, dirMatch, overlap });
    }

    const dirMatches = outOfSample.filter((result) => result.dirMatch).length;
    const mae = outOfSample.length > 0 ? nanMean(outOfSample.map((result) => Math.abs(result.error))) || 0 : 0;

    return {
      results: outOfSample,
      summary: { dirAcc: outOfSample.length > 0 ? dirMatches / outOfSample.length : 0, mae, n: outOfSample.length },
    };
  }, [activeEventNames, assetMeta, eventReturns, holdout, poiOffset, referenceAsset]);

  const fwdOptions = useMemo(
    () => POIS.filter((poi) => poi.offset > 0).map((poi) => ({ value: String(poi.offset), label: `${poi.label} (D+${poi.offset})` })),
    [],
  );

  const isRates = assetMeta[referenceAsset]?.is_rates_bp || false;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ChartCard
        title="Out-of-Sample Validation"
        subtitle={`Leave-${holdout}-out · ${activeEventNames.length} events · reference ${displayLabel(assetMeta[referenceAsset], referenceAsset)}`}
        controls={
          <div className="flex items-center gap-4 flex-wrap">
            <SliderControl label="Hold-out" value={holdout} onChange={setHoldout} min={1} max={5} />
            <Select label="Target" value={String(poiOffset)} onChange={(value) => setPoiOffset(Number(value))} options={fwdOptions} />
            <Select label="Ref" value={referenceAsset} onChange={setReferenceAsset} options={referenceOptions} />
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-2 p-4 bg-bg-cell/30">
          <StatBox label="Direction Accuracy" value={`${(summary.dirAcc * 100).toFixed(0)}%`} color={summary.dirAcc >= 0.6 ? '#22c55e' : '#ef4444'} />
          <StatBox label="MAE" value={summary.mae.toFixed(2)} color="#a1a1b0" />
          <StatBox label="Test Cases" value={summary.n} color="#a1a1b0" />
        </div>

        <div className="border-t border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-2xs font-mono">
              <thead>
                <tr className="bg-bg-cell/80 border-b border-border/40">
                  {['#', 'Event', 'Predicted', 'Actual', 'Error', 'Dir', 'Overlap'].map((header) => (
                    <th key={header} className="px-3 py-2 text-text-muted font-medium text-left whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim text-xs">
                      Need at least {holdout + 2} active events with overlapping data.
                    </td>
                  </tr>
                ) : results.map((result, index) => (
                  <tr key={result.event} className="border-b border-border/20 hover:bg-bg-cell/40 transition-colors">
                    <td className="px-3 py-2 text-text-dim">{index + 1}</td>
                    <td className="px-3 py-2 text-text-primary font-medium">{result.event}</td>
                    <td className="px-3 py-2 text-text-secondary">{fmtReturn(result.predicted, isRates)}</td>
                    <td className="px-3 py-2 text-text-primary font-medium">{fmtReturn(result.actual, isRates)}</td>
                    <td className={`px-3 py-2 font-semibold ${Math.abs(result.error) < 2 ? 'text-up' : 'text-down'}`}>
                      {result.error > 0 ? '+' : ''}{result.error.toFixed(1)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={result.dirMatch ? 'green' : 'red'}>
                        {result.dirMatch ? 'Match' : 'Mismatch'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-text-dim">{result.overlap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-4 py-3 text-2xs text-text-dim bg-bg-cell/30">
          Hold out {holdout} recent events, score similarity from the {SIMILARITY_ASSET_POOL.length}-asset pool using overlap-only vectors, then predict the held-out {displayLabel(assetMeta[referenceAsset], referenceAsset)} move from the median of the top 30% analogue set.
        </div>
        <BottomDescription>
          OOS validation now compares only overlapping valid asset returns when scoring held-out events. Missing observations are skipped, not zero-filled, so low-overlap events are penalized instead of silently treated as neutral.
        </BottomDescription>
      </ChartCard>
    </div>
  );
}
