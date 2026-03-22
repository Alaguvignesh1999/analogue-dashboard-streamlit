import { AvailabilityWindow } from '@/config/availability';

export interface AssetMeta {
  ticker: string;
  class: string;
  source: 'yf' | 'fred';
  invert: boolean;
  is_rates_bp: boolean;
  display_label: string;
}

export type EventReturns = Record<string, Record<string, Record<number, number>>>;
export type AnchorMode = 'raw' | 'day0' | 'stepin';

export function normalizeLabel(label: string): string {
  return label
    .replace(/Ã¢â‚¬Â /g, '†')
    .replace(/Ã¢â€ â€™/g, '->')
    .replace(/Ã¢â€“Â¶/g, '▶')
    .replace(/Ã¢â‚¬Â¦/g, '...')
    .replace(/Ã‚Â±/g, '±')
    .replace(/Ã‚Â·/g, '·')
    .replace(/ÃŽâ€|Î”/g, 'Δ');
}

export function getSeriesValue(
  series: Record<number, number> | undefined,
  offset: number,
  tolerance = 0
): number | null {
  if (!series) return null;
  if (series[offset] !== undefined) return series[offset];
  for (let distance = 1; distance <= tolerance; distance += 1) {
    if (series[offset + distance] !== undefined) return series[offset + distance];
    if (series[offset - distance] !== undefined) return series[offset - distance];
  }
  return null;
}

export function poiRet(
  eventReturns: EventReturns,
  label: string,
  eventName: string,
  offset: number,
  tolerance = 2
): number {
  const value = getSeriesValue(eventReturns[label]?.[eventName], offset, tolerance);
  return value === null ? Number.NaN : value;
}

export function anchorSeriesValue(
  series: Record<number, number> | undefined,
  offset: number,
  mode: AnchorMode,
  stepDay = 0,
  tolerance = 0
): number | null {
  const value = getSeriesValue(series, offset, tolerance);
  if (value === null) return null;
  if (mode === 'raw') return value;

  const anchorOffset = mode === 'day0' ? 0 : stepDay;
  const anchorValue = getSeriesValue(series, anchorOffset, tolerance);
  if (anchorValue === null) return null;
  return value - anchorValue;
}

export function isSparsePoiSeries(series: Record<number, number> | undefined): boolean {
  if (!series) return false;
  const offsets = Object.keys(series).map(Number);
  const poiOffsets = new Set([-21, -5, 0, 5, 21, 63]);
  return offsets.length > 0 && offsets.every((offset) => poiOffsets.has(offset));
}

export function getReturnSeries(
  eventReturns: EventReturns,
  label: string,
  eventName: string
): [number, number][] {
  const series = eventReturns[label]?.[eventName];
  if (!series) return [];
  return Object.entries(series)
    .map(([offset, value]) => [parseInt(offset, 10), value] as [number, number])
    .sort((left, right) => left[0] - right[0]);
}

export function unitLabel(meta: AssetMeta | undefined): string {
  return meta?.is_rates_bp ? 'Δbps' : '%';
}

export function displayLabel(meta: AssetMeta | undefined, label: string): string {
  return normalizeLabel(meta?.display_label || label);
}

export function getSeriesOffsets(
  eventReturns: EventReturns,
  label: string,
  eventName: string
): number[] {
  const series = eventReturns[label]?.[eventName];
  if (!series) return [];
  return Object.keys(series).map(Number).sort((left, right) => left - right);
}

export function reindexSeries(series: Record<number, number>, offsets: number[]): Array<number | null> {
  return offsets.map((offset) => series[offset] ?? null);
}

export function eventDateMap(events: { name: string; date: string }[]): Record<string, string> {
  return Object.fromEntries(events.map((event) => [event.name, event.date]));
}

export function isAssetAvailableForEvent(
  label: string,
  eventDate: string,
  availability: Record<string, AvailabilityWindow> | undefined
): boolean {
  const window = availability?.[label];
  if (!window?.startDate) return true;
  return window.startDate <= eventDate;
}
