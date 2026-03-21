'use client';

import { useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { AssetMeta, EventReturns, normalizeLabel } from '@/engine/returns';
import { AvailabilityWindow, FALLBACK_AVAILABILITY } from '@/config/availability';
import { DATA_SCHEMA_VERSION } from '@/config/engine';
import { DailyHistoryPayload } from '@/engine/types';
import { MacroContext } from '@/config/events';

interface MetaJSON {
  asset_meta: Record<string, AssetMeta>;
  asset_order: string[];
  all_labels: string[];
  all_classes: string[];
  events: { name: string; date: string }[];
  event_tags: Record<string, string[]>;
  macro_context: Record<string, { trigger: number; cpi: string; fed: string }>;
  availability?: Record<string, AvailabilityWindow>;
  schema_version?: number;
}

interface LastUpdatedJSON {
  timestamp?: string;
  as_of?: string;
  fred_failures?: string[];
  pipeline_mode?: string;
  schema_version?: number;
}

const REMOVED_ASSETS = new Set(['Euro HY OAS']);
const EVENT_NAME_ALIASES: Record<string, string> = {
  '1973 Oil Embargoâ€ ': '1973 Oil Embargo†',
  '2020 COVID-19 PHEIC': 'COVID-19',
};
const EVENT_DATE_OVERRIDES: Record<string, string> = {
  'COVID-19': '2020-03-01',
};
const FRED_FAILURE_LABELS: Record<string, string> = {
  BAMLHE00EHY0EY: 'Euro HY OAS',
};

function normalizeEventName(name: string): string {
  const normalized = normalizeLabel(name);
  return EVENT_NAME_ALIASES[normalized] || normalized;
}

async function loadJsonOrGzip(response: Response): Promise<any> {
  const cloned = response.clone();
  try {
    const text = await cloned.text();
    return JSON.parse(text);
  } catch {
    console.log('Plain JSON parse failed, trying gzip decompression...');
  }

  try {
    const blob = await response.blob();
    const ds = new DecompressionStream('gzip');
    const reader = blob.stream().pipeThrough(ds).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const combined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(combined));
  } catch (error) {
    console.error('Gzip decompression also failed:', error);
    throw new Error('Could not parse event_returns data as JSON or gzip');
  }
}

function parseEventReturns(raw: Record<string, Record<string, Record<string, number>>>): EventReturns {
  const result: EventReturns = {};
  for (const [label, events] of Object.entries(raw)) {
    const normalizedLabel = normalizeLabel(label);
    result[normalizedLabel] = {};
    for (const [eventName, offsets] of Object.entries(events)) {
      const normalizedEventName = normalizeEventName(eventName);
      result[normalizedLabel][normalizedEventName] = {};
      for (const [offsetStr, value] of Object.entries(offsets)) {
        result[normalizedLabel][normalizedEventName][parseInt(offsetStr, 10)] = value;
      }
    }
  }
  return result;
}

function normalizeAssetMeta(assetMeta: Record<string, AssetMeta>): Record<string, AssetMeta> {
  return Object.fromEntries(
    Object.entries(assetMeta).map(([label, meta]) => {
      const normalizedLabel = normalizeLabel(label);
      if (REMOVED_ASSETS.has(normalizedLabel)) {
        return null;
      }
      return [
        normalizedLabel,
        {
          ...meta,
          ticker: normalizeLabel(meta.ticker),
          class: normalizeLabel(meta.class),
          display_label: normalizeLabel(meta.display_label || normalizedLabel),
        },
      ];
    }).filter(Boolean) as Array<[string, AssetMeta]>
  );
}

function normalizeEventTags(eventTags: Record<string, string[]>): Record<string, Set<string>> {
  return Object.fromEntries(
    Object.entries(eventTags).map(([eventName, tags]) => [
      normalizeEventName(eventName),
      new Set(tags.map((tag) => normalizeLabel(tag))),
    ])
  );
}

function normalizeMacroContext(meta: MetaJSON['macro_context']): Record<string, MacroContext> {
  return Object.fromEntries(
    Object.entries(meta).map(([eventName, context]) => [
      normalizeEventName(eventName),
      {
        trigger: context.trigger,
        cpi: (context.cpi === 'high' || context.cpi === 'mid' || context.cpi === 'low') ? context.cpi : 'mid',
        fed: (context.fed === 'hiking' || context.fed === 'cutting' || context.fed === 'hold') ? context.fed : 'hold',
      },
    ])
  );
}

function deriveAvailability(
  labels: string[],
  explicitAvailability: Record<string, AvailabilityWindow> | undefined
): Record<string, AvailabilityWindow> {
  const normalizedExplicit = Object.fromEntries(
    Object.entries(explicitAvailability || {}).map(([label, window]) => [normalizeLabel(label), window])
  );

  return Object.fromEntries(
    labels.map((label) => [
      label,
      normalizedExplicit[label] || FALLBACK_AVAILABILITY[label] || { startDate: null, endDate: null },
    ])
  );
}

