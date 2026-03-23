export interface LiveSeriesStateLike {
  returns: Record<string, Record<number, number>> | null;
  scoringReturns?: Record<string, Record<number, number>> | null;
  levels?: Record<string, Record<number, number>> | null;
  scoringLevels?: Record<string, Record<number, number>> | null;
  analysisDayN?: number | null;
  dayN: number | null;
  tradingDayN?: number | null;
  businessDates?: string[];
  asOfDate?: string | null;
}

export interface LiveDiagnosticsSummary {
  displayDayN: number;
  displayDate: string | null;
  scoringDayN: number;
  scoringDate: string | null;
  effectiveDayN: number;
  effectiveDate: string | null;
  availableAssetCount: number;
  requestedAssetCount: number;
  coverageRatio: number;
}

export function getLiveScoringReturns(live: LiveSeriesStateLike): Record<string, Record<number, number>> | null {
  return live.scoringReturns ?? live.returns ?? null;
}

export function getLiveDisplayReturns(live: LiveSeriesStateLike): Record<string, Record<number, number>> | null {
  return live.returns ?? live.scoringReturns ?? null;
}

export function getLiveDisplayDay(live: LiveSeriesStateLike): number {
  const latestDisplayDay = live.dayN ?? live.tradingDayN ?? 0;
  const requestedDay = live.analysisDayN ?? latestDisplayDay;
  return Math.max(0, Math.min(requestedDay, latestDisplayDay));
}

export function getLiveScoringDay(live: LiveSeriesStateLike): number {
  const latestAvailableDay = live.tradingDayN ?? live.dayN ?? 0;
  const requestedDay = live.analysisDayN ?? latestAvailableDay;
  return Math.max(0, Math.min(requestedDay, latestAvailableDay));
}

export function getLiveDisplayDate(live: LiveSeriesStateLike): string | null {
  const displayDay = getLiveDisplayDay(live);
  if (live.businessDates && displayDay >= 0 && displayDay < live.businessDates.length) {
    return live.businessDates[displayDay] ?? live.asOfDate ?? null;
  }
  return live.asOfDate ?? null;
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

export function getLiveDisplayReturnPointAtOrBefore(
  live: LiveSeriesStateLike,
  label: string,
  targetOffset: number,
): { offset: number; value: number } | null {
  const returns = getLiveDisplayReturns(live);
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

export function getLiveAssetCoverage(
  live: LiveSeriesStateLike,
  labels?: string[],
  targetOffset?: number,
): { available: number; total: number; ratio: number } {
  const returns = getLiveScoringReturns(live);
  if (!returns) return { available: 0, total: labels?.length || 0, ratio: 0 };

  const candidateLabels = (labels && labels.length > 0 ? labels : Object.keys(returns));
  const resolvedOffset = targetOffset ?? getLiveScoringDay(live);
  let available = 0;

  for (const label of candidateLabels) {
    if (getSeriesPointAtOrBefore(returns[label], resolvedOffset)) {
      available += 1;
    }
  }

  const total = candidateLabels.length;
  return {
    available,
    total,
    ratio: total > 0 ? available / total : 0,
  };
}

export function getLiveDiagnosticsSummary(
  live: LiveSeriesStateLike,
  labels?: string[],
): LiveDiagnosticsSummary {
  const displayDayN = getLiveDisplayDay(live);
  const displayDate = getLiveDisplayDate(live);
  const scoringDayN = getLiveScoringDay(live);
  const scoringDate = live.businessDates && scoringDayN >= 0 && scoringDayN < live.businessDates.length
    ? live.businessDates[scoringDayN] ?? live.asOfDate ?? null
    : live.asOfDate ?? null;
  const effectiveDayN = getEffectiveScoringDay(live, labels);
  const effectiveDate = getEffectiveScoringDate(live, labels);
  const coverage = getLiveAssetCoverage(live, labels, effectiveDayN);

  return {
    displayDayN,
    displayDate,
    scoringDayN,
    scoringDate,
    effectiveDayN,
    effectiveDate,
    availableAssetCount: coverage.available,
    requestedAssetCount: coverage.total,
    coverageRatio: coverage.ratio,
  };
}
