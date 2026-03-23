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

function stableSeriesIndex(key: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % Math.max(length, 1);
}

const DARK_EVENT_COLORS: Record<string, string> = {
  '2022 Russia-Ukraine': '#f78166',
  'COVID-19': '#d2a8ff',
  '2014 ISIS/Mosul': '#ffa657',
  '2017 Syria Strikes': '#3fb950',
  '2023 Red Sea Crisis': '#79c0ff',
  '2011 Libya': '#56d364',
  '1973 Oil Embargo': '#58a6ff',
  '1990 Gulf War': '#e3b341',
  '2003 Iraq War': '#89ddff',
};

const VERIFIED_LIGHT_EVENT_COLORS: Record<string, string> = {
  '2022 Russia-Ukraine': '#7B4B2A',
  '1991 Kuwait Oil Fires': '#0044BB',
  '2003 Iraq War': '#007030',
  '1990 Gulf War': '#BB5500',
  '1973 Oil Embargo': '#002288',
  'COVID-19': '#2457A6',
  '2017 Syria Strikes': '#006666',
  '2003 SARS': '#880000',
  '1998 Desert Fox': '#556600',
  '2023 Red Sea Crisis': '#AA0066',
  '2001 Afghanistan (OEF)': '#224400',
  '2014 ISIS/Mosul': '#004499',
  '2011 Libya': '#886600',
};

const VERIFIED_LIGHT_EVENT_STYLES: Record<string, { color: string; strokeWidth: number; strokeDasharray?: string }> = {
  '2022 Russia-Ukraine': { color: '#7B4B2A', strokeWidth: 2.5 },
  '1991 Kuwait Oil Fires': { color: '#0044BB', strokeWidth: 2.5 },
  '2003 Iraq War': { color: '#007030', strokeWidth: 2.5 },
  '1990 Gulf War': { color: '#BB5500', strokeWidth: 2, strokeDasharray: '12 5' },
  '1973 Oil Embargo': { color: '#002288', strokeWidth: 2, strokeDasharray: '12 5' },
  'COVID-19': { color: '#2457A6', strokeWidth: 2, strokeDasharray: '12 5' },
  '2017 Syria Strikes': { color: '#006666', strokeWidth: 2, strokeDasharray: '5 4' },
  '2003 SARS': { color: '#880000', strokeWidth: 2, strokeDasharray: '5 4' },
  '1998 Desert Fox': { color: '#556600', strokeWidth: 2, strokeDasharray: '5 4' },
  '2023 Red Sea Crisis': { color: '#AA0066', strokeWidth: 1.5, strokeDasharray: '2 5' },
  '2001 Afghanistan (OEF)': { color: '#224400', strokeWidth: 1.5, strokeDasharray: '2 5' },
  '2014 ISIS/Mosul': { color: '#004499', strokeWidth: 2, strokeDasharray: '2 4 8 4' },
  '2011 Libya': { color: '#886600', strokeWidth: 2, strokeDasharray: '2 4 8 4' },
};

const EVENT_COLOR_MAP: Record<ThemeName, Record<string, string>> = {
  dark: DARK_EVENT_COLORS,
  'parchment-terminal': VERIFIED_LIGHT_EVENT_COLORS,
  'terminal-light': VERIFIED_LIGHT_EVENT_COLORS,
};

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

export function getEventSeriesColor(eventName: string, index = 0, theme: ThemeName = getActiveThemeName()): string {
  const mapped = EVENT_COLOR_MAP[theme][eventName];
  if (mapped) return mapped;
  const stableIndex = stableSeriesIndex(eventName || String(index), CHART_SERIES_PALETTE.length);
  return CHART_SERIES_PALETTE[stableIndex];
}

export function themeStrokeWidth(baseWidth: number, theme: ThemeName = getActiveThemeName()): number {
  return isLightTheme(theme) ? Math.max(baseWidth, 1.5) : baseWidth;
}

export function themeDashPattern(darkPattern: string | undefined, lightPattern = '5 4', theme: ThemeName = getActiveThemeName()): string | undefined {
  if (!darkPattern) return undefined;
  return isLightTheme(theme) ? lightPattern : darkPattern;
}

export function dayZeroMarkerStyle(theme: ThemeName = getActiveThemeName()) {
  if (isLightTheme(theme)) {
    return {
      stroke: THEME_COLORS.textPrimary,
      strokeDasharray: undefined,
      strokeWidth: 2,
    };
  }

  return {
    stroke: THEME_COLORS.accentBlue,
    strokeDasharray: '4 4',
    strokeWidth: 1.2,
  };
}

export function getEventLineStyle(eventName: string, index = 0, darkStrokeWidth = 1.6, darkDashPattern?: string, theme: ThemeName = getActiveThemeName()) {
  if (!isLightTheme(theme)) {
    return {
      color: getEventSeriesColor(eventName, index, theme),
      strokeWidth: darkStrokeWidth,
      strokeDasharray: darkDashPattern,
    };
  }

  const style = VERIFIED_LIGHT_EVENT_STYLES[eventName];
  if (!style) {
    return {
      color: getEventSeriesColor(eventName, index, theme),
      strokeWidth: Math.max(darkStrokeWidth, 1.8),
      strokeDasharray: undefined,
    };
  }

  return style;
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
