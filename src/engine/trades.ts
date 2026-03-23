import { AssetMeta, EventReturns, poiRet, unitLabel } from '@/engine/returns';
import { getLiveReturnPointAtOrBefore, LiveSeriesStateLike } from '@/engine/live';
import { nanMax, nanMean, nanMedian, nanMin, nanPercentile, nanStd, corrcoef } from '@/lib/math';
import { stars, statusFromPctile } from '@/lib/format';

export interface TradeRow {
  lbl: string;
  cls: string;
  ticker: string;
  dir: 'LONG' | 'SHORT';
  med: number;
  mean: number;
  std: number;
  iqr: number;
  stars: string;
  n: number;
  nTotal: number;
  unit: string;
  isRates: boolean;
  hitRate: number;
  sharpe: number;
  sortino: number;
  skew: number;
  worst: number;
  best: number;
  liveGap: number;
  livePctile: number;
  status: string;
  fwdVals: number[];
}

export interface ForwardHorizonStats {
  horizonLabel: string;
  horizonOffset: number;
  q1: number;
  med: number;
  q3: number;
  hit: number;
  sharpe: number;
  sortino: number;
  skew: number;
  worst: number;
  n: number;
}

export interface DotPlotPoint {
  event: string;
  value: number;
}

export interface LiveDeviationSeries {
  offset: number;
  p25: number | null;
  p75: number | null;
  median: number | null;
  live: number | null;
}

export function computeTradeRows(
  labels: string[],
  eventReturns: EventReturns,
  assetMeta: Record<string, AssetMeta>,
  selectedEvents: string[],
  dayN: number,
  fwdDays: number,
  live: LiveSeriesStateLike,
): TradeRow[] {
  const nSel = selectedEvents.length;
  const forwardOffset = dayN + fwdDays;
  if (forwardOffset <= dayN) return [];

  const rows: TradeRow[] = [];

  for (const label of labels) {
    const fwdVals: number[] = [];
    for (const eventName of selectedEvents) {
      const startValue = poiRet(eventReturns, label, eventName, dayN);
      const finishValue = poiRet(eventReturns, label, eventName, forwardOffset);
      if (!Number.isNaN(startValue) && !Number.isNaN(finishValue)) {
        fwdVals.push(finishValue - startValue);
      }
    }
    if (fwdVals.length < 2) continue;

    const med = nanMedian(fwdVals);
    const mean = nanMean(fwdVals);
    const std = nanStd(fwdVals);
    const iqr = nanPercentile(fwdVals, 75) - nanPercentile(fwdVals, 25);
    const isRates = assetMeta[label]?.is_rates_bp || false;
    const unit = unitLabel(assetMeta[label]);

    const hitRate = fwdVals.filter((value) =>
      (med > 0 && value > 0) || (med < 0 && value < 0)
    ).length / fwdVals.length;

    const direction = med >= 0 ? 1 : -1;
    const adjustedValues = fwdVals.map((value) => direction * value);
    const meanAdjusted = nanMean(adjustedValues);
    const stdAdjusted = nanStd(adjustedValues);
    const sharpe = meanAdjusted / (stdAdjusted + 1e-9);
    const downsideValues = adjustedValues.filter((value) => value < 0);
    const downsideStd = downsideValues.length > 1 ? nanStd(downsideValues) : stdAdjusted + 1e-9;
    const sortino = meanAdjusted / (downsideStd + 1e-9);
    const worst = direction > 0 ? nanMin(fwdVals) : nanMax(fwdVals);
    const best = direction > 0 ? nanMax(fwdVals) : nanMin(fwdVals);

    let skew = 0;
    if (fwdVals.length >= 3) {
      const meanValue = nanMean(fwdVals);
      const stdValue = nanStd(fwdVals);
      if (stdValue > 0) {
        skew = fwdVals.reduce((sum, value) => sum + ((value - meanValue) / stdValue) ** 3, 0) / fwdVals.length;
      }
    }

    let liveGap = Number.NaN;
    let livePctile = Number.NaN;
    const livePoint = getLiveReturnPointAtOrBefore(live, label, dayN);
    if (livePoint) {
      const historicalAtLivePoint: number[] = [];
      for (const eventName of selectedEvents) {
        const value = poiRet(eventReturns, label, eventName, livePoint.offset);
        if (!Number.isNaN(value)) historicalAtLivePoint.push(value);
      }
      if (historicalAtLivePoint.length >= 2) {
        liveGap = direction * (livePoint.value - nanMedian(historicalAtLivePoint));
        livePctile = (historicalAtLivePoint.filter((value) => livePoint.value > value).length / historicalAtLivePoint.length) * 100;
      }
    }

    const meta = assetMeta[label] || ({} as AssetMeta);
    rows.push({
      lbl: label,
      cls: meta.class || '',
      ticker: meta.ticker || '',
      dir: med >= 0 ? 'LONG' : 'SHORT',
      med,
      mean,
      std,
      iqr,
      stars: stars(iqr, med),
      n: fwdVals.length,
      nTotal: nSel,
      unit,
      isRates,
      hitRate,
      sharpe,
      sortino,
      skew,
      worst,
      best,
      liveGap,
      livePctile,
      status: statusFromPctile(Number.isNaN(livePctile) ? null : livePctile),
      fwdVals,
    });
  }

  rows.sort((left, right) => right.sharpe - left.sharpe);
  return rows;
}

