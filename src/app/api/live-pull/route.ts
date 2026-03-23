import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { PRE_WINDOW_TD } from '@/config/engine';
import { buildLivePayloadFromDailyHistory } from '@/engine/liveBuilder';
import { LiveRequestMode } from '@/engine/types';
import { loadDailyHistoryFromDisk, loadMetaAssetMap, loadSharedLiveSnapshot } from '@/lib/serverArtifacts';

const ASSET_TICKERS: Record<string, { ticker: string; source: 'yf' | 'fred'; invert?: boolean }> = {
  'S&P 500': { ticker: '^GSPC', source: 'yf' },
  'MSCI World ex-US': { ticker: 'ACWX', source: 'yf' },
  'MSCI EM': { ticker: 'EEM', source: 'yf' },
  'Energy Equities': { ticker: 'XLE', source: 'yf' },
  'Nikkei 225': { ticker: '^N225', source: 'yf' },
  'FTSE 100': { ticker: '^FTSE', source: 'yf' },
  'DAX': { ticker: '^GDAXI', source: 'yf' },
  'WTI Crude (spot)': { ticker: 'CL=F', source: 'yf' },
  'Brent Futures': { ticker: 'BZ=F', source: 'yf' },
  'Natural Gas Fut': { ticker: 'NG=F', source: 'yf' },
  'Gold': { ticker: 'GC=F', source: 'yf' },
  'Silver': { ticker: 'SI=F', source: 'yf' },
  'Copper': { ticker: 'HG=F', source: 'yf' },
  'VIX': { ticker: '^VIX', source: 'yf' },
  'Oil Vol (OVX)': { ticker: '^OVX', source: 'yf' },
  'DXY': { ticker: 'DX-Y.NYB', source: 'yf' },
  'Bitcoin': { ticker: 'BTC-USD', source: 'yf' },
  'Ethereum': { ticker: 'ETH-USD', source: 'yf' },
  'USDJPY': { ticker: 'JPY=X', source: 'yf', invert: true },
  'EURUSD': { ticker: 'EURUSD=X', source: 'yf' },
  'GBPUSD': { ticker: 'GBPUSD=X', source: 'yf' },
  'USDCHF': { ticker: 'CHF=X', source: 'yf', invert: true },
  'USDCAD': { ticker: 'CAD=X', source: 'yf', invert: true },
  'USDNOK': { ticker: 'NOK=X', source: 'yf', invert: true },
  'AUDUSD': { ticker: 'AUDUSD=X', source: 'yf' },
  'Defense (ITA)': { ticker: 'ITA', source: 'yf' },
  'Airlines (JETS)': { ticker: 'JETS', source: 'yf' },
  'Oil Services': { ticker: 'OIH', source: 'yf' },
  'Gold Miners': { ticker: 'GDX', source: 'yf' },
  'Technology': { ticker: 'XLK', source: 'yf' },
  'Financials': { ticker: 'XLF', source: 'yf' },
  'Healthcare': { ticker: 'XLV', source: 'yf' },
  'Industrials': { ticker: 'XLI', source: 'yf' },
  '20Y Treasury (TLT)': { ticker: 'TLT', source: 'yf' },
  'HY Bond ETF (HYG)': { ticker: 'HYG', source: 'yf' },
  'IG Bond ETF (LQD)': { ticker: 'LQD', source: 'yf' },
  'EM Sov Debt (EMB)': { ticker: 'EMB', source: 'yf' },
  'Shipping (BDRY)': { ticker: 'BDRY', source: 'yf' },
  'Broad Commod': { ticker: 'DJP', source: 'yf' },
  'Clean Energy (ICLN)': { ticker: 'ICLN', source: 'yf' },
};

const FRED_ASSETS: Record<string, { series: string; isRatesBp: boolean }> = {
  'US 2Y Yield': { series: 'DGS2', isRatesBp: true },
  'US 5Y Yield': { series: 'DGS5', isRatesBp: true },
  'US 10Y Yield': { series: 'DGS10', isRatesBp: true },
  'US 30Y Yield': { series: 'DGS30', isRatesBp: true },
  'US HY OAS': { series: 'BAMLH0A0HYM2', isRatesBp: true },
  'US IG OAS': { series: 'BAMLC0A4CBBB', isRatesBp: true },
};