async function tryLoadOptionalJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function tryLoadOptionalGzipJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return await loadJsonOrGzip(response);
  } catch {
    return null;
  }
}

export function useDataLoader() {
  const { setData, setLoading, setDailyHistory, hydrateCustomEvents, dataLoaded } = useDashboard();

  useEffect(() => {
    if (dataLoaded) return;

    async function load() {
      setLoading(true);
      console.log('Loading dashboard data...');

      try {
        const metaRes = await fetch('/data/meta.json');
        if (!metaRes.ok) {
          throw new Error(`meta.json not found (${metaRes.status})`);
        }
        const meta: MetaJSON = await metaRes.json();
        console.log(`Loaded meta.json: ${meta.all_labels.length} assets, ${meta.events.length} events`);

        let erRaw: Record<string, Record<string, Record<string, number>>> | null = null;

        const erGzip = await tryLoadOptionalGzipJson<Record<string, Record<string, Record<string, number>>>>('/data/event_returns.json.gz');
        if (erGzip) {
          erRaw = erGzip;
          console.log(`Loaded event_returns.json.gz for ${Object.keys(erGzip).length} assets`);
        }

        if (!erRaw) {
          erRaw = await tryLoadOptionalJson<Record<string, Record<string, Record<string, number>>>>('/data/event_returns.json');
          if (erRaw) {
            console.log(`Loaded event_returns.json for ${Object.keys(erRaw).length} assets`);
          }
        }

        if (!erRaw) {
          throw new Error('Neither event_returns.json.gz nor event_returns.json was available');
        }

        const rawTriggerZScores =
          (await tryLoadOptionalJson<Record<string, number>>('/data/trigger_zscores.json')) || {};
        const triggerZScores = Object.fromEntries(
          Object.entries(rawTriggerZScores).map(([eventName, value]) => [normalizeEventName(eventName), Number(value)])
        );

        const lastUpdated: LastUpdatedJSON =
          (await tryLoadOptionalJson<LastUpdatedJSON>('/data/last_updated.json')) || {};

        const dailyHistory =
          (await tryLoadOptionalJson<DailyHistoryPayload>('/data/daily_history.json')) ||
          (await tryLoadOptionalGzipJson<DailyHistoryPayload>('/data/daily_history.json.gz'));

        const eventReturns = parseEventReturns(erRaw);
        const assetMeta = normalizeAssetMeta(meta.asset_meta);
        const events = meta.events
          .map((event) => ({
            name: normalizeEventName(event.name),
            date: EVENT_DATE_OVERRIDES[normalizeEventName(event.name)] || event.date,
          }))
          .sort((left, right) => left.date.localeCompare(right.date));
        const removedByFailure = new Set((lastUpdated.fred_failures || []).map((seriesId) => FRED_FAILURE_LABELS[seriesId]).filter(Boolean));
        const excludedAssets = new Set([...Array.from(REMOVED_ASSETS), ...Array.from(removedByFailure)]);
        const allLabels = meta.all_labels.map((label) => normalizeLabel(label)).filter((label) => !excludedAssets.has(label));
        const assetOrder = meta.asset_order.map((label) => normalizeLabel(label)).filter((label) => !excludedAssets.has(label));
        const allClasses = meta.all_classes.map((label) => normalizeLabel(label));
        const eventTags = normalizeEventTags(meta.event_tags);
        const macroContext = normalizeMacroContext(meta.macro_context);
        const availability = deriveAvailability(allLabels, meta.availability || dailyHistory?.availability);
        const warnings = [
          ...(lastUpdated.fred_failures?.length
            ? [`FRED partial failure: ${lastUpdated.fred_failures.join(', ')}`]
            : []),
          ...(lastUpdated.pipeline_mode === 'sample' ? ['Historical data source: sample artifacts'] : []),
        ];
        for (const label of excludedAssets) {
          delete assetMeta[label];
          delete eventReturns[label];
          delete availability[label];
        }

        setDailyHistory(dailyHistory);
        setData({
          eventReturns,
          assetMeta,
          assetOrder,
          allLabels,
          allClasses,
          triggerZScores,
          lastUpdated: lastUpdated.timestamp
            ? new Date(lastUpdated.timestamp).toLocaleDateString()
            : 'Unknown',
          historicalAsOf: lastUpdated.as_of || lastUpdated.timestamp || dailyHistory?.asOf || null,
          events,
          eventTags,
          macroContext,
          availability,
          warnings,
          schemaVersion:
            meta.schema_version ||
            lastUpdated.schema_version ||
            dailyHistory?.schemaVersion ||
            DATA_SCHEMA_VERSION,
        });
        hydrateCustomEvents();

        console.log(`Dashboard ready: ${allLabels.length} assets x ${events.length} events`);
      } catch (error) {
        console.error('Data load failed:', error);
        setLoading(false);
      }
    }

    load();
  }, [dataLoaded, hydrateCustomEvents, setDailyHistory, setData, setLoading]);
}
