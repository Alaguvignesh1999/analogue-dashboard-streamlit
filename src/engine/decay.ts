// Port of notebook §5.12 — Signal Decay Tracker
// Computes analogue ranking at every day offset 0..day_n
// Uses path cosine similarity (B1) at each day offset snapshot.
//
// KEY DIFFERENCE FROM ANALOGUE MATCH (§5.2):
//   Decay uses ONLY path cosine similarity — no tag or macro scoring.
//   This is intentional: it tracks how the *market pattern* evolves,
//   not the composite analogue score.
//
// CRITICAL: sim assets are filtered to only those present in BOTH
// live returns and event_returns. Missing assets would produce zero
// vectors that dilute cosine similarity toward 0.5 (convergence bug).

import { cosine } from '@/lib/math';
import { EVENTS } from '@/config/events';
import { SIMILARITY_ASSET_POOL } from '@/config/engine';
import { EventReturns } from './returns';

export interface DecayPoint {
  offset: number;
  scores: { event: string; score: number }[];
  top1: string;
}

/**
 * Build path vector at a specific day offset for a set of returns.
 * Mirrors notebook's _path_vec_at() exactly:
 *   - For each asset, collect return at each offset 0..dn
 *   - Missing values: try ±1 tolerance, then 0.0
 *   - Concatenate all assets into one flat vector
 */
function pathVecAt(
  returnsDict: Record<string, Record<number, number>>,
  assets: string[],
  dn: number
): number[] {
  if (dn < 0) return new Array(assets.length).fill(0);
  const offsets = Array.from({ length: dn + 1 }, (_, i) => i);
  const vecs: number[] = [];
  for (const a of assets) {
    const s = returnsDict[a] || {};
    for (const o of offsets) {
      if (s[o] !== undefined) {
        vecs.push(s[o]);
      } else {
        // Nearest match within tolerance 1 (same as notebook)
        if (s[o - 1] !== undefined) {
          vecs.push(s[o - 1]);
        } else if (s[o + 1] !== undefined) {
          vecs.push(s[o + 1]);
        } else {
          vecs.push(0.0);
        }
      }
    }
  }
  return vecs;
}

/**
 * Compute analogue scores at a specific day offset.
 * Returns sorted by score descending.
 *
 * Uses full SIMILARITY_ASSET_POOL by default but safeguards:
 *   - Skips any asset missing from liveReturns
 *   - Per-event: only includes assets that have data in BOTH live AND historical
 *   - Never compares zero vectors (would give meaningless 0.5 scores)
 *
 * Future: toggle between full pool and user-selected sim assets from L1.
 */
export function decayScoresAt(
  eventReturns: EventReturns,
  liveReturns: Record<string, Record<number, number>>,
  dnTarget: number,
  simAssets?: string[],
): { event: string; score: number }[] {
  // Start with full pool, filter to assets that have live data
  const livePool = (simAssets || SIMILARITY_ASSET_POOL).filter(a =>
    liveReturns[a] && Object.keys(liveReturns[a]).length > 0
  );

  if (livePool.length < 2) return [];

  const scores: { event: string; score: number }[] = [];
  for (const ev of EVENTS) {
    // Per-event: find assets that have data on BOTH sides
    const sharedAssets = livePool.filter(a => {
      const hist = eventReturns[a]?.[ev.name];
      return hist && Object.keys(hist).length > 0;
    });

    if (sharedAssets.length < 2) {
      scores.push({ event: ev.name, score: 0 });
      continue;
    }

    // Build vectors using ONLY shared assets — no zero padding
    const livePath = pathVecAt(liveReturns, sharedAssets, dnTarget);

    const histDict: Record<string, Record<number, number>> = {};
    for (const a of sharedAssets) {
      histDict[a] = eventReturns[a][ev.name];
    }
    const histPath = pathVecAt(histDict, sharedAssets, dnTarget);

    // Cosine similarity normalized to [0, 1]
    // Matches notebook: pq = (_cosine(live_path, hist_path) + 1) / 2
    const pq = (cosine(livePath, histPath) + 1) / 2;
    scores.push({ event: ev.name, score: pq });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores;
}

/**
 * Build full decay timeline from Day 0 to maxDn.
 * Returns an array of DecayPoint, one per offset step.
 */
export function buildDecayTimeline(
  eventReturns: EventReturns,
  liveReturns: Record<string, Record<number, number>>,
  maxDn: number,
  step = 1,
  simAssets?: string[],
): DecayPoint[] {
  const timeline: DecayPoint[] = [];

  for (let dn = 0; dn <= maxDn; dn += Math.max(step, 1)) {
    const scores = decayScoresAt(eventReturns, liveReturns, dn, simAssets);
    timeline.push({
      offset: dn,
      scores,
      top1: scores.length > 0 ? scores[0].event : '',
    });
  }

  return timeline;
}

/**
 * Extract score timeline for a specific event across all offsets.
 */
export function eventScoreTimeline(
  timeline: DecayPoint[],
  eventName: string
): [number, number][] {
  return timeline.map(dp => {
    const s = dp.scores.find(s => s.event === eventName);
    return [dp.offset, s?.score ?? 0] as [number, number];
  });
}

/**
 * Extract rank timeline for a specific event.
 * Returns [offset, rank][] pairs (1-indexed).
 */
export function eventRankTimeline(
  timeline: DecayPoint[],
  eventName: string
): [number, number][] {
  return timeline.map(dp => {
    const rank = dp.scores.findIndex(s => s.event === eventName) + 1;
    return [dp.offset, rank || dp.scores.length] as [number, number];
  });
}

/**
 * Get dominant analogue segments (where top1 changes).
 */
export function dominantSegments(
  timeline: DecayPoint[]
): { event: string; start: number; end: number }[] {
  if (timeline.length === 0) return [];

  const segments: { event: string; start: number; end: number }[] = [];
  let current = timeline[0].top1;
  let start = timeline[0].offset;

  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i].top1 !== current) {
      segments.push({ event: current, start, end: timeline[i].offset });
      current = timeline[i].top1;
      start = timeline[i].offset;
    }
  }
  segments.push({ event: current, start, end: timeline[timeline.length - 1].offset });

  return segments;
}
