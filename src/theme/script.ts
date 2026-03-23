import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/theme/registry';

export function getThemeBootScript(): string {
  return `(() => {
    try {
      const stored = window.localStorage.getItem('${THEME_STORAGE_KEY}');
      document.documentElement.dataset.theme = stored || '${DEFAULT_THEME}';
    } catch (err) {
      document.documentElement.dataset.theme = '${DEFAULT_THEME}';
    }
  })();`;
}
