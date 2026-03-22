import { cosine } from '@/lib/math';
import { EVENTS } from '@/config/events';
import { SIMILARITY_ASSET_POOL } from '@/config/engine';
import { EventReturns } from './returns';
import { getSeriesPointAtOrBefore } from './live';

export interface DecayPoint {
  offset: number;
  scores: { event: string; score: number }[];
  top1: string;
}

function pathVecAt(
  returnsDict: Record<string, Record<number, number>>,
  assets: string[],
  dn: number,
): number[] {
  if (dn < 0) return [];

  const offsets = Array.from({ length: dn + 1 }, (_, i) => i);
  const vecs: number[] = [];

  for (const asset of assets) {
    const series = returnsDict[asset] || {};
    for (const offset of offsets) {
      const point = getSeriesPointAtOrBefore(series, offset);
      vecs.push(point ? point.value : Number.NaN);
    }
  }

  return vecs;
}

export function decayScoresAt(
  eventReturns: EventReturns,
  liveReturns: Record<string, Record<number, number>>,
  dnTarget: number,
  simAssets?: string[],
): { event: string; score: number }[] {
  const livePool = (simAssets || SIMILARITY_ASSET_POOL).filter(
    (asset) => liveReturns[asset] && Object.keys(liveReturns[asset]).length > 0,
  );

  if (livePool.length < 2) return [];

  const livePath = pathVecAt(liveReturns, livePool, dnTarget);
  const scores: { event: string; score: number }[] = [];

  for (const event of EVENTS) {
    const histDict: Record<string, Record<number, number>> = {};
    for (const asset of livePool) {
      const hist = eventReturns[asset]?.[event.name];
      if (hist && Object.keys(hist).length > 0) {
        histDict[asset] = hist;
      }
    }

    const histPath = pathVecAt(histDict, livePool, dnTarget);
    const score = (cosine(livePath, histPath) + 1) / 2;
    scores.push({ event: event.name, score });
  }

  scores.sort((left, right) => right.score - left.score);
  return scores;
}

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

export function eventScoreTimeline(
  timeline: DecayPoint[],
  eventName: string,
): [number, number | null][] {
  return timeline.map((point) => {
    const score = point.scores.find((item) => item.event === eventName);
    return [point.offset, score?.score ?? null] as [number, number | null];
  });
}

export function eventRankTimeline(
  timeline: DecayPoint[],
  eventName: string,
): [number, number | null][] {
  return timeline.map((point) => {
    const rank = point.scores.findIndex((item) => item.event === eventName) + 1;
    return [point.offset, rank || null] as [number, number | null];
  });
}

export function dominantSegments(
  timeline: DecayPoint[],
): { event: string; start: number; end: number }[] {
  if (timeline.length === 0) return [];

  const segments: { event: string; start: number; end: number }[] = [];
  let current = timeline[0].top1;
  let start = timeline[0].offset;

  for (let i = 1; i < timeline.length; i += 1) {
    if (timeline[i].top1 !== current) {
      segments.push({ event: current, start, end: timeline[i].offset });
      current = timeline[i].top1;
      start = timeline[i].offset;
    }
  }

  segments.push({ event: current, start, end: timeline[timeline.length - 1].offset });
  return segments;
}
