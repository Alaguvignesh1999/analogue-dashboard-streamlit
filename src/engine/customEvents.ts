import { POST_WINDOW_TD, PRE_WINDOW_TD, TRIGGER_ASSET } from '@/config/engine';
import { DailyHistoryPayload } from '@/engine/types';
import { AssetMeta } from '@/engine/returns';

function buildValidSeries(dailyHistory: DailyHistoryPayload, label: string) {
  const prices = dailyHistory.prices[label];
  if (!prices) return [];

  const points: Array<{ date: string; value: number }> = [];
  for (let index = 0; index < dailyHistory.dates.length; index += 1) {
    const value = prices[index];
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    points.push({ date: dailyHistory.dates[index], value });
  }
  return points;
}

export function getHistoricalPriceForDate(
  dailyHistory: DailyHistoryPayload,
  label: string,
  date: string
): { date: string; value: number } | null {
  const series = buildValidSeries(dailyHistory, label);
  for (const point of series) {
    if (point.date >= date) return point;
  }
  return null;
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
  eventDate: string
): Record<string, Record<number, number>> {
  const returnsByAsset: Record<string, Record<number, number>> = {};

  for (const label of Object.keys(assetMeta)) {
    const meta = assetMeta[label];
    const series = buildValidSeries(dailyHistory, label);
    if (series.length === 0) continue;

    const day0Index = series.findIndex((point) => point.date >= eventDate);
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

  return returnsByAsset;
}
