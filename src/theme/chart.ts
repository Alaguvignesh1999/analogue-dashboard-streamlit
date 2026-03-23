import { DEFAULT_THEME, isThemeName, ThemeName } from '@/theme/registry';

const colorVar = (token: string) => `rgb(var(${token}))`;
const alphaColorVar = (token: string, alpha: number | string) => `rgb(var(${token}) / ${alpha})`;

export const THEME_COLORS = {
  bgPrimary: colorVar('--color-bg-primary'),
  bgChrome: colorVar('--color-bg-chrome'),
  bgPanel: colorVar('--color-bg-panel'),
  bgCell: colorVar('--color-bg-cell'),
  bgHover: colorVar('--color-bg-hover'),
  shadow: colorVar('--color-shadow'),
  border: colorVar('--color-border'),
  borderBright: colorVar('--color-border-bright'),
  textPrimary: colorVar('--color-text-primary'),
  textSecondary: colorVar('--color-text-secondary'),
  textMuted: colorVar('--color-text-muted'),
  textDim: colorVar('--color-text-dim'),
  accentTeal: colorVar('--color-accent-teal'),
  accentAmber: colorVar('--color-accent-amber'),
  accentBlue: colorVar('--color-accent-blue'),
  accentPurple: colorVar('--color-accent-purple'),
  uiAccent: colorVar('--color-ui-accent'),
  controlBg: colorVar('--color-control-bg'),
  controlHover: colorVar('--color-control-hover'),
  controlActiveBg: colorVar('--color-control-active-bg'),
  controlActiveText: colorVar('--color-control-active-text'),
  controlActiveBorder: colorVar('--color-control-active-border'),
  up: colorVar('--color-up'),
  down: colorVar('--color-down'),
  live: colorVar('--color-live'),
  tooltipBg: alphaColorVar('--color-tooltip-bg', '0.96'),
  axisTick: colorVar('--color-chart-axis-tick'),
  axisLine: colorVar('--color-chart-axis-line'),
  grid: colorVar('--color-chart-grid'),
  zero: colorVar('--color-chart-zero'),
  panelGlow: alphaColorVar('--color-accent-teal', '0.03'),
} as const;

export const THEME_FONTS = {
  mono: 'var(--font-plex-mono), monospace',
  sans: 'var(--font-plex-sans), sans-serif',
} as const;

export const CHART_SERIES_PALETTE = Array.from(
  { length: 13 },
  (_, index) => colorVar(`--color-series-${index}`),
);

// Keep this ordering aligned with the built-in event order in src/config/events.ts.
const CANONICAL_EVENT_ORDER = [
  '1973 Oil Embargo',
  '1990 Gulf War',
  '1991 Kuwait Oil Fires',
  '1998 Desert Fox',
  '2001 Afghanistan (OEF)',
  '2003 SARS',
  '2003 Iraq War',
  '2011 Libya',
  '2014 ISIS/Mosul',
  '2017 Syria Strikes',
  'COVID-19',
  '2022 Russia-Ukraine',
  '2023 Red Sea Crisis',
] as const;

function stableSeriesIndex(key: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % Math.max(length, 1);
}

function getCanonicalEventIndex(eventName: string): number {
  const canonicalIndex = CANONICAL_EVENT_ORDER.indexOf(eventName as (typeof CANONICAL_EVENT_ORDER)[number]);
  if (canonicalIndex >= 0) return canonicalIndex;
  return stableSeriesIndex(eventName, CHART_SERIES_PALETTE.length);
}

function getActiveThemeName(): ThemeName {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const theme = document.documentElement.dataset.theme;
  return isThemeName(theme) ? theme : DEFAULT_THEME;
}

export function isLightTheme(theme: ThemeName = getActiveThemeName()): boolean {
  return theme !== 'dark';
}

export function alphaSeriesColor(index: number, alpha: number | string): string {
  return `rgb(var(--color-series-${index}) / ${alpha})`;
}

