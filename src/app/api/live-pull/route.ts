import { NextRequest, NextResponse } from 'next/server';

// Live data pull API — fetches prices from Day 0 to today for all assets
// Uses Yahoo Finance chart API directly (no npm dependency needed)
// Returns offset-indexed returns matching the historical event_returns format

// Asset universe matching notebook §1.4 (label → ticker)
const ASSET_TICKERS: Record<string, { ticker: string; source: 'yf' | 'fred'; invert?: boolean; is_rates_bp?: boolean }> = {
  'S&P 500':            { ticker: '^GSPC', source: 'yf' },
  'MSCI World ex-US':   { ticker: 'ACWX', source: 'yf' },
  'MSCI EM':            { ticker: 'EEM', source: 'yf' },
  'Energy Equities':    { ticker: 'XLE', source: 'yf' },
  'Nikkei 225':         { ticker: '^N225', source: 'yf' },
  'FTSE 100':           { ticker: '^FTSE', source: 'yf' },
  'DAX':                { ticker: '^GDAXI', source: 'yf' },
  'WTI Crude (spot)':   { ticker: 'CL=F', source: 'yf' },
  'Brent Futures':      { ticker: 'BZ=F', source: 'yf' },
  'Natural Gas Fut':    { ticker: 'NG=F', source: 'yf' },
  'Gold':               { ticker: 'GC=F', source: 'yf' },
  'Silver':             { ticker: 'SI=F', source: 'yf' },
  'Copper':             { ticker: 'HG=F', source: 'yf' },
  'VIX':                { ticker: '^VIX', source: 'yf' },
  'Oil Vol (OVX)':      { ticker: '^OVX', source: 'yf' },
  'DXY':                { ticker: 'DX-Y.NYB', source: 'yf' },
  'Bitcoin':            { ticker: 'BTC-USD', source: 'yf' },
  'Ethereum':           { ticker: 'ETH-USD', source: 'yf' },
  'USDJPY':             { ticker: 'JPY=X', source: 'yf', invert: true },
  'EURUSD':             { ticker: 'EURUSD=X', source: 'yf' },
  'GBPUSD':             { ticker: 'GBPUSD=X', source: 'yf' },
  'USDCHF':             { ticker: 'CHF=X', source: 'yf', invert: true },
  'USDCAD':             { ticker: 'CAD=X', source: 'yf', invert: true },
  'USDNOK':             { ticker: 'NOK=X', source: 'yf', invert: true },
  'AUDUSD':             { ticker: 'AUDUSD=X', source: 'yf' },
  'Defense (ITA)':      { ticker: 'ITA', source: 'yf' },
  'Airlines (JETS)':    { ticker: 'JETS', source: 'yf' },
  'Oil Services':       { ticker: 'OIH', source: 'yf' },
  'Gold Miners':        { ticker: 'GDX', source: 'yf' },
  'Technology':         { ticker: 'XLK', source: 'yf' },
  'Financials':         { ticker: 'XLF', source: 'yf' },
  'Healthcare':         { ticker: 'XLV', source: 'yf' },
  'Industrials':        { ticker: 'XLI', source: 'yf' },
  '20Y Treasury (TLT)': { ticker: 'TLT', source: 'yf' },
  'HY Bond ETF (HYG)':  { ticker: 'HYG', source: 'yf' },
  'IG Bond ETF (LQD)':  { ticker: 'LQD', source: 'yf' },
  'EM Sov Debt (EMB)':  { ticker: 'EMB', source: 'yf' },
  'Shipping (BDRY)':    { ticker: 'BDRY', source: 'yf' },
  'Broad Commod':       { ticker: 'DJP', source: 'yf' },
  'Clean Energy (ICLN)': { ticker: 'ICLN', source: 'yf' },
};

// FRED series (rates/credit) — fetched separately
const FRED_ASSETS: Record<string, { series: string; is_rates_bp: boolean }> = {
  'US 2Y Yield':       { series: 'DGS2', is_rates_bp: true },
  'US 5Y Yield':       { series: 'DGS5', is_rates_bp: true },
  'US 10Y Yield':      { series: 'DGS10', is_rates_bp: true },
  'US 30Y Yield':      { series: 'DGS30', is_rates_bp: true },
  'US HY OAS':         { series: 'BAMLH0A0HYM2', is_rates_bp: true },
  'US IG OAS':         { series: 'BAMLC0A4CBBB', is_rates_bp: true },
};

async function fetchYahooChart(ticker: string, period1: number, period2: number): Promise<{ dates: string[]; closes: number[] } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps: number[] = result.timestamp || [];
    const closes: number[] = result.indicators?.quote?.[0]?.close || [];
    const dates = timestamps.map((t: number) => new Date(t * 1000).toISOString().split('T')[0]);
    return { dates, closes: closes.map((c: number) => c ?? NaN) };
  } catch {
    return null;
  }
}

