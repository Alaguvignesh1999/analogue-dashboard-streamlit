import { PRE_WINDOW_TD, TRIGGER_ASSET } from '@/config/engine';
import { AssetMeta } from '@/engine/returns';
import { buildValidSeries } from '@/engine/customEvents';
import { DailyHistoryPayload, LiveAssetStatus, LiveRequestMode, SharedLiveSnapshot } from '@/engine/types';

interface ObservedSeries {
  rawReturns: Record<number, number>;
  rawLevels: Record<number, number>;
  scoringReturns: Record<number, number>;
  scoringLevels: Record<number, number>;
  observedDates: string[];
  day0Price: number;
  actualDay0: string | null;
  asOfDate: string | null;
}

function toUtcDate(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function dayDiff(startDate: string, endDate: string): number {
  return Math.floor((toUtcDate(endDate) - toUtcDate(startDate)) / 86400000);
}

function computeObservedSeries(
  dailyHistory: DailyHistoryPayload,
  label: string,
  requestedDay0: string,
  meta: AssetMeta
): ObservedSeries | null {
  const series = buildValidSeries(dailyHistory, label);
  if (series.length === 0) return null;

  let day0Index = -1;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index].date <= requestedDay0) {
      day0Index = index;
      break;
    }
  }
  if (day0Index < 0) return null;

  const day0Price = series[day0Index].value;
  const actualDay0 = series[day0Index].date;
  const baselinePrice = series[Math.max(0, day0Index - 1)]?.value ?? day0Price;
  const rawReturns: Record<number, number> = {};
  const rawLevels: Record<number, number> = {};
  const scoringReturns: Record<number, number> = {};
  const scoringLevels: Record<number, number> = {};
  const observedDates: string[] = [];
  const windowStart = Math.max(0, day0Index - PRE_WINDOW_TD - 5);

  for (let index = windowStart; index < series.length; index += 1) {
    const point = series[index];
    const offset = dayDiff(actualDay0, point.date);
    rawLevels[offset] = point.value;
    if (meta.is_rates_bp) {
      rawReturns[offset] = (point.value - baselinePrice) * 100;
    } else {
      const change = (point.value / baselinePrice - 1) * 100;
      rawReturns[offset] = meta.invert ? change : -change;
    }

    if (index >= day0Index) {
      observedDates.push(point.date);
      scoringLevels[index - day0Index] = point.value;
      if (meta.is_rates_bp) {
        scoringReturns[index - day0Index] = (point.value - baselinePrice) * 100;
      } else {
        const change = (point.value / baselinePrice - 1) * 100;
        scoringReturns[index - day0Index] = meta.invert ? change : -change;
      }
    }
  }

  return {
    rawReturns,
    rawLevels,
    scoringReturns,
    scoringLevels,
    observedDates,
    day0Price,
    actualDay0,
    asOfDate: observedDates[observedDates.length - 1] || null,
  };
}

function fillCalendarSeries(
  rawReturns: Record<number, number>,
  rawLevels: Record<number, number>,
  day0Price: number,
  targetOffset: number,
  maxCarryDays = 3,
) {
  const offsets = Object.keys(rawReturns).map(Number).sort((left, right) => left - right);
  if (offsets.length === 0 || targetOffset < 0) {
    return {
      returns: {} as Record<number, number>,
      levels: {} as Record<number, number>,
    };
  }

  const startOffset = Math.max(offsets[0], -PRE_WINDOW_TD);
  const lastObservedOffset = offsets[offsets.length - 1];
  const fillLimit = Math.min(targetOffset, lastObservedOffset + maxCarryDays);
  const returns: Record<number, number> = {};
  const levels: Record<number, number> = {};
  const firstObservedOffset = offsets.find((offset) => offset >= startOffset) ?? offsets[0];
  let lastReturn = rawReturns[firstObservedOffset] ?? 0;
  let lastLevel = rawLevels[firstObservedOffset] ?? day0Price;

  for (let offset = startOffset; offset <= fillLimit; offset += 1) {
    if (rawReturns[offset] !== undefined) lastReturn = rawReturns[offset];
    if (rawLevels[offset] !== undefined) lastLevel = rawLevels[offset];
    returns[offset] = lastReturn;
    levels[offset] = lastLevel;
  }

  return { returns, levels };
}

