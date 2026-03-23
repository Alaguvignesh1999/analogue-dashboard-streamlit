'use client';

import { ReactNode, Component, ErrorInfo } from 'react';
import { ChevronDown } from 'lucide-react';
import { alphaThemeColor, THEME_COLORS } from '@/theme/chart';

/* ─────────────────────── Error Boundary ─────────────────────── */
interface EBProps { children: ReactNode; fallback?: ReactNode }
interface EBState { hasError: boolean; error: string }

export class CardErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, error: '' };
  static getDerivedStateFromError(err: Error) { return { hasError: true, error: err.message }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error('[CardError]', err, info); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
          <div className="text-xs text-down/70 font-medium">Component Error</div>
          <div className="text-2xs text-text-dim max-w-xs">{this.state.error}</div>
          <button onClick={() => this.setState({ hasError: false, error: '' })}
            className="mt-2 px-3 py-1 text-2xs border transition-colors"
            style={{
              color: THEME_COLORS.controlActiveBg,
              borderColor: alphaThemeColor('controlActiveBorder', '0.3'),
              backgroundColor: alphaThemeColor('controlActiveBg', '0.08'),
            }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─────────────────────── Chart Card ─────────────────────── */
interface ChartCardProps {
  title?: string;
  subtitle?: string;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
  loading?: boolean;
  noPad?: boolean;
}

export function ChartCard({ title, subtitle, controls, children, className = '', loading, noPad }: ChartCardProps) {
  return (
    <CardErrorBoundary>
      <div className={`bg-bg-panel border border-border/80 card-glow rounded-sm overflow-hidden ${className}`}>
        {(title || controls) && (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
            <div className="min-w-0">
              {title && (
                <h3 className="text-xs font-semibold font-mono text-text-primary tracking-[0.08em] uppercase">{title}</h3>
              )}
              {subtitle && (
                <p className="text-2xs text-text-dim mt-0.5 truncate font-mono">{subtitle}</p>
              )}
            </div>
            {controls && <div className="flex items-center gap-2 shrink-0 ml-3">{controls}</div>}
          </div>
        )}
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center glass">
              <div className="flex items-center gap-2.5">
                <div className="relative w-5 h-5">
                  <div className="absolute inset-0 border-2 rounded-full" style={{ borderColor: alphaThemeColor('uiAccent', '0.16') }} />
                  <div className="absolute inset-0 border-2 border-transparent rounded-full animate-spin" style={{ borderTopColor: THEME_COLORS.uiAccent }} />
                </div>
                <span className="text-xs text-text-muted">Computing...</span>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </CardErrorBoundary>
  );
}

export function BottomDescription({ children, className = '' }: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-4 py-3 text-2xs text-text-dim border-t border-border/40 bg-bg-cell/20 ${className}`}>
      {children}
    </div>
  );
}

/* ─────────────────────── Stat Box ─────────────────────── */
export function StatBox({ label, value, sub, color, className = '' }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={`stat-card p-3 bg-bg-cell/60 border border-border/50 rounded-sm ${className}`}
      style={{ ['--stat-accent' as any]: color || THEME_COLORS.uiAccent }}
    >
      <div className="text-3xs text-text-dim uppercase tracking-[0.08em] font-medium font-mono">{label}</div>
      <div className="text-sm font-bold mt-1 font-mono leading-none" style={{ color: color || THEME_COLORS.textPrimary }}>
        {value}
      </div>
      {sub && <div className="text-3xs text-text-dim mt-1 font-mono">{sub}</div>}
    </div>
  );
}

/* ─────────────────────── Select ─────────────────────── */
export function Select({
  value, onChange, options, label, className = ''
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {label && <span className="text-2xs text-text-dim shrink-0 font-mono uppercase tracking-[0.08em]">{label}</span>}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-bg-cell border border-border/60 text-xs text-text-primary px-2 py-1 rounded-sm font-mono
                     focus:outline-none
                     cursor-pointer transition-colors hover:border-border-bright appearance-none pr-6"
          style={{ backgroundColor: THEME_COLORS.controlBg, borderColor: alphaThemeColor('border', '0.75') }}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
      </div>
    </div>
  );
}

/* ─────────────────────── Slider ─────────────────────── */
export function SliderControl({
  value, onChange, min, max, step = 1, label, suffix = ''
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-2xs text-text-dim shrink-0 font-mono uppercase tracking-[0.08em]">{label}</span>}
      <div className="relative w-28 h-5 flex items-center">
        <div className="absolute h-[3px] w-full bg-border/80 rounded-full" />
        <div
          className="absolute h-[3px] rounded-full"
          style={{
            width: `${((value - min) / (max - min)) * 100}%`,
            backgroundColor: alphaThemeColor('uiAccent', '0.35'),
          }}
        />
        <input
          type="range" value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={min} max={max} step={step}
          className="absolute w-full h-5 opacity-0 cursor-pointer z-10"
        />
        <div
          className="absolute w-3 h-3 rounded-full pointer-events-none border"
          style={{
            left: `calc(${((value - min) / (max - min)) * 100}% - 6px)`,
            backgroundColor: THEME_COLORS.uiAccent,
            borderColor: alphaThemeColor('uiAccent', '0.45'),
            boxShadow: `0 0 0 1px ${alphaThemeColor('uiAccent', '0.08')}`,
          }}
        />
      </div>
      <span className="text-2xs text-text-muted w-14 text-right font-mono tabular-nums">
        {value}{suffix}
      </span>
    </div>
  );
}

/* ─────────────────────── Button ─────────────────────── */
export function Button({
  children, onClick, variant = 'primary', disabled = false, className = '', size = 'sm'
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}) {
  const sizes = {
    xs: 'px-2 py-0.5 text-2xs',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };
  const variants = {
    primary: {
      backgroundColor: THEME_COLORS.controlActiveBg,
      color: THEME_COLORS.controlActiveText,
      borderColor: THEME_COLORS.controlActiveBorder,
    },
    secondary: {
      backgroundColor: THEME_COLORS.controlBg,
      color: THEME_COLORS.textSecondary,
      borderColor: alphaThemeColor('border', '0.75'),
    },
    ghost: {
      backgroundColor: 'transparent',
      color: THEME_COLORS.textMuted,
      borderColor: 'transparent',
    },
    danger: {
      backgroundColor: alphaThemeColor('down', '0.10'),
      color: THEME_COLORS.down,
      borderColor: alphaThemeColor('down', '0.25'),
    },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-mono font-medium tracking-[0.05em] uppercase transition-all duration-150 rounded-sm
        disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none hover:opacity-95
        ${sizes[size]} border ${className}`}
      style={variants[variant]}
    >
      {children}
    </button>
  );
}

