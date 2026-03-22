export interface LiveSeriesStateLike {
  returns: Record<string, Record<number, number>> | null;
  scoringReturns?: Record<string, Record<number, number>> | null;
  levels?: Record<string, Record<number, number>> | null;
  scoringLevels?: Record<string, Record<number, number>> | null;
  dayN: number | null;
  tradingDayN?: number | null;
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
