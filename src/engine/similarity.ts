// Port of notebook §5.2 — Analogue Matching Engine

import { cosine } from '@/lib/math';
import { EVENTS, EVENT_TAGS, MACRO_CONTEXT, EventTag } from '@/config/events';
import { ANALOGUE_WEIGHTS, TRIGGER_ZSCORE_SIGMA, SIMILARITY_ASSET_POOL, POIS } from '@/config/engine';
import { poiRet, EventReturns } from './returns';

export interface AnalogueScore {
  event: string;
  composite: number;
  quant: number;     // path-based quant
  quant_pt: number;  // point-in-time quant
  tag: number;
  macro: number;
}

export function tagSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  const union = new Set([...a, ...b]);
  const intersection = [...a].filter(x => b.has(x));
  return union.size > 0 ? intersection.length / union.size : 0;
}

export function macroSim(
  liveTriggerZ: number | null,
  liveCpi: string,
  liveFed: string,
  histContext: { trigger?: number; cpi?: string; fed?: string },
  histTriggerZ: number | null,
): number {
  let s = 0;

  // Trigger: Gaussian kernel on z-scores
  if (liveTriggerZ !== null && histTriggerZ !== null) {
    const sigma = TRIGGER_ZSCORE_SIGMA;
    const zSim = Math.exp(-0.5 * ((liveTriggerZ - histTriggerZ) / sigma) ** 2);
    s += zSim * 0.40;
  }

  // CPI regime match
  if (liveCpi === (histContext.cpi || '')) s += 0.35;

  // Fed stance match
  if (liveFed === (histContext.fed || '')) s += 0.25;

  return s;
}

/**
 * Build a flat path vector from returns at each offset 0..dn for all assets.
 * Missing values filled with 0 so cosine is always defined.
 */
function pathVec(
  returnsDict: Record<string, Record<number, number>>,
  assets: string[],
  dn: number
): number[] {
  const offsets = Array.from({ length: dn + 1 }, (_, i) => i);
  const vecs: number[] = [];
  for (const a of assets) {
    const s = returnsDict[a];
    for (const o of offsets) {
      if (s && s[o] !== undefined) {
        vecs.push(s[o]);
      } else {
        vecs.push(0);
      }
    }
  }
  return vecs;
}

/**
 * Run full analogue matching against all historical events.
 * Port of notebook's run_analogue_match().
 */
export function runAnalogueMatch(
  eventReturns: EventReturns,
  liveReturns: Record<string, Record<number, number>>,
  liveTags: Set<string>,
  liveTriggerZ: number | null,
  liveCpi: string,
  liveFed: string,
  dayN: number,
  triggerZScores: Record<string, number>,
  weights = ANALOGUE_WEIGHTS,
  simAssets = SIMILARITY_ASSET_POOL,
): AnalogueScore[] {
  const dn = dayN;

  // Build live vectors
  const livePointVec = simAssets.map(a => {
    const s = liveReturns[a];
    if (!s) return NaN;
    // Find closest offset <= dn
    const offsets = Object.keys(s).map(Number).filter(o => Math.abs(o - dn) <= 2);
    if (offsets.length === 0) return NaN;
    const best = offsets.reduce((a, b) => Math.abs(a - dn) <= Math.abs(b - dn) ? a : b);
    return s[best];
  });

  const livePathVec = pathVec(liveReturns, simAssets, dn);

  const scores: AnalogueScore[] = [];

  // Filter sim assets to those with live data
  const livePool = simAssets.filter(a =>
    liveReturns[a] && Object.keys(liveReturns[a]).length > 0
  );

  for (const ev of EVENTS) {
    const en = ev.name;

    // Point-in-time quant — NaN-safe via cosine() which masks NaN pairs
    const histVec = simAssets.map(a => poiRet(eventReturns, a, en, dn));
    const q = (cosine(livePointVec, histVec) + 1) / 2;

    // Path-based quant — use only assets with data on BOTH sides
    const sharedAssets = livePool.filter(a => {
      const hist = eventReturns[a]?.[en];
      return hist && Object.keys(hist).length > 0;
    });

    let pq = 0.5; // neutral default
    if (sharedAssets.length >= 2) {
      const livePathShared = pathVec(liveReturns, sharedAssets, dn);
      const histPathDict: Record<string, Record<number, number>> = {};
      for (const a of sharedAssets) {
        histPathDict[a] = eventReturns[a][en];
      }
      const histPathShared = pathVec(histPathDict, sharedAssets, dn);
      pq = (cosine(livePathShared, histPathShared) + 1) / 2;
    }

    // Tag similarity
    const t = tagSim(liveTags, EVENT_TAGS[en] || new Set());

    // Macro similarity
    const m = macroSim(
      liveTriggerZ,
      liveCpi,
      liveFed,
      MACRO_CONTEXT[en] || {},
      triggerZScores[en] ?? null,
    );

    // Normalize weights
    const ws = weights.quant + weights.tag + weights.macro;
    const wq = ws > 0 ? weights.quant / ws : 0.33;
    const wt = ws > 0 ? weights.tag / ws : 0.33;
    const wm = ws > 0 ? weights.macro / ws : 0.34;

    const comp = wq * pq + wt * t + wm * m;

    scores.push({
      event: en,
      composite: comp,
      quant: pq,
      quant_pt: q,
      tag: t,
      macro: m,
    });
  }

  scores.sort((a, b) => b.composite - a.composite);
  return scores;
}

/**
 * Filter events by score cutoff
 */
export function selectEvents(scores: AnalogueScore[], cutoff: number): string[] {
  const sel = scores.filter(s => s.composite >= cutoff).map(s => s.event);
  return sel.length > 0 ? sel : scores.map(s => s.event);
}

/**
 * Compute weighted composite return path
 */
export function compositeReturn(
  eventReturns: EventReturns,
  label: string,
  selectedEvents: string[],
  scores: AnalogueScore[]
): Record<number, number> | null {
  const scoreMap = new Map(scores.map(s => [s.event, s.composite]));
  const wv: Record<number, number> = {};
  const ws: Record<number, number> = {};

  for (const en of selectedEvents) {
    const series = eventReturns[label]?.[en];
    if (!series) continue;
    const w = scoreMap.get(en) || 0;
    for (const [offStr, val] of Object.entries(series)) {
      const off = parseInt(offStr);
      wv[off] = (wv[off] || 0) + val * w;
      ws[off] = (ws[off] || 0) + w;
    }
  }

  const result: Record<number, number> = {};
  for (const off of Object.keys(wv).map(Number)) {
    if (ws[off] > 0) result[off] = wv[off] / ws[off];
  }
  return Object.keys(result).length > 0 ? result : null;
}