/* ─────────────────────── Empty State ─────────────────────── */
export function EmptyState({ title, message, icon }: {
  title?: string;
  message: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      {icon && <div className="text-text-dim mb-3 opacity-50">{icon}</div>}
      {title && <div className="text-xs font-medium text-text-muted mb-1">{title}</div>}
      <div className="text-2xs text-text-dim max-w-sm leading-relaxed">{message}</div>
    </div>
  );
}

/* ─────────────────────── Badge ─────────────────────── */
export function Badge({ children, color = 'teal', className = '' }: {
  children: ReactNode;
  color?: 'teal' | 'amber' | 'red' | 'green' | 'blue' | 'purple' | 'dim';
  className?: string;
}) {
  const colors = {
    teal: 'bg-accent-teal/10 text-accent-teal border-accent-teal/20',
    amber: 'bg-accent-amber/10 text-accent-amber border-accent-amber/20',
    red: 'bg-down/10 text-down border-down/20',
    green: 'bg-up/10 text-up border-up/20',
    blue: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
    purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
    dim: 'bg-bg-hover text-text-dim border-border',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-3xs font-mono font-medium uppercase tracking-[0.08em] border rounded-sm ${colors[color]} ${className}`}>
      {children}
    </span>
  );
}

/* ─────────────────────── Tooltip Wrapper ─────────────────────── */
export function TooltipHint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="group relative inline-flex">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-bg-cell border border-border-bright
                      text-2xs text-text-secondary whitespace-nowrap rounded-sm opacity-0 pointer-events-none
                      group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-card">
        {text}
      </div>
    </div>
  );
}
