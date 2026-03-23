// From notebook §1.5 and §1.6

export const PRE_WINDOW_TD = 63;
export const POST_WINDOW_TD = 63;
export const FETCH_BUFFER = 90;

export interface POI {
  label: string;
  offset: number;
}

export const POIS: POI[] = [
  { label: 't-3M', offset: -63 },
  { label: 't-1M', offset: -21 },
  { label: 't-1W', offset:  -5 },
  { label: 't0',   offset:   0 },
  { label: 't+1W', offset:   5 },
  { label: 't+1M', offset:  21 },
  { label: 't+3M', offset:  63 },
];

export const TRIGGER_ASSET = 'Brent Futures';

export const ANALOGUE_WEIGHTS = {
  quant: 0.50,
  tag:   0.30,
  macro: 0.20,
};

export const SIMILARITY_ASSET_POOL = [
  'Brent Futures', 'VIX', 'Gold', 'DXY', 'S&P 500',
  'US 10Y Yield', 'US HY OAS',
  'EURUSD', 'USDJPY', 'Copper', 'Shipping (BDRY)',
];

export const DEFAULT_LIVE_SIM_ASSETS = [
  'Brent Futures',
  'VIX',
  'Gold',
  'DXY',
  'S&P 500',
];

export const DATA_SCHEMA_VERSION = 2;

export const TRIGGER_ZSCORE_SIGMA = 1.5;

export const KELLY_FRACTION = 0.5;
export const RISK_BUDGET_USD = 100_000;
export const VOL_SCALAR_DAYS = 21;

export const STEP_IN_PRIMARY = 7;

export const PORTFOLIO_SCENARIOS: Record<string, Record<string, number>> = {
  'Geopolitical Long': {
    'Brent Futures':       500_000,
    'WTI Crude (spot)':    300_000,
    'Gold':                400_000,
    '20Y Treasury (TLT)':  300_000,
    'Defense (ITA)':       200_000,
    'S&P 500':            -300_000,
    'MSCI EM':            -200_000,
    'Airlines (JETS)':    -150_000,
  },
  'Risk-Off Flight': {
    '20Y Treasury (TLT)':  600_000,
    'Gold':                400_000,
    'USDJPY':             -300_000,
    'USDCHF':             -200_000,
    'HY Bond ETF (HYG)':  -400_000,
    'EM Sov Debt (EMB)':  -300_000,
    'MSCI EM':            -300_000,
  },
  'Oil Shock Arb': {
    'Brent Futures':       600_000,
    'Natural Gas Fut':     200_000,
    'Oil Services':        300_000,
    'Energy Equities':     300_000,
    'USDNOK':             -200_000,
    'USDCAD':             -200_000,
    'Airlines (JETS)':    -400_000,
    'Technology':         -200_000,
  },
};

export const REGIME_FILTER = {
  cpi: null as string | null,
  fed: null as string | null,
  trigger_zscore_min: null as number | null,
  trigger_zscore_max: null as number | null,
};
