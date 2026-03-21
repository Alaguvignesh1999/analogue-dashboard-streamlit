// Port of notebook §3.1 — event returns computation
// Operates on the pre-computed JSON data from GitHub Actions

import { POIS, PRE_WINDOW_TD, POST_WINDOW_TD } from '@/config/engine';

export interface AssetMeta {
  ticker: string;
  class: string;
  source: 'yf' | 'fred';
  invert: boolean;
  is_rates_bp: boolean;
  display_label: string;
}

// event_returns[assetLabel][eventName] = { offset: return }
export type EventReturns = Record<string, Record<string, Record<number, number>>>;

/**
 * Get return at a specific POI offset with tolerance matching.
 * Mirrors notebook's poi_ret(label, evt_name, offset, tol=2)
 */
export function poiRet(
  eventReturns: EventReturns,
  label: string,
  evtName: string,
  offset: number,
  tol = 2
): number {
  const assetData = eventReturns[label];
  if (!assetData) return NaN;
  const series = assetData[evtName];
  if (!series) return NaN;

  // Direct hit
  if (series[offset] !== undefined) return series[offset];

  // Tolerance search
  for (let d = 1; d <= tol; d++) {
    if (series[offset + d] !== undefined) return series[offset + d];
    if (series[offset - d] !== undefined) return series[offset - d];
  }
  return NaN;
}

/**
 * Get the full return series for an asset+event as sorted [offset, value] pairs
 */
export function getReturnSeries(
  eventReturns: EventReturns,
  label: string,
  evtName: string
): [number, number][] {
  const series = eventReturns[label]?.[evtName];
  if (!series) return [];
  return Object.entries(series)
    .map(([k, v]) => [parseInt(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Get unit label for an asset
 */
export function unitLabel(meta: AssetMeta | undefined): string {
  return meta?.is_rates_bp ? 'Δbps' : '%';
}

/**
 * Get display label for an asset
 */
export function displayLabel(meta: AssetMeta | undefined, label: string): string {
  return meta?.display_label || label;
}

/**
 * Get all offsets in a series
 */
export function getSeriesOffsets(
  eventReturns: EventReturns,
  label: string,
  evtName: string
): number[] {
  const series = eventReturns[label]?.[evtName];
  if (!series) return [];
  return Object.keys(series).map(Number).sort((a, b) => a - b);
}

/**
 * Interpolate series values at regular offsets (for chart plotting)
 */
export function reindexSeries(
  series: Record<number, number>,
  offsets: number[]
): (number | null)[] {
  return offsets.map(o => series[o] ?? null);
}
