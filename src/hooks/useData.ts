'use client';

import { useEffect } from 'react';
import { useDashboard } from '@/store/dashboard';
import { EventReturns, AssetMeta } from '@/engine/returns';

interface MetaJSON {
  asset_meta: Record<string, AssetMeta>;
  asset_order: string[];
  all_labels: string[];
  all_classes: string[];
  events: { name: string; date: string }[];
  event_tags: Record<string, string[]>;
  macro_context: Record<string, { trigger: number; cpi: string; fed: string }>;
}

async function loadJsonOrGzip(response: Response): Promise<any> {
  // First try parsing as plain JSON (server may auto-decompress gzip)
  const cloned = response.clone();
  try {
    const text = await cloned.text();
    return JSON.parse(text);
  } catch {
    // If that fails, try manual gzip decompression
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
    const combined = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder().decode(combined);
    return JSON.parse(text);
  } catch (err) {
    console.error('Gzip decompression also failed:', err);
    throw new Error('Could not parse event_returns data as JSON or gzip');
  }
}

function parseEventReturns(raw: Record<string, Record<string, Record<string, number>>>): EventReturns {
  const result: EventReturns = {};
  for (const [label, events] of Object.entries(raw)) {
    result[label] = {};
    for (const [evtName, offsets] of Object.entries(events)) {
      result[label][evtName] = {};
      for (const [offsetStr, value] of Object.entries(offsets)) {
        result[label][evtName][parseInt(offsetStr)] = value;
      }
    }
  }
  return result;
}

export function useDataLoader() {
  const { setData, setLoading, dataLoaded } = useDashboard();

  useEffect(() => {
    if (dataLoaded) return;
    
    async function load() {
      setLoading(true);
      console.log('📊 Loading dashboard data...');
      
      try {
        // Try loading .json.gz first, fall back to .json
        const metaRes = await fetch('/data/meta.json');
        if (!metaRes.ok) {
          throw new Error(`meta.json not found (${metaRes.status})`);
        }
        const meta: MetaJSON = await metaRes.json();
        console.log(`  ✅ meta.json: ${meta.all_labels.length} assets, ${meta.events.length} events`);

        // Try event_returns — could be .json.gz or .json
        let erRaw: any = null;
        
        // Try gzip first
        const erGzRes = await fetch('/data/event_returns.json.gz');
        if (erGzRes.ok) {
          console.log('  📦 Loading event_returns.json.gz...');
          erRaw = await loadJsonOrGzip(erGzRes);
          console.log(`  ✅ event_returns loaded (${Object.keys(erRaw).length} assets)`);
        }
        
        // Fall back to plain JSON
        if (!erRaw) {
          const erJsonRes = await fetch('/data/event_returns.json');
          if (erJsonRes.ok) {
            console.log('  📄 Loading event_returns.json...');
            erRaw = await erJsonRes.json();
            console.log(`  ✅ event_returns loaded (${Object.keys(erRaw).length} assets)`);
          }
        }
        
        if (!erRaw) {
          throw new Error('Neither event_returns.json.gz nor event_returns.json found');
        }

        // Trigger z-scores
        let triggerZScores: Record<string, number> = {};
        try {
          const zsRes = await fetch('/data/trigger_zscores.json');
          if (zsRes.ok) triggerZScores = await zsRes.json();
        } catch { /* optional */ }

        // Last updated
        let lastUpdated = { timestamp: 'unknown' };
        try {
          const updRes = await fetch('/data/last_updated.json');
          if (updRes.ok) lastUpdated = await updRes.json();
        } catch { /* optional */ }

        const eventReturns = parseEventReturns(erRaw);

        setData({
          eventReturns,
          assetMeta: meta.asset_meta,
          assetOrder: meta.asset_order,
          allLabels: meta.all_labels,
          allClasses: meta.all_classes,
          triggerZScores,
          lastUpdated: new Date(lastUpdated.timestamp).toLocaleDateString(),
        });

        console.log(`✅ Dashboard ready: ${meta.all_labels.length} assets × ${meta.events.length} events`);
      } catch (err) {
        console.error('❌ Data load failed:', err);
        setLoading(false);
      }
    }

    load();
  }, [dataLoaded, setData, setLoading]);
}
