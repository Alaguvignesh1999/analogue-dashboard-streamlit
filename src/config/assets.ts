// Canonical notebook-derived groups for all group/class selectors.

import type { AssetMeta } from '@/engine/returns';

export const ALL_ASSETS_OPTION = '-- All Assets --';

export const CUSTOM_GROUPS: Record<string, string[]> = {
  Equities: ['S&P 500', 'MSCI World ex-US', 'MSCI EM', 'Energy Equities'],
  'Sector ETFs': [
    'Comm Services', 'Materials', 'Financials', 'Industrials', 'Technology',
    'Cons Staples', 'Real Estate', 'Utilities', 'Healthcare', 'Cons Discret',
    'Gold Miners', 'Oil Services', 'Regional Banks', 'Homebuilders', 'Innovation (ARKK)',
  ],
  'World Indices': [
    'Nikkei 225', 'KOSPI', 'Hang Seng', 'Shanghai Comp', 'Taiwan Weighted',
    'ASX 200', 'Nifty 50', 'FTSE 100', 'DAX', 'CAC 40', 'Euro Stoxx 50',
    'STI', 'Sensex', 'Jakarta Comp',
  ],
  'Country ETFs': [
    'ETF Japan', 'ETF Brazil', 'ETF Korea', 'ETF Taiwan', 'ETF China',
    'ETF Germany', 'ETF UK', 'ETF Australia', 'ETF India', 'ETF Mexico',
    'ETF South Africa', 'ETF Turkey',
  ],
  'Country ETFs Asia': ['ETF Japan', 'ETF Korea', 'ETF Taiwan', 'ETF China', 'ETF Australia', 'ETF India'],
  'Country ETFs EM': ['ETF Brazil', 'ETF Korea', 'ETF Taiwan', 'ETF China', 'ETF India', 'ETF Mexico', 'ETF South Africa', 'ETF Turkey'],
  'Oil & Energy': ['WTI Crude (spot)', 'Brent Futures', 'Natural Gas Fut', 'Oil Vol (OVX)', 'Gasoline (UGA)', 'Energy Equities', 'Oil Services'],
  'Precious Metals': ['Gold', 'Silver', 'Platinum', 'Palladium', 'Gold Vol (GVZ)'],
  Commodities: ['Copper', 'Broad Commod', 'Broad Commod (PDBC)', 'Agriculture', 'Rice', 'Corn', 'Wheat', 'Soybeans', 'Lumber', 'Cocoa', 'Coffee', 'Cotton', 'Sugar'],
  'Soft Commodities': ['Agriculture', 'Rice', 'Corn', 'Wheat', 'Soybeans', 'Cocoa', 'Coffee', 'Cotton', 'Sugar'],
  'FX All': [
    'DXY', 'USDCHF', 'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY',
    'USDCAD', 'USDNOK', 'USDSEK', 'USDMXN', 'USDBRL', 'USDCLP', 'USDCOP',
    'USDZAR', 'USDTRY', 'USDPLN', 'USDHUF', 'USDCZK', 'USDILS', 'USDCNH',
    'USDTWD', 'USDINR', 'USDIDR', 'USDKRW', 'USDMYR', 'USDTHB', 'USDPHP', 'USDSGD',
  ],
  'FX G10': ['DXY', 'USDCAD', 'USDNOK', 'AUDUSD', 'NZDUSD', 'USDJPY', 'EURUSD', 'GBPUSD', 'USDCHF', 'USDSEK'],
  'FX EM': ['USDMXN', 'USDBRL', 'USDCLP', 'USDCOP', 'USDZAR', 'USDTRY', 'USDPLN', 'USDHUF', 'USDCZK', 'USDILS', 'USDCNH', 'USDTWD', 'USDINR', 'USDIDR', 'USDKRW', 'USDMYR', 'USDTHB', 'USDPHP'],
  'FX EM Asia': ['USDCNH', 'USDTWD', 'USDINR', 'USDIDR', 'USDKRW', 'USDMYR', 'USDTHB', 'USDPHP', 'USDSGD'],
  'FX ASEAN': ['USDSGD', 'USDMYR', 'USDTHB', 'USDPHP', 'USDIDR'],
  'FX EM EMEA': ['USDZAR', 'USDTRY', 'USDPLN', 'USDHUF', 'USDCZK', 'USDILS'],
  'FX EM LATAM': ['USDMXN', 'USDBRL', 'USDCLP', 'USDCOP'],
  'FX EM High Carry': ['USDMXN', 'USDBRL', 'USDCLP', 'USDCOP', 'USDZAR', 'USDTRY'],
  'FX EM Low Carry': ['USDCNH', 'USDTWD', 'USDKRW', 'USDINR', 'USDMYR', 'USDTHB', 'USDPHP', 'USDSGD'],
  'FX Oil Exporters': ['USDCAD', 'USDNOK', 'AUDUSD', 'NZDUSD', 'USDMXN', 'USDBRL', 'USDCOP'],
  'FX Oil Importers': ['USDJPY', 'EURUSD', 'GBPUSD', 'USDCHF', 'USDZAR', 'USDTRY', 'USDPLN', 'USDCNH', 'USDTWD', 'USDINR', 'USDIDR', 'USDKRW', 'USDMYR', 'USDTHB', 'USDPHP'],
  'Dollar Bloc': ['USDCAD', 'AUDUSD', 'NZDUSD'],
  'Commodity FX': ['USDCAD', 'USDNOK', 'AUDUSD', 'USDMXN', 'USDBRL', 'USDCOP', 'USDCLP', 'USDZAR'],
  'DM Rates': ['US 3M Yield', 'US 2Y Yield', 'US 5Y Yield', 'US 10Y Yield', 'US 30Y Yield', 'US 10Y Breakeven', 'US 5Y Breakeven', 'US 10Y Real Yield'],
  'Yield Curve': ['US 2Y Yield', 'US 10Y Yield', 'US 30Y Yield'],
  Breakevens: ['US 5Y Breakeven', 'US 10Y Breakeven', 'US 10Y Real Yield'],
  'Rates Futures': ['2Y UST Fut', '5Y UST Fut', '10Y UST Fut', '30Y UST Fut'],
  Credit: ['US IG OAS', 'US BBB OAS', 'US HY OAS', 'HY Bond ETF (HYG)', 'IG Bond ETF (LQD)', 'EM Sov Debt (EMB)'],
  Volatility: ['VIX', 'VXN (Nasdaq Vol)', 'Oil Vol (OVX)', 'Gold Vol (GVZ)'],
  Crypto: ['Bitcoin', 'Ethereum'],
  Shipping: ['Shipping (BDRY)'],
  'Bond ETFs': ['20Y Treasury (TLT)', '7-10Y Treasury (IEF)', '1-3Y Treasury (SHY)', 'TIPS ETF (TIP)', 'Gold ETF (IAU)'],
  'Yield Curve ETFs': ['1-3Y Treasury (SHY)', '7-10Y Treasury (IEF)', '20Y Treasury (TLT)'],
  'Thematic ETFs': ['Airlines (JETS)', 'Agri (MOO)', 'Defense (ITA)', 'Cyber Security (BUG)', 'Clean Energy (ICLN)', 'Nuclear (NLR)'],
  'Defense & Security': ['Defense (ITA)', 'Cyber Security (BUG)', 'Nuclear (NLR)'],
  'Oil Sensitive': ['Airlines (JETS)', 'Agri (MOO)', 'WTI Crude (spot)', 'Brent Futures', 'Oil Services', 'Energy Equities'],
  'Risk Barometer': ['S&P 500', 'VIX', 'US HY OAS', 'WTI Crude (spot)', 'DXY'],
  'Safe Havens': ['Gold', 'Silver', 'USDJPY', 'USDCHF', 'US 10Y Yield', 'US 10Y Real Yield'],
  'Risk-On Basket': ['S&P 500', 'MSCI EM', 'Copper', 'WTI Crude (spot)', 'US HY OAS', 'Bitcoin'],
  'Inflation Hedge': ['Gold', 'WTI Crude (spot)', 'Copper', 'US 10Y Breakeven', 'US 5Y Breakeven', 'Agriculture'],
  'EM Stress': ['MSCI EM', 'EM Sov Debt (EMB)', 'USDCNH', 'USDKRW', 'USDINR', 'US HY OAS', 'Copper'],
  'Middle East Risk': ['WTI Crude (spot)', 'Brent Futures', 'Gold', 'Oil Vol (OVX)', 'USDILS', 'Energy Equities', 'Oil Services'],
};

export function getGroupLabels(
  group: string,
  allLabels: string[],
  assetMeta: Record<string, AssetMeta>,
): string[] {
  if (group === ALL_ASSETS_OPTION) return [...allLabels];
  if (CUSTOM_GROUPS[group]) {
    return CUSTOM_GROUPS[group].filter((label) => allLabels.includes(label));
  }
  return allLabels.filter((label) => assetMeta[label]?.class === group);
}

export function groupOptionsFromData(allClasses: string[]): Array<{ value: string; label: string }> {
  const groups = Object.keys(CUSTOM_GROUPS).sort().map((group) => ({ value: group, label: group }));
  const classes = allClasses
    .filter((group) => !CUSTOM_GROUPS[group])
    .sort()
    .map((group) => ({ value: group, label: group }));
  return [{ value: ALL_ASSETS_OPTION, label: ALL_ASSETS_OPTION }, ...groups, ...classes];
}
