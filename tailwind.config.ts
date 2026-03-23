import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'rgb(var(--color-bg-primary) / <alpha-value>)',
          chrome: 'rgb(var(--color-bg-chrome) / <alpha-value>)',
          panel: 'rgb(var(--color-bg-panel) / <alpha-value>)',
          cell: 'rgb(var(--color-bg-cell) / <alpha-value>)',
          hover: 'rgb(var(--color-bg-hover) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          bright: 'rgb(var(--color-border-bright) / <alpha-value>)',
        },
        accent: {
          teal: 'rgb(var(--color-accent-teal) / <alpha-value>)',
          amber: 'rgb(var(--color-accent-amber) / <alpha-value>)',
          blue: 'rgb(var(--color-accent-blue) / <alpha-value>)',
          purple: 'rgb(var(--color-accent-purple) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
          dim: 'rgb(var(--color-text-dim) / <alpha-value>)',
        },
        up: 'rgb(var(--color-up) / <alpha-value>)',
        down: 'rgb(var(--color-down) / <alpha-value>)',
        live: 'rgb(var(--color-live) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['var(--font-plex-mono)', 'monospace'],
        sans: ['var(--font-plex-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '3xs': ['0.5625rem', { lineHeight: '0.75rem' }],
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgb(var(--color-accent-teal) / 0.05)' },
          '50%': { boxShadow: '0 0 15px rgb(var(--color-accent-teal) / 0.1)' },
        },
      },
      boxShadow: {
        'glow-teal': '0 0 15px rgb(var(--color-accent-teal) / 0.1)',
        'glow-amber': '0 0 15px rgb(var(--color-accent-amber) / 0.1)',
        'card': '0 1px 3px rgb(var(--color-shadow) / 0.18), 0 1px 2px rgb(var(--color-shadow) / 0.12)',
        'card-hover': '0 4px 12px rgb(var(--color-shadow) / 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