interface MetaAssetConfig {
  ticker: string;
  source: 'yf' | 'fred';
  invert?: boolean;
  is_rates_bp?: boolean;
}

interface ObservedSeries {
  rawReturns: Record<number, number>;
  rawLevels: Record<number, number>;
  scoringReturns: Record<number, number>;
  scoringLevels: Record<number, number>;
  observedDates: string[];
  tradingDates: string[];
  baselinePrice: number;
  day0Price: number;
  actualDay0: string | null;
  asOfDate: string | null;
}

async function loadAssetUniverse(): Promise<{
  yahooEntries: Array<[string, { ticker: string; source: 'yf' | 'fred'; invert?: boolean }]>;
  fredEntries: Array<[string, { series: string; isRatesBp: boolean }]>;
}> {
  try {
    const metaPath = path.join(process.cwd(), 'public', 'data', 'meta.json');
    const raw = await readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw) as { asset_meta?: Record<string, MetaAssetConfig> };
    const assetMeta = parsed.asset_meta || {};

    const yahooEntries: Array<[string, { ticker: string; source: 'yf' | 'fred'; invert?: boolean }]> = [];
    const fredEntries: Array<[string, { series: string; isRatesBp: boolean }]> = [];

    for (const [label, config] of Object.entries(assetMeta)) {
      if (config.source === 'fred') {
        fredEntries.push([label, { series: config.ticker, isRatesBp: !!config.is_rates_bp }]);
      } else {
        yahooEntries.push([label, { ticker: config.ticker, source: 'yf', invert: !!config.invert }]);
      }
    }

    return {
      yahooEntries: yahooEntries.length > 0 ? yahooEntries : Object.entries(ASSET_TICKERS),
      fredEntries: fredEntries.length > 0 ? fredEntries : Object.entries(FRED_ASSETS),
    };
  } catch {
    return {
      yahooEntries: Object.entries(ASSET_TICKERS),
      fredEntries: Object.entries(FRED_ASSETS),
    };
  }
}

async function fetchYahooChart(ticker: string, period1: number, period2: number): Promise<{ dates: string[]; closes: number[] } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
      },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp || [];
    const closes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
    return {
      dates: timestamps.map((timestamp) => new Date(timestamp * 1000).toISOString().split('T')[0]),
      closes: closes.map((value) => value ?? Number.NaN),
    };
  } catch {
    return null;
  }
}

async function fetchFredSeries(seriesId: string, startDate: string): Promise<{ dates: string[]; values: number[] } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const observations = payload?.observations || [];

    const dates: string[] = [];
    const values: number[] = [];
    for (const observation of observations) {
      if (observation.value === '.') continue;
      dates.push(observation.date);
      values.push(parseFloat(observation.value));
    }
    return { dates, values };
  } catch {
    return null;
  }
}

