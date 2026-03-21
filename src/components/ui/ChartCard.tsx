'use client';

import { ReactNode, Component, ErrorInfo } from 'react';

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
            className="mt-2 px-3 py-1 text-2xs text-accent-teal border border-accent-teal/20 hover:bg-accent-teal/10 transition-colors">
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
                <h3 className="text-xs font-semibold text-text-primary tracking-wide">{title}</h3>
              )}
              {subtitle && (
                <p className="text-2xs text-text-dim mt-0.5 truncate">{subtitle}</p>
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
                  <div className="absolute inset-0 border-2 border-accent-teal/20 rounded-full" />
                  <div className="absolute inset-0 border-2 border-transparent border-t-accent-teal rounded-full animate-spin" />
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

/* ─────────────────────── Stat Box ─────────────────────── */
export function StatBox({ label, value, sub, color, className = '' }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  className?: string;
}) {
  return (
    <div className={`stat-card p-3 bg-bg-cell/60 border border-border/50 rounded-sm ${className}`}>
      <div className="text-3xs text-text-dim uppercase tracking-wider font-medium">{label}</div>
      <div className="text-sm font-bold mt-1 font-mono leading-none" style={{ color: color || '#e4e4e7' }}>
        {value}
      </div>
      {sub && <div className="text-3xs text-text-dim mt-1">{sub}</div>}
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
      {label && <span className="text-2xs text-text-dim shrink-0">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg-cell border border-border/60 text-xs text-text-primary px-2 py-1 rounded-sm
                   focus:outline-none focus:border-accent-teal/40 focus:ring-1 focus:ring-accent-teal/10
                   cursor-pointer transition-colors hover:border-border-bright appearance-none
                   bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M3%204.5l3%203%203-3%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%221.5%22%2F%3E%3C%2Fsvg%3E')]
                   bg-[length:12px_12px] bg-[right_6px_center] bg-no-repeat pr-6"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
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
      {label && <span className="text-2xs text-text-dim shrink-0">{label}</span>}
      <div className="relative w-28 h-5 flex items-center">
        <div className="absolute h-[3px] w-full bg-border/80 rounded-full" />
        <div className="absolute h-[3px] rounded-full bg-accent-teal/40"
          style={{ width: `${((value - min) / (max - min)) * 100}%` }} />
        <input
          type="range" value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={min} max={max} step={step}
          className="absolute w-full h-5 opacity-0 cursor-pointer z-10"
        />
        <div className="absolute w-3 h-3 bg-accent-teal rounded-full shadow-glow-teal pointer-events-none border border-accent-teal/50"
          style={{ left: `calc(${((value - min) / (max - min)) * 100}% - 6px)` }} />
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
    primary: 'bg-accent-teal/10 text-accent-teal border border-accent-teal/25 hover:bg-accent-teal/20 hover:border-accent-teal/40 active:bg-accent-teal/25',
    secondary: 'bg-bg-cell text-text-secondary border border-border hover:bg-bg-hover hover:text-text-primary active:bg-bg-cell',
    ghost: 'text-text-muted hover:text-text-secondary hover:bg-bg-hover active:bg-bg-cell border border-transparent',
    danger: 'bg-down/10 text-down border border-down/25 hover:bg-down/20 active:bg-down/25',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-medium transition-all duration-150 rounded-sm
        disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none
        ${sizes[size]} ${variants[variant]} ${className}`}
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
    <span className={`inline-flex items-center px-1.5 py-0.5 text-3xs font-medium border rounded-sm ${colors[color]} ${className}`}>
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
