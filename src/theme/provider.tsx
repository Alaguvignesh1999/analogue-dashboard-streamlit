'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME, isThemeName, THEME_STORAGE_KEY, THEMES, ThemeName } from '@/theme/registry';

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: typeof THEMES;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(stored)) return stored;
  } catch {
    // Ignore storage errors and keep the default theme.
  }

  const domTheme = document.documentElement.dataset.theme;
  return isThemeName(domTheme) ? domTheme : DEFAULT_THEME;
}

function syncThemeMeta(theme: ThemeName) {
  if (typeof document === 'undefined') return;
  const themeColor = THEMES[theme].themeColor;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', themeColor);
    return;
  }
  const created = document.createElement('meta');
  created.setAttribute('name', 'theme-color');
  created.setAttribute('content', themeColor);
  document.head.appendChild(created);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    syncThemeMeta(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can fail in private or restricted contexts; the theme still applies.
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: setThemeState,
    themes: THEMES,
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
