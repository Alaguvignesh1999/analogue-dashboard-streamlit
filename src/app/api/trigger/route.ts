import { NextRequest, NextResponse } from 'next/server';
import { getTriggerPriceForDate } from '@/engine/customEvents';
import { loadDailyHistoryFromDisk } from '@/lib/serverArtifacts';

// Fetches Brent Futures price via Yahoo Finance API
// If ?date= provided: returns close on/near that date (Day 0 price)
// If no date: returns latest close
// Multiple fallback strategies for Vercel serverless

const TRIGGER_TICKER = 'BZ=F'; // Brent Futures

async function fetchYahoo(url: string): Promise<Response> {
  // Try with multiple User-Agent strings — Yahoo blocks generic server-side requests
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  ];

  let lastError: Error | null = null;
  for (const ua of agents) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
          'Origin': 'https://finance.yahoo.com',
        },
        next: { revalidate: 300 },
      });
      if (res.ok) return res;
      lastError = new Error(`Yahoo returned ${res.status}`);
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError || new Error('All Yahoo fetch attempts failed');
}

function extractPrice(result: any, dateParam?: string): { price: number; date: string } | null {
  const closes = result?.indicators?.quote?.[0]?.close;
  const timestamps = result?.timestamp;
  if (!closes || closes.length === 0) return null;

  if (dateParam && dateParam.length === 10) {
    const targetTs = new Date(dateParam).getTime() / 1000;
    // Preferred: latest available close on or before target date.
    for (let i = closes.length - 1; i >= 0; i--) {
      if (timestamps[i] <= targetTs && closes[i] != null) {
        return {
          price: Math.round(closes[i] * 100) / 100,
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        };
      }
    }

    // Fallback only if there is genuinely no earlier observation in range.
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        return {
          price: Math.round(closes[i] * 100) / 100,
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        };
      }
    }
  } else {
    // Latest close
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) {
        return {
          price: Math.round(closes[i] * 100) / 100,
          date: timestamps?.[i]
            ? new Date(timestamps[i] * 1000).toISOString().split('T')[0]
            : '',
        };
      }
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date');

  try {
    const dailyHistory = await loadDailyHistoryFromDisk();
    if (dailyHistory) {
      const cached = dateParam
        ? getTriggerPriceForDate(dailyHistory, dateParam)
        : getTriggerPriceForDate(dailyHistory, dailyHistory.asOf || dailyHistory.dates[dailyHistory.dates.length - 1] || '');

      if (cached) {
        return NextResponse.json({
          ticker: TRIGGER_TICKER,
          price: cached.value,
          date: cached.date,
          source: 'generated-history-cache',
          asOf: dailyHistory.asOf || null,
        });
      }
    }

    let url: string;
    if (dateParam && dateParam.length === 10) {
      const targetDate = new Date(dateParam);
      const startDate = new Date(targetDate);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(targetDate);
      endDate.setDate(endDate.getDate() + 7);
      const period1 = Math.floor(startDate.getTime() / 1000);
      const period2 = Math.floor(endDate.getTime() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${TRIGGER_TICKER}?period1=${period1}&period2=${period2}&interval=1d`;
    } else {
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${TRIGGER_TICKER}?range=5d&interval=1d`;
    }

    // Primary: query1
    let data: any;
    try {
      const res = await fetchYahoo(url);
      data = await res.json();
    } catch {
      // Fallback: query2
      const fallbackUrl = url.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com');
      const res = await fetchYahoo(fallbackUrl);
      data = await res.json();
    }

    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No data returned from Yahoo Finance');

    const extracted = extractPrice(result, dateParam || undefined);
    if (!extracted) throw new Error('All close prices are null');

    return NextResponse.json({
      ticker: TRIGGER_TICKER,
      price: extracted.price,
      date: extracted.date,
      source: 'yahoo-finance',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, ticker: TRIGGER_TICKER },
      { status: 500 }
    );
  }
}
