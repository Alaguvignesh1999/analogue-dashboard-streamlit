export type ThemeName = 'dark' | 'parchment-terminal' | 'terminal-light';

export type ThemeDefinition = {
  label: string;
  description: string;
  themeColor: string;
  tokens: Record<string, string>;
};

const darkTokens: Record<string, string> = {
  '--color-bg-primary': '9 9 11',
  '--color-bg-chrome': '17 17 19',
  '--color-bg-panel': '17 17 19',
  '--color-bg-cell': '24 24 27',
  '--color-bg-hover': '30 30 34',
  '--color-bg-glass': '17 17 19',
  '--color-bg-selection': '0 212 170',
  '--color-border': '30 30 34',
  '--color-border-bright': '42 42 46',
  '--color-scrollbar': '42 42 46',
  '--color-scrollbar-hover': '58 58 62',
  '--color-text-primary': '228 228 231',
  '--color-text-secondary': '161 161 170',
  '--color-text-muted': '113 113 122',
  '--color-text-dim': '82 82 91',
  '--color-accent-teal': '0 212 170',
  '--color-accent-amber': '245 158 11',
  '--color-accent-blue': '59 130 246',
  '--color-accent-purple': '167 139 250',
  '--color-ui-accent': '0 212 170',
  '--color-control-bg': '24 24 27',
  '--color-control-hover': '30 30 34',
  '--color-control-active-bg': '0 212 170',
  '--color-control-active-text': '9 9 11',
  '--color-control-active-border': '0 212 170',
  '--color-up': '34 197 94',
  '--color-down': '239 68 68',
  '--color-live': '245 158 11',
  '--color-tooltip-bg': '12 12 18',
  '--color-chart-axis-tick': '138 138 154',
  '--color-chart-axis-line': '42 42 58',
  '--color-chart-grid': '30 30 34',
  '--color-chart-zero': '58 58 78',
  '--color-shadow': '0 0 0',
  '--color-series-0': '88 166 255',
  '--color-series-1': '247 129 102',
  '--color-series-2': '63 185 80',
  '--color-series-3': '210 168 255',
  '--color-series-4': '255 166 87',
  '--color-series-5': '255 123 114',
  '--color-series-6': '121 192 255',
  '--color-series-7': '86 211 100',
  '--color-series-8': '227 179 65',
  '--color-series-9': '188 140 255',
  '--color-series-10': '255 155 206',
  '--color-series-11': '137 221 255',
  '--color-series-12': '165 214 255',
};

const parchmentTokens: Record<string, string> = {
  '--color-bg-primary': '244 244 244',
  '--color-bg-chrome': '255 255 255',
  '--color-bg-panel': '255 255 255',
  '--color-bg-cell': '244 244 244',
  '--color-bg-hover': '235 235 235',
  '--color-bg-glass': '255 255 255',
  '--color-bg-selection': '10 10 10',
  '--color-border': '136 136 136',
  '--color-border-bright': '102 102 102',
  '--color-scrollbar': '136 136 136',
  '--color-scrollbar-hover': '102 102 102',
  '--color-text-primary': '10 10 10',
  '--color-text-secondary': '51 51 51',
  '--color-text-muted': '102 102 102',
  '--color-text-dim': '107 107 107',
  '--color-accent-teal': '26 107 42',
  '--color-accent-amber': '85 85 85',
  '--color-accent-blue': '0 68 153',
  '--color-accent-purple': '112 92 212',
  '--color-ui-accent': '10 10 10',
  '--color-control-bg': '255 255 255',
  '--color-control-hover': '235 235 235',
  '--color-control-active-bg': '10 10 10',
  '--color-control-active-text': '255 255 255',
  '--color-control-active-border': '10 10 10',
  '--color-up': '26 107 42',
  '--color-down': '192 0 12',
  '--color-live': '137 118 255',
  '--color-tooltip-bg': '255 255 255',
  '--color-chart-axis-tick': '85 85 85',
  '--color-chart-axis-line': '187 187 187',
  '--color-chart-grid': '235 235 235',
  '--color-chart-zero': '136 136 136',
  '--color-shadow': '0 0 0',
  '--color-series-0': '0 34 136',
  '--color-series-1': '187 85 0',
  '--color-series-2': '0 68 187',
  '--color-series-3': '85 102 0',
  '--color-series-4': '34 68 0',
  '--color-series-5': '136 0 0',
  '--color-series-6': '0 112 48',
  '--color-series-7': '136 102 0',
  '--color-series-8': '0 68 153',
  '--color-series-9': '0 102 102',
  '--color-series-10': '85 0 170',
  '--color-series-11': '204 0 0',
  '--color-series-12': '170 0 102',
};

