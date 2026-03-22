export interface DataProvenance {
  historicalSource: 'generated' | 'sample';
  historicalAsOf: string | null;
  historicalLoadedAt: string | null;
  liveSource: 'none' | 'live' | 'demo';
  liveMode: 'none' | 'shared' | 'private' | 'demo';
  liveAsOf: string | null;
  liveSnapshotDate: string | null;
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

export type LiveRequestMode = 'shared' | 'private';

export interface LiveAssetStatus {
  status: 'ok' | 'missing';
  source: 'shared-snapshot' | 'generated-history' | 'runtime-fetch';
  asOfDate: string | null;
  warning?: string | null;
}

export interface SharedLiveSnapshot {
  name: string;
  snapshotDate: string;
  requestedDay0: string;
  actualDay0: string | null;
  triggerDate: string | null;
  asOfDate: string | null;
  dayN: number;
  tradingDayN: number;
  returns: Record<string, Record<number, number>>;
  levels: Record<string, Record<number, number>>;
  scoringReturns: Record<string, Record<number, number>>;
  scoringLevels: Record<string, Record<number, number>>;
  assetStatus: Record<string, LiveAssetStatus>;
  warnings: string[];
  provenance: {
    mode: LiveRequestMode;
    source: 'shared-snapshot' | 'generated-history' | 'runtime-fetch';
    builtAt: string;
    schemaVersion: number | null;
  };
  businessDates: string[];
  triggerPrice: number | null;
  triggerZScore: number | null;
  triggerPctile?: number | null;
  tagSet?: string[];
  cpi?: string;
  fed?: string;
}
