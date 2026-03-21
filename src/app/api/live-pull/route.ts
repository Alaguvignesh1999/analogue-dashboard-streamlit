import { NextRequest, NextResponse } from 'next/server';

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

function computeSeries(
  dates: string[],
  prices: number[],
  requestedDay0: string,
  isRatesBp: boolean,
  invert: boolean,
) {
  let day0Index = -1;
  for (let index = 0; index < dates.length; index += 1) {
    if (dates[index] >= requestedDay0 && !Number.isNaN(prices[index])) {
      day0Index = index;
      break;
    }
  }

  if (day0Index < 0) {
    return {
      returns: {} as Record<number, number>,
      levels: {} as Record<number, number>,
      businessDates: [] as string[],
      day0Price: null as number | null,
      actualDay0: null as string | null,
      asOfDate: null as string | null,
    };
  }

  const day0Price = prices[day0Index];
  const returns: Record<number, number> = {};
  const levels: Record<number, number> = {};
  const businessDates: string[] = [];

  let offset = 0;
  for (let index = day0Index; index < dates.length; index += 1) {
    const price = prices[index];
    if (Number.isNaN(price)) continue;

    businessDates.push(dates[index]);
    levels[offset] = price;

    if (isRatesBp) {
      returns[offset] = (price - day0Price) * 100;
    } else if (invert) {
      returns[offset] = -((price / day0Price - 1) * 100);
    } else {
      returns[offset] = (price / day0Price - 1) * 100;
    }

    offset += 1;
  }

  return {
    returns,
    levels,
    businessDates,
    day0Price,
    actualDay0: businessDates[0] || dates[day0Index] || null,
    asOfDate: businessDates.length > 0 ? businessDates[businessDates.length - 1] : null,
  };
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  if (!date || date.length !== 10) {
    return NextResponse.json({ error: 'Missing or invalid date parameter (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const requestedDay0 = new Date(date);
    const startDate = new Date(requestedDay0);
    startDate.setDate(startDate.getDate() - 10);

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1);

    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);

    const yahooEntries = Object.entries(ASSET_TICKERS);
    const fredEntries = Object.entries(FRED_ASSETS);

    const yahooResults = await Promise.allSettled(
      yahooEntries.map(([, config]) => fetchYahooChart(config.ticker, period1, period2))
    );
    const fredResults = await Promise.allSettled(
      fredEntries.map(([, config]) => fetchFredSeries(config.series, startDate.toISOString().split('T')[0]))
    );

    const returns: Record<string, Record<number, number>> = {};
    const levels: Record<string, Record<number, number>> = {};

    let triggerPrice: number | null = null;
    let maxDayN = 0;
    let globalBusinessDates: string[] = [];
    let actualDay0: string | null = null;
    let asOfDate: string | null = null;

    for (let index = 0; index < yahooEntries.length; index += 1) {
      const [label, config] = yahooEntries[index];
      const result = yahooResults[index];
      if (result.status !== 'fulfilled' || !result.value) continue;

      const series = computeSeries(result.value.dates, result.value.closes, date, false, config.invert || false);
      if (Object.keys(series.returns).length === 0) continue;

      returns[label] = series.returns;
      levels[label] = series.levels;
      maxDayN = Math.max(maxDayN, Math.max(...Object.keys(series.returns).map(Number)));

      if (label === 'Brent Futures' && series.day0Price !== null) {
        triggerPrice = series.day0Price;
        globalBusinessDates = series.businessDates;
        actualDay0 = series.actualDay0;
        asOfDate = series.asOfDate;
      } else if (series.businessDates.length > globalBusinessDates.length) {
        globalBusinessDates = series.businessDates;
        actualDay0 = actualDay0 || series.actualDay0;
        asOfDate = series.asOfDate || asOfDate;
      }
    }

    for (let index = 0; index < fredEntries.length; index += 1) {
      const [label, config] = fredEntries[index];
      const result = fredResults[index];
      if (result.status !== 'fulfilled' || !result.value) continue;

      const series = computeSeries(result.value.dates, result.value.values, date, config.isRatesBp, false);
      if (Object.keys(series.returns).length === 0) continue;

      returns[label] = series.returns;
      levels[label] = series.levels;
      maxDayN = Math.max(maxDayN, Math.max(...Object.keys(series.returns).map(Number)));
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
      dayN: maxDayN,
      actualDay0: actualDay0 || date,
      triggerDate: actualDay0 || date,
      asOfDate,
      businessDates: globalBusinessDates,
      triggerPrice,
      triggerZScore,
      assetCount: Object.keys(returns).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: `Live pull failed: ${error.message}` }, { status: 500 });
  }
}
