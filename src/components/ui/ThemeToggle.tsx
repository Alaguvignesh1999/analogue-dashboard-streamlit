'use client';

import { Palette } from 'lucide-react';
import { useTheme } from '@/theme/provider';
import { THEME_COLORS } from '@/theme/chart';

export function ThemeToggle() {
  const { theme, setTheme, themes } = useTheme();
  const entries = Object.entries(themes);

  return (
    <div className="flex items-center gap-1.5 px-1.5 py-1 border border-border/60 rounded-sm bg-bg-chrome/80 font-sans">
      <Palette size={12} className="text-text-dim" />
      <div className="flex items-center gap-1">
        {entries.map(([name, definition]) => {
          const selected = theme === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setTheme(name as typeof theme)}
              aria-label={`Use ${definition.label} theme`}
              title={definition.description}
              className="px-2 py-1 rounded-sm text-2xs font-mono font-medium tracking-[0.08em] uppercase border transition-all hover:opacity-90"
              style={selected ? {
                backgroundColor: THEME_COLORS.controlActiveBg,
                color: THEME_COLORS.controlActiveText,
                borderColor: THEME_COLORS.controlActiveBorder,
              } : {
                backgroundColor: THEME_COLORS.controlBg,
                color: THEME_COLORS.textSecondary,
                borderColor: 'transparent',
              }}
            >
              {definition.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
