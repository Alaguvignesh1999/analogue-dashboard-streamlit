export interface AvailabilityWindow {
  startDate: string | null;
  endDate: string | null;
}

export const FALLBACK_AVAILABILITY: Record<string, AvailabilityWindow> = {
  'Bitcoin': { startDate: '2010-07-17', endDate: null },
  'Ethereum': { startDate: '2015-08-07', endDate: null },
  'Shipping (BDRY)': { startDate: '2018-03-21', endDate: null },
  'Innovation (ARKK)': { startDate: '2014-10-31', endDate: null },
  'Cyber Security (BUG)': { startDate: '2019-10-25', endDate: null },
  'Clean Energy (ICLN)': { startDate: '2008-06-24', endDate: null },
  'Nuclear (NLR)': { startDate: '2007-10-10', endDate: null },
  'Airlines (JETS)': { startDate: '2015-04-30', endDate: null },
  'Defense (ITA)': { startDate: '2006-05-01', endDate: null },
  'Oil Services': { startDate: '2001-02-26', endDate: null },
  'Regional Banks': { startDate: '2006-06-19', endDate: null },
  'Homebuilders': { startDate: '2006-05-02', endDate: null },
  'Broad Commod (PDBC)': { startDate: '2014-11-07', endDate: null },
  'EM Sov Debt (EMB)': { startDate: '2007-12-19', endDate: null },
  'Gold ETF (IAU)': { startDate: '2005-01-28', endDate: null },
};
