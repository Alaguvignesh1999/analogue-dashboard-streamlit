export interface DataProvenance {
  historicalSource: 'generated' | 'sample';
  historicalAsOf: string | null;
  historicalLoadedAt: string | null;
  liveSource: 'none' | 'live' | 'demo';
  liveAsOf: string | null;
  warnings: string[];
  schemaVersion: number | null;
}

export interface DailyHistoryPayload {
  dates: string[];
  prices: Record<string, Array<number | null>>;
  availability?: Record<string, { startDate: string | null; endDate: string | null }>;
  asOf?: string | null;
  schemaVersion?: number | null;
}
