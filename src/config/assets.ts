// From notebook §1.4 — CUSTOM_GROUPS for group/class selectors

export const CUSTOM_GROUPS: Record<string, string[]> = {
  'Equities': ['S&P 500','MSCI World ex-US','MSCI EM','Energy Equities'],
  'Sector ETFs': ['Comm Services','Materials','Financials','Industrials','Technology','Cons Staples','Real Estate','Utilities','Healthcare','Cons Discret','Gold Miners','Oil Services','Regional Banks','Homebuilders','Innovation (ARKK)'],
  'World Indices': ['Nikkei 225','KOSPI','Hang Seng','Shanghai Comp','Taiwan Weighted','ASX 200','Nifty 50','FTSE 100','DAX','CAC 40','Euro Stoxx 50','STI','Sensex','Jakarta Comp'],
  'Country ETFs': ['ETF Japan','ETF Brazil','ETF Korea','ETF Taiwan','ETF China','ETF Germany','ETF UK','ETF Australia','ETF India','ETF Mexico','ETF South Africa','ETF Turkey'],
  'Oil & Energy': ['WTI Crude (spot)','Brent Futures','Natural Gas Fut','Oil Vol (OVX)','Gasoline (UGA)','Energy Equities','Oil Services'],
  'Precious Metals': ['Gold','Silver','Platinum','Palladium','Gold Vol (GVZ)'],
  'Commodities': ['Copper','Broad Commod','Broad Commod (PDBC)','Agriculture','Rice','Corn','Wheat','Soybeans','Lumber','Cocoa','Coffee','Cotton','Sugar'],
  'FX G10': ['DXY','USDCAD','USDNOK','AUDUSD','NZDUSD','USDJPY','EURUSD','GBPUSD','USDCHF','USDSEK'],
  'FX EM': ['USDMXN','USDBRL','USDCLP','USDCOP','USDZAR','USDTRY','USDPLN','USDHUF','USDCZK','USDILS','USDCNH','USDTWD','USDINR','USDIDR','USDKRW','USDMYR','USDTHB','USDPHP'],
  'DM Rates': ['US 2Y Yield','US 5Y Yield','US 10Y Yield','US 30Y Yield','US 10Y Breakeven','US 5Y Breakeven','US 10Y Real Yield'],
  'Credit': ['US IG OAS','US BBB OAS','US HY OAS','HY Bond ETF (HYG)','IG Bond ETF (LQD)','EM Sov Debt (EMB)'],
  'Volatility': ['VIX','VXN (Nasdaq Vol)','Oil Vol (OVX)','Gold Vol (GVZ)'],
  'Risk Barometer': ['S&P 500','VIX','US HY OAS','WTI Crude (spot)','DXY'],
  'Safe Havens': ['Gold','Silver','USDJPY','USDCHF','US 10Y Yield','US 10Y Real Yield'],
  'Middle East Risk': ['WTI Crude (spot)','Brent Futures','Gold','Oil Vol (OVX)','USDILS','Energy Equities','Oil Services'],
  'Crypto': ['Bitcoin','Ethereum'],
  'Bond ETFs': ['20Y Treasury (TLT)','7-10Y Treasury (IEF)','1-3Y Treasury (SHY)','TIPS ETF (TIP)','Gold ETF (IAU)'],
  'Thematic ETFs': ['Airlines (JETS)','Agri (MOO)','Defense (ITA)','Cyber Security (BUG)','Clean Energy (ICLN)','Nuclear (NLR)'],
};
