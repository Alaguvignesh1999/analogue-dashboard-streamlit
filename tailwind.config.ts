import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#09090b',
          panel: '#111113',
          cell: '#18181b',
          hover: '#1e1e22',
        },
        border: {
          DEFAULT: '#1e1e22',
          bright: '#2a2a2e',
        },
        accent: {
          teal: '#00d4aa',
          amber: '#f59e0b',
          blue: '#3b82f6',
          purple: '#a78bfa',
        },
        text: {
          primary: '#e4e4e7',
          secondary: '#a1a1aa',
          muted: '#71717a',
          dim: '#52525b',
        },
        up: '#22c55e',
        down: '#ef4444',
        live: '#f59e0b',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Geist', 'system-ui', 'sans-serif'],
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
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 212, 170, 0.05)' },
          '50%': { boxShadow: '0 0 15px rgba(0, 212, 170, 0.1)' },
        },
      },
      boxShadow: {
        'glow-teal': '0 0 15px rgba(0, 212, 170, 0.1)',
        'glow-amber': '0 0 15px rgba(245, 158, 11, 0.1)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