function toUtcDate(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function dayDiff(startDate: string, endDate: string): number {
  return Math.floor((toUtcDate(endDate) - toUtcDate(startDate)) / 86400000);
}

function computeSeries(
  dates: string[],
  prices: number[],
  requestedDay0: string,
  isRatesBp: boolean,
  invert: boolean,
): ObservedSeries | null {
  let day0Index = -1;
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (dates[index] <= requestedDay0 && !Number.isNaN(prices[index])) {
      day0Index = index;
      break;
    }
  }

  if (day0Index < 0) {
    return null;
  }

  const day0Price = prices[day0Index];
  const actualDay0 = dates[day0Index];
  const baselinePrice = day0Index > 0 && !Number.isNaN(prices[day0Index - 1])
    ? prices[day0Index - 1]
    : day0Price;
  const rawReturns: Record<number, number> = {};
  const rawLevels: Record<number, number> = {};
  const scoringReturns: Record<number, number> = {};
  const scoringLevels: Record<number, number> = {};
  const observedDates: string[] = [];
  const tradingDates: string[] = [];
  const windowStart = Math.max(0, day0Index - PRE_WINDOW_TD - 5);

  for (let index = windowStart; index < dates.length; index += 1) {
    const price = prices[index];
    if (Number.isNaN(price)) continue;
    const offset = dayDiff(actualDay0, dates[index]);
    rawLevels[offset] = price;

    if (isRatesBp) {
      rawReturns[offset] = (price - baselinePrice) * 100;
    } else {
      const change = (price / baselinePrice - 1) * 100;
      rawReturns[offset] = invert ? change : -change;
    }

    if (index >= day0Index) {
      observedDates.push(dates[index]);
      tradingDates.push(dates[index]);
      scoringLevels[index - day0Index] = price;
      if (isRatesBp) {
        scoringReturns[index - day0Index] = (price - baselinePrice) * 100;
      } else {
        const change = (price / baselinePrice - 1) * 100;
        scoringReturns[index - day0Index] = invert ? change : -change;
      }
    }
  }

  return {
    rawReturns,
    rawLevels,
    scoringReturns,
    scoringLevels,
    observedDates,
    tradingDates,
    baselinePrice,
    day0Price,
    actualDay0: actualDay0 || null,
    asOfDate: observedDates.length > 0 ? observedDates[observedDates.length - 1] : null,
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

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  const requestedMode = request.nextUrl.searchParams.get('mode');
  const assetsParam = request.nextUrl.searchParams.get('assets');
  if (!date || date.length !== 10) {
    return NextResponse.json({ error: 'Missing or invalid date parameter (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const requestedLabels = assetsParam && assetsParam !== 'all'
      ? assetsParam.split(',').map((value) => value.trim()).filter(Boolean)
      : null;
    const sharedSnapshot = await loadSharedLiveSnapshot();
    const dailyHistory = await loadDailyHistoryFromDisk();
    const assetMeta = await loadMetaAssetMap();
    const mode: LiveRequestMode = requestedMode === 'private' ? 'private' : 'shared';

    if (sharedSnapshot && mode === 'shared' && date === sharedSnapshot.requestedDay0) {
      const filteredLabels = requestedLabels || Object.keys(sharedSnapshot.returns || {});
      const sharedReturns = Object.fromEntries(
        Object.entries(sharedSnapshot.returns || {}).filter(([label]) => filteredLabels.includes(label))
      );
      const hasNegativeWindow = Object.values(sharedReturns).some((series) =>
        Object.keys(series).some((offset) => Number(offset) < 0)
      );

      if (!hasNegativeWindow && dailyHistory && Object.keys(assetMeta).length > 0) {
        const rebuiltShared = buildLivePayloadFromDailyHistory(
          dailyHistory,
          assetMeta,
          date,
          'shared',
          {
            name: sharedSnapshot.name,
            labels: filteredLabels,
            source: 'generated-history',
            schemaVersion: sharedSnapshot.provenance?.schemaVersion ?? dailyHistory.schemaVersion ?? null,
            warnings: sharedSnapshot.warnings || [],
          },
        );

        return NextResponse.json({
          ...rebuiltShared,
          snapshotDate: sharedSnapshot.snapshotDate ?? rebuiltShared.snapshotDate,
          assetCount: filteredLabels.length,
          timestamp: rebuiltShared.provenance.builtAt,
        });
      }

      const filterMap = (source: Record<string, Record<number, number>>) =>
        Object.fromEntries(Object.entries(source).filter(([label]) => filteredLabels.includes(label)));
      const filteredStatus = Object.fromEntries(
        Object.entries(sharedSnapshot.assetStatus || {}).filter(([label]) => filteredLabels.includes(label))
      );

      return NextResponse.json({
        ...sharedSnapshot,
        returns: filterMap(sharedSnapshot.returns || {}),
        levels: filterMap(sharedSnapshot.levels || {}),
        scoringReturns: filterMap(sharedSnapshot.scoringReturns || {}),
        scoringLevels: filterMap(sharedSnapshot.scoringLevels || {}),
        assetStatus: filteredStatus,
        assetCount: filteredLabels.length,
        timestamp: sharedSnapshot.provenance?.builtAt || new Date().toISOString(),
      });
    }

    if (dailyHistory && Object.keys(assetMeta).length > 0) {
      const privatePayload = buildLivePayloadFromDailyHistory(
        dailyHistory,
        assetMeta,
        date,
        'private',
        {
          name: 'Private Scenario',
          labels: requestedLabels || undefined,
          source: 'generated-history',
          schemaVersion: dailyHistory.schemaVersion ?? null,
          warnings: dailyHistory.asOf && date > dailyHistory.asOf
            ? [`Requested date ${date} is beyond cached live as-of ${dailyHistory.asOf}; using latest available trading day on or before request.`]
            : [],
        }
      );

      return NextResponse.json({
        ...privatePayload,
        assetCount: Object.keys(privatePayload.returns).length,
        timestamp: privatePayload.provenance.builtAt,
      });
    }

    const requestedDay0 = new Date(date);
    const startDate = new Date(requestedDay0);
    startDate.setDate(startDate.getDate() - (PRE_WINDOW_TD + 42));

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1);

    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);

    const { yahooEntries, fredEntries } = await loadAssetUniverse();

    const yahooResults = await Promise.allSettled(
      yahooEntries.map(([, config]) => fetchYahooChart(config.ticker, period1, period2))
    );
    const fredResults = await Promise.allSettled(
      fredEntries.map(([, config]) => fetchFredSeries(config.series, startDate.toISOString().split('T')[0]))
    );

    const observedByAsset: Record<string, ObservedSeries> = {};
    let triggerPrice: number | null = null;
    let canonicalDates: string[] = [];
    let actualDay0: string | null = null;
    let asOfDate: string | null = null;

    for (let index = 0; index < yahooEntries.length; index += 1) {
      const [label, config] = yahooEntries[index];
      const result = yahooResults[index];
      if (result.status !== 'fulfilled' || !result.value) continue;
      const yahooValue = result.value;

      const series = computeSeries(yahooValue.dates, yahooValue.closes, date, false, config.invert || false);
      if (!series || Object.keys(series.rawReturns).length === 0) continue;
      observedByAsset[label] = series;

      if (label === 'Brent Futures') {
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

    for (let index = 0; index < fredEntries.length; index += 1) {
      const [label, config] = fredEntries[index];
      const result = fredResults[index];
      if (result.status !== 'fulfilled' || !result.value) continue;
      const fredValue = result.value;

      const series = computeSeries(fredValue.dates, fredValue.values, date, config.isRatesBp, false);
      if (!series || Object.keys(series.rawReturns).length === 0) continue;
      observedByAsset[label] = series;
    }

    const canonicalActualDay0 = actualDay0 || date;
    const canonicalAsOf = asOfDate || canonicalDates[canonicalDates.length - 1] || null;
    const canonicalDayN = canonicalAsOf ? Math.max(0, dayDiff(canonicalActualDay0, canonicalAsOf)) : 0;
    const tradingDayN = Math.max(0, canonicalDates.length - 1);
    const returns: Record<string, Record<number, number>> = {};
    const levels: Record<string, Record<number, number>> = {};
    const scoringReturns: Record<string, Record<number, number>> = {};
    const scoringLevels: Record<string, Record<number, number>> = {};

    for (const [label, series] of Object.entries(observedByAsset)) {
      const filled = fillCalendarSeries(series.rawReturns, series.rawLevels, series.day0Price, canonicalDayN);
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

    return NextResponse.json({
      returns,
      levels,
      scoringReturns,
      scoringLevels,
      dayN: canonicalDayN,
      tradingDayN,
      actualDay0: canonicalActualDay0,
      triggerDate: canonicalActualDay0,
      asOfDate: canonicalAsOf,
      businessDates: canonicalDates,
      triggerPrice,
      triggerZScore,
      assetCount: Object.keys(returns).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: `Live pull failed: ${error.message}` }, { status: 500 });
  }
}