export function getEventSeriesColor(eventName: string, index = 0, _theme?: ThemeName): string {
  const stableIndex = eventName ? getCanonicalEventIndex(eventName) : stableSeriesIndex(String(index), CHART_SERIES_PALETTE.length);
  return CHART_SERIES_PALETTE[stableIndex];
}

export function themeStrokeWidth(baseWidth: number, theme: ThemeName = getActiveThemeName()): number {
  return isLightTheme(theme) ? Math.max(baseWidth + 0.35, 1.4) : baseWidth;
}

export function themeDashPattern(darkPattern: string | undefined, _lightPattern = '5 4', _theme?: ThemeName): string | undefined {
  return darkPattern;
}

export function dayZeroMarkerStyle(_theme?: ThemeName) {
  return {
    stroke: THEME_COLORS.accentBlue,
    strokeDasharray: '4 4',
    strokeWidth: 1.2,
  };
}

export function getEventLineStyle(eventName: string, index = 0, darkStrokeWidth = 1.6, darkDashPattern?: string, theme?: ThemeName) {
  return {
    color: getEventSeriesColor(eventName, index, theme),
    strokeWidth: darkStrokeWidth,
    strokeDasharray: darkDashPattern,
  };
}

export function segmentedControlStyle(selected: boolean) {
  return selected ? {
    backgroundColor: THEME_COLORS.controlActiveBg,
    color: THEME_COLORS.controlActiveText,
    borderColor: THEME_COLORS.controlActiveBorder,
  } : {
    backgroundColor: 'transparent',
    color: THEME_COLORS.textMuted,
    borderColor: alphaThemeColor('borderBright', '0.8'),
  };
}

export function themedHeatColor(value: number, maxAbs: number, positiveIsGood = true): string {
  if (Number.isNaN(value)) return alphaColorVar('--color-bg-cell', '0.45');
  const intensity = Math.min(Math.abs(value) / (maxAbs + 1e-9), 1);
  const alpha = 0.15 + intensity * 0.55;
  const isGood = positiveIsGood ? value >= 0 : value <= 0;
  return isGood
    ? alphaColorVar('--color-up', alpha.toFixed(2))
    : alphaColorVar('--color-down', alpha.toFixed(2));
}

export function directionColor(value: number, positiveIsGood = true): string {
  const isGood = positiveIsGood ? value >= 0 : value <= 0;
  return isGood ? THEME_COLORS.up : THEME_COLORS.down;
}

export function alphaThemeColor(token: keyof typeof THEME_COLORS, alpha: number | string): string {
  const map: Record<keyof typeof THEME_COLORS, string | null> = {
    bgPrimary: '--color-bg-primary',
    bgChrome: '--color-bg-chrome',
    bgPanel: '--color-bg-panel',
    bgCell: '--color-bg-cell',
    bgHover: '--color-bg-hover',
    shadow: '--color-shadow',
    border: '--color-border',
    borderBright: '--color-border-bright',
    textPrimary: '--color-text-primary',
    textSecondary: '--color-text-secondary',
    textMuted: '--color-text-muted',
    textDim: '--color-text-dim',
    accentTeal: '--color-accent-teal',
    accentAmber: '--color-accent-amber',
    accentBlue: '--color-accent-blue',
    accentPurple: '--color-accent-purple',
    uiAccent: '--color-ui-accent',
    controlBg: '--color-control-bg',
    controlHover: '--color-control-hover',
    controlActiveBg: '--color-control-active-bg',
    controlActiveText: '--color-control-active-text',
    controlActiveBorder: '--color-control-active-border',
    up: '--color-up',
    down: '--color-down',
    live: '--color-live',
    tooltipBg: null,
    axisTick: '--color-chart-axis-tick',
    axisLine: '--color-chart-axis-line',
    grid: '--color-chart-grid',
    zero: '--color-chart-zero',
    panelGlow: '--color-accent-teal',
  };

  const cssVar = map[token];
  return cssVar ? alphaColorVar(cssVar, alpha) : THEME_COLORS[token];
}