async function fetchFredSeries(seriesId: string, startDate: string): Promise<{ dates: string[]; values: number[] } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const obs = data?.observations || [];
    const dates: string[] = [];
    const values: number[] = [];
    for (const o of obs) {
      if (o.value !== '.') {
        dates.push(o.date);
        values.push(parseFloat(o.value));
      }
    }
    return { dates, values };
  } catch {
    return null;
  }
}

function computeReturns(
  dates: string[],
  prices: number[],
  day0Date: string,
  isRatesBp: boolean,
  invert: boolean,
): { returns: Record<number, number>; day0Price: number | null } {
  // Find Day 0 index (on or after day0Date)
  let d0Idx = -1;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] >= day0Date && !isNaN(prices[i])) {
      d0Idx = i;
      break;
    }
  }
  if (d0Idx < 0) return { returns: {}, day0Price: null };

  const day0Price = prices[d0Idx];
  const returns: Record<number, number> = {};

  // Build trading day offsets from Day 0
  let offset = 0;
  for (let i = d0Idx; i < dates.length; i++) {
    if (isNaN(prices[i])) continue;
    if (isRatesBp) {
      // Rates: change in bps
      returns[offset] = (prices[i] - day0Price) * 100;
    } else if (invert) {
      // FX inversion: -1 * pct change
      returns[offset] = -((prices[i] / day0Price - 1) * 100);
    } else {
      // Standard: pct change
      returns[offset] = (prices[i] / day0Price - 1) * 100;
    }
    offset++;
  }

  return { returns, day0Price };
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || date.length !== 10) {
    return NextResponse.json({ error: 'Missing or invalid date parameter (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const day0 = new Date(date);
    const now = new Date();
    // Add buffer: start 10 days before Day 0 for pre-event data
    const startDate = new Date(day0);
    startDate.setDate(startDate.getDate() - 10);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 1);

    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);

    // Fetch all Yahoo assets in parallel (batched to avoid rate limits)
    const yfEntries = Object.entries(ASSET_TICKERS);
    const yfResults = await Promise.allSettled(
      yfEntries.map(([, cfg]) => fetchYahooChart(cfg.ticker, period1, period2))
    );

    // Fetch FRED assets in parallel
    const fredEntries = Object.entries(FRED_ASSETS);
    const fredResults = await Promise.allSettled(
      fredEntries.map(([, cfg]) => fetchFredSeries(cfg.series, startDate.toISOString().split('T')[0]))
    );

    const allReturns: Record<string, Record<number, number>> = {};
    let triggerPrice: number | null = null;
    let maxDayN = 0;

    // Process Yahoo results
    for (let i = 0; i < yfEntries.length; i++) {
      const [label, cfg] = yfEntries[i];
      const result = yfResults[i];
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { dates, closes } = result.value;

      const { returns, day0Price } = computeReturns(
        dates, closes, date,
        false,
        cfg.invert || false,
      );

      if (Object.keys(returns).length > 0) {
        allReturns[label] = returns;
        const dn = Math.max(...Object.keys(returns).map(Number));
        if (dn > maxDayN) maxDayN = dn;
      }

      // Capture trigger asset Day 0 price
      if (label === 'Brent Futures' && day0Price !== null) {
        triggerPrice = day0Price;
      }
    }

    // Process FRED results
    for (let i = 0; i < fredEntries.length; i++) {
      const [label, cfg] = fredEntries[i];
      const result = fredResults[i];
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { dates, values } = result.value;

      const { returns } = computeReturns(dates, values, date, cfg.is_rates_bp, false);
      if (Object.keys(returns).length > 0) {
        allReturns[label] = returns;
      }
    }

    // Compute trigger z-score (simple percentile against historical triggers)
    let triggerZScore: number | null = null;
    if (triggerPrice !== null) {
      // Approximate z-score based on historical Brent Day-0 levels from events config
      const histTriggers = [4, 17, 25, 11, 22, 35, 37, 85, 104, 53, 54, 91, 73];
      const mean = histTriggers.reduce((a, b) => a + b, 0) / histTriggers.length;
      const std = Math.sqrt(histTriggers.reduce((s, v) => s + (v - mean) ** 2, 0) / histTriggers.length);
      triggerZScore = std > 0 ? (triggerPrice - mean) / std : 0;
    }

    return NextResponse.json({
      returns: allReturns,
      dayN: maxDayN,
      actualDay0: date,
      triggerPrice,
      triggerZScore,
      assetCount: Object.keys(allReturns).length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Live pull failed: ${err.message}` },
      { status: 500 }
    );
  }
}
