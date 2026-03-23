import { CHART_SERIES_PALETTE, THEME_COLORS } from '@/theme/chart';

export const CHART_THEME = {
  bg: THEME_COLORS.bgPrimary,
  bgChrome: THEME_COLORS.bgChrome,
  bgPanel: THEME_COLORS.bgPanel,
  bgCell: THEME_COLORS.bgCell,
  bgHover: THEME_COLORS.bgHover,
  grid: THEME_COLORS.grid,
  gridBright: THEME_COLORS.borderBright,
  text: THEME_COLORS.textPrimary,
  textPrimary: THEME_COLORS.textPrimary,
  textSecondary: THEME_COLORS.textSecondary,
  textMuted: THEME_COLORS.textMuted,
  textDim: THEME_COLORS.textDim,
  accentTeal: THEME_COLORS.accentTeal,
  accentAmber: THEME_COLORS.accentAmber,
  accentBlue: THEME_COLORS.accentBlue,
  accentPurple: THEME_COLORS.accentPurple,
  uiAccent: THEME_COLORS.uiAccent,
  axisLine: THEME_COLORS.axisLine,
  zero: THEME_COLORS.zero,
  up: THEME_COLORS.up,
  down: THEME_COLORS.down,
  live: THEME_COLORS.live,
  tooltipBg: THEME_COLORS.tooltipBg,
} as const;

export const CHART_PALETTE = CHART_SERIES_PALETTE;

export const GROUP_ACCENTS = {
  historical: THEME_COLORS.accentBlue,
  live: THEME_COLORS.live,
  analysis: THEME_COLORS.accentPurple,
  risk: THEME_COLORS.down,
  tools: THEME_COLORS.up,
} as const;
