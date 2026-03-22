import { POST_WINDOW_TD, PRE_WINDOW_TD, TRIGGER_ASSET } from '@/config/engine';
import { DailyHistoryPayload } from '@/engine/types';
import { AssetMeta } from '@/engine/returns';

export interface HistoricalPoint {
  index: number;
  date: string;
  value: number;
}

export interface CustomEventComputation {
  returnsByAsset: Record<string, Record<number, number>>;
  selectedDate: string;
  resolvedAnchorDate: string | null;
  coverage: {
    startDate: string | null;
    endDate: string | null;
  };
}

export function buildValidSeries(dailyHistory: DailyHistoryPayload, label: string): HistoricalPoint[] {
  const prices = dailyHistory.prices[label];
  if (!prices) return [];
  const observedIndices = dailyHistory.observedIndices?.[label];

  const points: HistoricalPoint[] = [];
  const indices = observedIndices && observedIndices.length > 0
    ? observedIndices
    : Array.from({ length: dailyHistory.dates.length }, (_, index) => index);

  for (const index of indices) {
    const value = prices[index];
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    points.push({ index, date: dailyHistory.dates[index], value });
  }
  return points;
}

export function getHistoricalCoverageRange(dailyHistory: DailyHistoryPayload): {
  startDate: string | null;
  endDate: string | null;
} {
  const dates = dailyHistory.dates || [];
  return {
    startDate: dates.length > 0 ? dates[0] : null,
    endDate: dailyHistory.asOf || dates[dates.length - 1] || null,
  };
}

export function resolvePointOnOrBefore(
  dailyHistory: DailyHistoryPayload,
  label: string,
  date: string
): HistoricalPoint | null {
  const series = buildValidSeries(dailyHistory, label);
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index].date <= date) {
      return series[index];
    }
  }
  return null;
}

export function resolveAnchorDateOnOrBefore(
  dailyHistory: DailyHistoryPayload,
  date: string
): string | null {
  const point = resolvePointOnOrBefore(dailyHistory, TRIGGER_ASSET, date);
  return point?.date || null;
}

export function getHistoricalPriceForDate(
  dailyHistory: DailyHistoryPayload,
  label: string,
  date: string
): { date: string; value: number } | null {
  const point = resolvePointOnOrBefore(dailyHistory, label, date);
  if (!point) return null;
  return { date: point.date, value: point.value };
}

export function getTriggerPriceForDate(
  dailyHistory: DailyHistoryPayload,
  date: string
): { date: string; value: number } | null {
  return getHistoricalPriceForDate(dailyHistory, TRIGGER_ASSET, date);
}

export function computeCustomEventReturns(
  dailyHistory: DailyHistoryPayload,
  assetMeta: Record<string, AssetMeta>,
  selectedDate: string
): CustomEventComputation {
  const coverage = getHistoricalCoverageRange(dailyHistory);
  const resolvedAnchorDate = resolveAnchorDateOnOrBefore(dailyHistory, selectedDate);

  if (!resolvedAnchorDate) {
    return {
      returnsByAsset: {},
      selectedDate,
      resolvedAnchorDate: null,
      coverage,
    };
  }

  const returnsByAsset: Record<string, Record<number, number>> = {};

  for (const label of Object.keys(assetMeta)) {
    const meta = assetMeta[label];
    const series = buildValidSeries(dailyHistory, label);
    if (series.length === 0) continue;

    let day0Index = -1;
    for (let index = series.length - 1; index >= 0; index -= 1) {
      if (series[index].date <= resolvedAnchorDate) {
        day0Index = index;
        break;
      }
    }
    if (day0Index < 0) continue;

    const denominator = series[Math.max(0, day0Index - 1)]?.value ?? series[day0Index]?.value;
    if (!denominator) continue;

    const windowStart = Math.max(0, day0Index - PRE_WINDOW_TD - 5);
    const windowEnd = Math.min(series.length, day0Index + POST_WINDOW_TD + 6);
    const window = series.slice(windowStart, windowEnd);
    const result: Record<number, number> = {};

    for (let index = 0; index < window.length; index += 1) {
      const offset = windowStart + index - day0Index;
      const value = window[index].value;
      let ret: number;
      if (meta.is_rates_bp) {
        ret = (value - denominator) * 100;
      } else {
        ret = (value / denominator - 1) * 100;
        if (!meta.invert) ret = -ret;
      }
      result[offset] = Math.round(ret * 10000) / 10000;
    }

    returnsByAsset[label] = result;
  }

  return {
    returnsByAsset,
    selectedDate,
    resolvedAnchorDate,
    coverage,
  };
}