export function buildLivePayloadFromDailyHistory(
  dailyHistory: DailyHistoryPayload,
  assetMeta: Record<string, AssetMeta>,
  requestedDay0: string,
  mode: LiveRequestMode,
  options?: {
    name?: string;
    tags?: string[];
    cpi?: string;
    fed?: string;
    source?: 'shared-snapshot' | 'generated-history' | 'runtime-fetch';
    schemaVersion?: number | null;
    warnings?: string[];
    labels?: string[];
  }
): SharedLiveSnapshot {
  const labels = (options?.labels && options.labels.length > 0
    ? options.labels
    : Object.keys(assetMeta)
  ).filter((label) => dailyHistory.prices[label] && assetMeta[label]);

  const observedByAsset: Record<string, ObservedSeries> = {};
  const assetStatus: Record<string, LiveAssetStatus> = {};
  let triggerPrice: number | null = null;
  let canonicalDates: string[] = [];
  let actualDay0: string | null = null;
  let asOfDate: string | null = null;

  for (const label of labels) {
    const series = computeObservedSeries(dailyHistory, label, requestedDay0, assetMeta[label]);
    if (!series || Object.keys(series.rawReturns).length === 0) {
      assetStatus[label] = {
        status: 'missing',
        source: options?.source || 'generated-history',
        asOfDate: null,
        warning: `No cached history available on or before ${requestedDay0}`,
      };
      continue;
    }

    observedByAsset[label] = series;
    assetStatus[label] = {
      status: 'ok',
      source: options?.source || 'generated-history',
      asOfDate: series.asOfDate,
    };

    if (label === TRIGGER_ASSET) {
      triggerPrice = series.day0Price;
      canonicalDates = series.observedDates;
      actualDay0 = series.actualDay0;
      asOfDate = series.asOfDate;
    } else if (series.observedDates.length > canonicalDates.length) {
      canonicalDates = series.observedDates;
      actualDay0 = actualDay0 || series.actualDay0;
      asOfDate = series.asOfDate || asOfDate;
    }
  }

  const canonicalActualDay0 = actualDay0 || requestedDay0;
  const canonicalAsOf = asOfDate || dailyHistory.asOf || canonicalDates[canonicalDates.length - 1] || null;
  const dayN = canonicalAsOf ? Math.max(0, dayDiff(canonicalActualDay0, canonicalAsOf)) : 0;
  const tradingDayN = Math.max(0, canonicalDates.length - 1);
  const returns: Record<string, Record<number, number>> = {};
  const levels: Record<string, Record<number, number>> = {};
  const scoringReturns: Record<string, Record<number, number>> = {};
  const scoringLevels: Record<string, Record<number, number>> = {};

  for (const [label, series] of Object.entries(observedByAsset)) {
    const filled = fillCalendarSeries(series.rawReturns, series.rawLevels, series.day0Price, dayN);
    if (Object.keys(filled.returns).length === 0) continue;
    returns[label] = filled.returns;
    levels[label] = filled.levels;
    scoringReturns[label] = series.scoringReturns;
    scoringLevels[label] = series.scoringLevels;
  }

  let triggerZScore: number | null = null;
  if (triggerPrice !== null) {
    const historicalTriggers = [4, 17, 25, 11, 22, 35, 37, 85, 104, 53, 54, 91, 73];
    const mean = historicalTriggers.reduce((sum, value) => sum + value, 0) / historicalTriggers.length;
    const variance = historicalTriggers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / historicalTriggers.length;
    const std = Math.sqrt(variance);
    triggerZScore = std > 0 ? (triggerPrice - mean) / std : 0;
  }

  return {
    name: options?.name || 'Shared Live Snapshot',
    snapshotDate: dailyHistory.asOf || canonicalAsOf || requestedDay0,
    requestedDay0,
    actualDay0: canonicalActualDay0,
    triggerDate: canonicalActualDay0,
    asOfDate: canonicalAsOf,
    dayN,
    tradingDayN,
    returns,
    levels,
    scoringReturns,
    scoringLevels,
    assetStatus,
    warnings: options?.warnings || [],
    provenance: {
      mode,
      source: options?.source || 'generated-history',
      builtAt: new Date().toISOString(),
      schemaVersion: options?.schemaVersion ?? dailyHistory.schemaVersion ?? null,
    },
    businessDates: canonicalDates,
    triggerPrice,
    triggerZScore,
    triggerPctile: triggerZScore,
    tagSet: options?.tags || [],
    cpi: options?.cpi,
    fed: options?.fed,
  };
}
