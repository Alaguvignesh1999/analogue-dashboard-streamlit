export interface LiveSeriesStateLike {
  returns: Record<string, Record<number, number>> | null;
  scoringReturns?: Record<string, Record<number, number>> | null;
  levels?: Record<string, Record<number, number>> | null;
  scoringLevels?: Record<string, Record<number, number>> | null;
  dayN: number | null;
  tradingDayN?: number | null;
  businessDates?: string[];
  asOfDate?: string | null;
}

export function getLiveScoringReturns(live: LiveSeriesStateLike): Record<string, Record<number, number>> | null {
  return live.scoringReturns ?? live.returns ?? null;
}

export function getLiveScoringDay(live: LiveSeriesStateLike): number {
  return live.tradingDayN ?? live.dayN ?? 0;
}

export function getLiveScoringLevels(live: LiveSeriesStateLike): Record<string, Record<number, number>> | null {
  return live.scoringLevels ?? live.levels ?? null;
}

function sortedOffsets(series?: Record<number, number> | null): number[] {
  if (!series) return [];
  return Object.keys(series)
    .map(Number)
    .filter((offset) => !Number.isNaN(offset))
    .sort((left, right) => left - right);
}

export function getSeriesPointAtOrBefore(
  series: Record<number, number> | undefined | null,
  targetOffset: number,
): { offset: number; value: number } | null {
  const offsets = sortedOffsets(series);
  for (let index = offsets.length - 1; index >= 0; index -= 1) {
    const offset = offsets[index];
    if (offset <= targetOffset) {
      return { offset, value: series![offset] };
    }
  }
  return null;
}

export function getLiveReturnPointAtOrBefore(
  live: LiveSeriesStateLike,
  label: string,
  targetOffset: number,
): { offset: number; value: number } | null {
  const returns = getLiveScoringReturns(live);
  return getSeriesPointAtOrBefore(returns?.[label], targetOffset);
}

export function getLiveLevelPointAtOrBefore(
  live: LiveSeriesStateLike,
  label: string,
  targetOffset: number,
): { offset: number; value: number } | null {
  const levels = getLiveScoringLevels(live);
  return getSeriesPointAtOrBefore(levels?.[label], targetOffset);
}

export function getLiveReturnAtOrBefore(
  live: LiveSeriesStateLike,
  label: string,
  targetOffset: number,
): number | null {
  return getLiveReturnPointAtOrBefore(live, label, targetOffset)?.value ?? null;
}

export function getLiveLevelAtOrBefore(
  live: LiveSeriesStateLike,
  label: string,
  targetOffset: number,
): number | null {
  return getLiveLevelPointAtOrBefore(live, label, targetOffset)?.value ?? null;
}

export function getEffectiveScoringDay(
  live: LiveSeriesStateLike,
  labels?: string[],
): number {
  const returns = getLiveScoringReturns(live);
  const baseDay = getLiveScoringDay(live);
  if (!returns) return baseDay;

  const candidateLabels = (labels && labels.length > 0 ? labels : Object.keys(returns))
    .filter((label) => returns[label] && Object.keys(returns[label]).length > 0);
  if (candidateLabels.length === 0) return baseDay;

  let maxAvailable = -1;
  for (const label of candidateLabels) {
    const point = getSeriesPointAtOrBefore(returns[label], Number.MAX_SAFE_INTEGER);
    if (point) {
      maxAvailable = Math.max(maxAvailable, point.offset);
    }
  }

  return maxAvailable >= 0 ? Math.min(baseDay, maxAvailable) : baseDay;
}

export function getEffectiveScoringDate(
  live: LiveSeriesStateLike,
  labels?: string[],
): string | null {
  const effectiveDay = getEffectiveScoringDay(live, labels);
  if (live.businessDates && effectiveDay >= 0 && effectiveDay < live.businessDates.length) {
    return live.businessDates[effectiveDay] ?? live.asOfDate ?? null;
  }
  return live.asOfDate ?? null;
}