const terminalLightTokens: Record<string, string> = {
  '--color-bg-primary': '236 236 236',
  '--color-bg-chrome': '248 251 255',
  '--color-bg-panel': '255 255 255',
  '--color-bg-cell': '240 240 240',
  '--color-bg-hover': '224 224 224',
  '--color-bg-glass': '248 251 255',
  '--color-bg-selection': '10 10 10',
  '--color-border': '136 136 136',
  '--color-border-bright': '102 102 102',
  '--color-scrollbar': '136 136 136',
  '--color-scrollbar-hover': '102 102 102',
  '--color-text-primary': '10 10 10',
  '--color-text-secondary': '51 51 51',
  '--color-text-muted': '102 102 102',
  '--color-text-dim': '107 107 107',
  '--color-accent-teal': '26 107 42',
  '--color-accent-amber': '85 85 85',
  '--color-accent-blue': '0 68 153',
  '--color-accent-purple': '112 92 212',
  '--color-ui-accent': '10 10 10',
  '--color-control-bg': '255 255 255',
  '--color-control-hover': '235 235 235',
  '--color-control-active-bg': '10 10 10',
  '--color-control-active-text': '255 255 255',
  '--color-control-active-border': '10 10 10',
  '--color-up': '26 107 42',
  '--color-down': '192 0 12',
  '--color-live': '137 118 255',
  '--color-tooltip-bg': '255 255 255',
  '--color-chart-axis-tick': '85 85 85',
  '--color-chart-axis-line': '187 187 187',
  '--color-chart-grid': '235 235 235',
  '--color-chart-zero': '136 136 136',
  '--color-shadow': '0 0 0',
  '--color-series-0': '0 34 136',
  '--color-series-1': '187 85 0',
  '--color-series-2': '0 68 187',
  '--color-series-3': '85 102 0',
  '--color-series-4': '34 68 0',
  '--color-series-5': '136 0 0',
  '--color-series-6': '0 112 48',
  '--color-series-7': '136 102 0',
  '--color-series-8': '0 68 153',
  '--color-series-9': '0 102 102',
  '--color-series-10': '85 0 170',
  '--color-series-11': '204 0 0',
  '--color-series-12': '170 0 102',
};

export const THEMES: Record<ThemeName, ThemeDefinition> = {
  dark: {
    label: 'Dark',
    description: 'Low-glare operational workspace',
    themeColor: '#09090b',
    tokens: darkTokens,
  },
  'parchment-terminal': {
    label: 'Paper',
    description: 'Verified neutral paper mode with black-active contrast',
    themeColor: '#f4f4f4',
    tokens: parchmentTokens,
  },
  'terminal-light': {
    label: 'Terminal',
    description: 'Higher-density neutral terminal using the verified light spec',
    themeColor: '#ececec',
    tokens: terminalLightTokens,
  },
};

export const DEFAULT_THEME: ThemeName = 'dark';
export const THEME_STORAGE_KEY = 'analogue-theme';
export const LIGHT_THEMES: ThemeName[] = ['parchment-terminal', 'terminal-light'];

export function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === 'dark' || value === 'parchment-terminal' || value === 'terminal-light';
}

export function buildThemeStyleSheet(): string {
  const blocks = Object.entries(THEMES).map(([name, definition]) => {
    const selectors = name === DEFAULT_THEME ? `:root, :root[data-theme="${name}"]` : `:root[data-theme="${name}"]`;
    const declarations = Object.entries(definition.tokens)
      .map(([token, value]) => `  ${token}: ${value};`)
      .join('\n');
    return `${selectors} {\n${declarations}\n}`;
  });

  return blocks.join('\n\n');
}
