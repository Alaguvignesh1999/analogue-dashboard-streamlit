import { alphaSeriesColor, alphaThemeColor } from '@/theme/chart';
import { CHART_PALETTE, CHART_THEME } from '@/config/theme';

function alphaChartPalette(index: number, alpha: string): string {
  return alphaSeriesColor(index, alpha);
}

export function fmtPct(v: number, decimals = 1): string {
  if (isNaN(v)) return '--';
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`;
}

export function fmtBps(v: number, decimals = 0): string {
  if (isNaN(v)) return '--';
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}bp`;
}

export function fmtReturn(v: number, isRates: boolean, decimals = 1): string {
  if (isNaN(v)) return '--';
  const prefix = v >= 0 ? '+' : '';
  const unit = isRates ? 'bp' : '%';
  return `${prefix}${v.toFixed(decimals)}${unit}`;
}

export function fmtDollar(v: number): string {
  if (isNaN(v)) return '--';
  const abs = Math.abs(v);
  const sign = v >= 0 ? '' : '-';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtNumber(v: number, decimals = 2): string {
  if (isNaN(v)) return '--';
  return v.toFixed(decimals);
}

export function stars(iqr: number, med: number): string {
  if (Math.abs(med) < 0.01) return '.....';
  const ratio = iqr / (Math.abs(med) + 1e-9);
  if (ratio < 0.4) return '*****';
  if (ratio < 0.7) return '****.';
  if (ratio < 1.0) return '***..';
  if (ratio < 1.5) return '**...';
  return '*....';
}

export function entrySignal(pctile: number | null): { label: string; color: string; bg: string } {
  if (pctile === null || isNaN(pctile)) return { label: 'N/A', color: CHART_THEME.textMuted, bg: alphaThemeColor('bgHover', '0.36') };
  if (pctile < 33) return { label: 'ENTER', color: CHART_THEME.up, bg: alphaThemeColor('up', '0.15') };
  if (pctile < 66) return { label: 'HALF', color: CHART_THEME.accentAmber, bg: alphaThemeColor('accentAmber', '0.15') };
  if (pctile < 85) return { label: 'LATE', color: CHART_PALETTE[4], bg: alphaChartPalette(4, '0.15') };
  return { label: 'SKIP', color: CHART_THEME.down, bg: alphaThemeColor('down', '0.15') };
}

export function statusFromPctile(pctile: number | null): string {
  if (pctile === null || isNaN(pctile)) return '--';
  if (pctile < 25) return 'Still open';
  if (pctile < 50) return 'On track';
  if (pctile < 75) return 'Chasing';
  return 'Extended';
}