export function computePerHorizonStats(
  label: string,
  selectedEvents: string[],
  dayN: number,
  eventReturns: EventReturns,
  horizons: Array<{ label: string; offset: number }>,
): ForwardHorizonStats[] {
  const rows: ForwardHorizonStats[] = [];

  for (const horizon of horizons) {
    if (horizon.offset <= dayN) continue;
    const vals: number[] = [];
    for (const eventName of selectedEvents) {
      const start = poiRet(eventReturns, label, eventName, dayN);
      const finish = poiRet(eventReturns, label, eventName, horizon.offset);
      if (!Number.isNaN(start) && !Number.isNaN(finish)) {
        vals.push(finish - start);
      }
    }
    if (vals.length < 2) continue;
    const med = nanMedian(vals);
    const mean = nanMean(vals);
    const std = nanStd(vals);
    const downside = vals.filter((value) => value < 0);
    const downsideStd = downside.length > 1 ? nanStd(downside) : std + 1e-9;
    const dir = med >= 0 ? 1 : -1;
    const directionAdjusted = vals.map((value) => value * dir);
    rows.push({
      horizonLabel: horizon.label,
      horizonOffset: horizon.offset,
      q1: nanPercentile(vals, 25),
      med,
      q3: nanPercentile(vals, 75),
      hit: vals.filter((value) => value * dir > 0).length / vals.length,
      sharpe: (mean * dir) / (std + 1e-9),
      sortino: (mean * dir) / (downsideStd + 1e-9),
      skew: vals.length >= 3 ? vals.reduce((sum, value) => sum + ((value - mean) / (std + 1e-9)) ** 3, 0) / vals.length : 0,
      worst: nanMin(directionAdjusted),
      n: vals.length,
    });
  }

  return rows;
}

export function buildDotPlot(
  label: string,
  selectedEvents: string[],
  startOffset: number,
  endOffset: number,
  eventReturns: EventReturns,
): DotPlotPoint[] {
  const points: DotPlotPoint[] = [];
  if (endOffset <= startOffset) return points;

  for (const eventName of selectedEvents) {
    const start = poiRet(eventReturns, label, eventName, startOffset);
    const finish = poiRet(eventReturns, label, eventName, endOffset);
    if (!Number.isNaN(start) && !Number.isNaN(finish)) {
      points.push({ event: eventName, value: finish - start });
    }
  }
  return points;
}

export function buildLiveDeviationSeries(
  label: string,
  selectedEvents: string[],
  dayN: number,
  eventReturns: EventReturns,
  live: LiveSeriesStateLike,
): LiveDeviationSeries[] {
  const series: LiveDeviationSeries[] = [];

  for (let offset = 0; offset <= dayN; offset += 1) {
    const values: number[] = [];
    for (const eventName of selectedEvents) {
      const value = poiRet(eventReturns, label, eventName, offset);
      if (!Number.isNaN(value)) values.push(value);
    }
    const livePoint = getLiveReturnPointAtOrBefore(live, label, offset);
    series.push({
      offset,
      p25: values.length > 0 ? nanPercentile(values, 25) : null,
      p75: values.length > 0 ? nanPercentile(values, 75) : null,
      median: values.length > 0 ? nanMedian(values) : null,
      live: livePoint?.value ?? null,
    });
  }

  return series;
}

export function buildIdeaCorrelationMatrix(
  rows: TradeRow[],
  selectedEvents: string[],
  dayN: number,
  fwdDays: number,
  eventReturns: EventReturns,
): { labels: string[]; matrix: number[][] } | null {
  const focusRows = rows.slice(0, Math.min(12, rows.length));
  if (focusRows.length < 2) return null;

  const endOffset = dayN + fwdDays;
  const perAssetValues = focusRows.map((row) => {
    return selectedEvents.map((eventName) => {
      const start = poiRet(eventReturns, row.lbl, eventName, dayN);
      const finish = poiRet(eventReturns, row.lbl, eventName, endOffset);
      return !Number.isNaN(start) && !Number.isNaN(finish) ? finish - start : Number.NaN;
    });
  });

  const matrix = focusRows.map((_, i) => {
    return focusRows.map((__, j) => {
      const a = perAssetValues[i];
      const b = perAssetValues[j];
      const filteredA: number[] = [];
      const filteredB: number[] = [];
      for (let index = 0; index < a.length; index += 1) {
        if (!Number.isNaN(a[index]) && !Number.isNaN(b[index])) {
          filteredA.push(a[index]);
          filteredB.push(b[index]);
        }
      }
      if (filteredA.length < 3) return Number.NaN;
      return corrcoef(filteredA, filteredB);
    });
  });

  return {
    labels: focusRows.map((row) => row.lbl),
    matrix,
  };
}
