export function fmtPct(v: number, decimals = 1): string {
  if (isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`;
}

export function fmtBps(v: number, decimals = 0): string {
  if (isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}bp`;
}

export function fmtReturn(v: number, isRates: boolean, decimals = 1): string {
  if (isNaN(v)) return '—';
  const prefix = v >= 0 ? '+' : '';
  const unit = isRates ? 'bp' : '%';
  return `${prefix}${v.toFixed(decimals)}${unit}`;
}

export function fmtDollar(v: number): string {
  if (isNaN(v)) return '—';
  const abs = Math.abs(v);
  const sign = v >= 0 ? '' : '-';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtNumber(v: number, decimals = 2): string {
  if (isNaN(v)) return '—';
  return v.toFixed(decimals);
}

export function stars(iqr: number, med: number): string {
  if (Math.abs(med) < 0.01) return '☆☆☆☆☆';
  const r = iqr / (Math.abs(med) + 1e-9);
  if (r < 0.40) return '★★★★★';
  if (r < 0.70) return '★★★★☆';
  if (r < 1.00) return '★★★☆☆';
  if (r < 1.50) return '★★☆☆☆';
  return '★☆☆☆☆';
}

export function entrySignal(pctile: number | null): { label: string; color: string; bg: string } {
  if (pctile === null || isNaN(pctile)) return { label: '⚪ N/A', color: '#71717a', bg: 'rgba(80,80,80,0.2)' };
  if (pctile < 33) return { label: '🟢 ENTER', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
  if (pctile < 66) return { label: '🟡 HALF', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
  if (pctile < 85) return { label: '🟠 LATE', color: '#f97316', bg: 'rgba(249,115,22,0.15)' };
  return { label: '🔴 SKIP', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
}

export function statusFromPctile(pctile: number | null): string {
  if (pctile === null || isNaN(pctile)) return '—';
  if (pctile < 25) return '🟢 Still open';
  if (pctile < 50) return '🟡 On track';
  if (pctile < 75) return '🟠 Chasing';
  return '🔴 Extended';
}
