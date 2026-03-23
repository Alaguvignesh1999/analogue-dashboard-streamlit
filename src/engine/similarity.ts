import { cosine } from '@/lib/math';
import { EVENTS, EVENT_TAGS, MACRO_CONTEXT, EventDef, MacroContext } from '@/config/events';
import { ANALOGUE_WEIGHTS, TRIGGER_ZSCORE_SIGMA, SIMILARITY_ASSET_POOL } from '@/config/engine';
import { poiRet, EventReturns } from './returns';

export interface AnalogueScore {
  event: string;
  composite: number;
  rawComposite: number;
  quant: number;
  quant_pt: number;
  tag: number;
  macro: number;
  sharedAssetCount: number;
  coverageRatio: number;
  sparsePenalty: number;
  confidenceLabel: 'high' | 'medium' | 'thin';
}

interface RunAnalogueMatchOptions {
  weights?: typeof ANALOGUE_WEIGHTS;
  simAssets?: string[];
  events?: EventDef[];
  eventTags?: Record<string, Set<string>>;
  macroContext?: Record<string, MacroContext>;
}

const MIN_SHARED_ASSETS = 3;
const NORMAL_COVERAGE_RATIO = 0.5;

export function coveragePenalty(sharedAssetCount: number, requestedAssetCount: number): {
  coverageRatio: number;
  sparsePenalty: number;
  confidenceLabel: 'high' | 'medium' | 'thin';
} {
  if (requestedAssetCount <= 0) {
    return { coverageRatio: 0, sparsePenalty: 0.35, confidenceLabel: 'thin' };
  }

  const coverageRatio = sharedAssetCount / requestedAssetCount;
  const ratioPenalty = Math.max(0.35, Math.min(1, coverageRatio / NORMAL_COVERAGE_RATIO));
  const floorPenalty = sharedAssetCount >= MIN_SHARED_ASSETS
    ? 1
    : Math.max(0.25, sharedAssetCount / MIN_SHARED_ASSETS);
  const sparsePenalty = Math.min(1, ratioPenalty * floorPenalty);

  let confidenceLabel: 'high' | 'medium' | 'thin' = 'thin';
  if (sharedAssetCount >= Math.max(MIN_SHARED_ASSETS + 2, Math.ceil(requestedAssetCount * 0.75))) {
    confidenceLabel = 'high';
  } else if (sharedAssetCount >= MIN_SHARED_ASSETS && coverageRatio >= 0.4) {
    confidenceLabel = 'medium';
  }

  return { coverageRatio, sparsePenalty, confidenceLabel };
}

export function tagSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const union = new Set([...a, ...b]);
  const intersection = [...a].filter((value) => b.has(value));
  return union.size > 0 ? intersection.length / union.size : 0;
}

export function macroSim(
  liveTriggerZ: number | null,
  liveCpi: string,
  liveFed: string,
  historicalContext: { trigger?: number; cpi?: string; fed?: string },
  historicalTriggerZ: number | null,
): number {
  let score = 0;

  if (liveTriggerZ !== null && historicalTriggerZ !== null) {
    const sigma = TRIGGER_ZSCORE_SIGMA;
    const triggerScore = Math.exp(-0.5 * ((liveTriggerZ - historicalTriggerZ) / sigma) ** 2);
    score += triggerScore * 0.4;
  }

  if (liveCpi === (historicalContext.cpi || '')) score += 0.35;
  if (liveFed === (historicalContext.fed || '')) score += 0.25;

  return score;
}

function nearestValueAtOrBefore(
  series: Record<number, number> | undefined,
  targetOffset: number,
  tolerance: number,
): number {
  if (!series) return Number.NaN;
  const offsets = Object.keys(series)
    .map(Number)
    .filter((offset) => Math.abs(offset - targetOffset) <= tolerance)
    .sort((left, right) => left - right);
  if (offsets.length === 0) return Number.NaN;
  const below = offsets.filter((offset) => offset <= targetOffset);
  const bestOffset = below.length > 0 ? below[below.length - 1] : offsets[0];
  return series[bestOffset];
}

function pathVec(
  returnsByAsset: Record<string, Record<number, number>>,
  assets: string[],
  dayN: number,
): number[] {
  const offsets = Array.from({ length: dayN + 1 }, (_, index) => index);
  const vector: number[] = [];

  for (const asset of assets) {
    const series = returnsByAsset[asset];
    for (const offset of offsets) {
      const value = nearestValueAtOrBefore(series, offset, 1);
      vector.push(Number.isNaN(value) ? 0 : value);
    }
  }

  return vector;
}

export function runAnalogueMatch(
  eventReturns: EventReturns,
  liveReturns: Record<string, Record<number, number>>,
  liveTags: Set<string>,
  liveTriggerZ: number | null,
  liveCpi: string,
  liveFed: string,
  dayN: number,
  triggerZScores: Record<string, number>,
  options: RunAnalogueMatchOptions = {},
): AnalogueScore[] {
  const events = options.events || EVENTS;
  const eventTags = options.eventTags || EVENT_TAGS;
  const macroContext = options.macroContext || MACRO_CONTEXT;
  const simAssets = options.simAssets || SIMILARITY_ASSET_POOL;
  const weights = options.weights || ANALOGUE_WEIGHTS;
  const livePool = simAssets.filter((asset) => liveReturns[asset] && Object.keys(liveReturns[asset]).length > 0);
  const availableLiveOffsets = new Set<number>();

  for (const asset of livePool) {
    for (const offset of Object.keys(liveReturns[asset]).map(Number)) {
      availableLiveOffsets.add(offset);
    }
  }

  const scoringDayN = availableLiveOffsets.size > 0
    ? Math.min(dayN, Math.max(...Array.from(availableLiveOffsets)))
    : dayN;

  const livePointVec = simAssets.map((asset) => nearestValueAtOrBefore(liveReturns[asset], scoringDayN, 2));
  const weightSum = weights.quant + weights.tag + weights.macro;
  const normalizedWeights = weightSum > 0
    ? {
        quant: weights.quant / weightSum,
        tag: weights.tag / weightSum,
        macro: weights.macro / weightSum,
      }
    : { ...ANALOGUE_WEIGHTS };

  const scores: AnalogueScore[] = [];

  for (const event of events) {
    const eventName = event.name;
    const histPointVec = simAssets.map((asset) => poiRet(eventReturns, asset, eventName, scoringDayN));
    const quantPoint = (cosine(livePointVec, histPointVec) + 1) / 2;

    const sharedAssets = livePool.filter((asset) => {
      const hist = eventReturns[asset]?.[eventName];
      return hist && Object.keys(hist).length > 0;
    });

    const livePathVec = pathVec(liveReturns, simAssets, scoringDayN);
    const historicalPathDict: Record<string, Record<number, number>> = {};
    for (const asset of simAssets) {
      const series = eventReturns[asset]?.[eventName];
      if (series) {
        historicalPathDict[asset] = series;
      }
    }
    const histPathVec = pathVec(historicalPathDict, simAssets, scoringDayN);
    const quantPath = (cosine(livePathVec, histPathVec) + 1) / 2;

    const tag = tagSim(liveTags, eventTags[eventName] || new Set());
    const macro = macroSim(
      liveTriggerZ,
      liveCpi,
      liveFed,
      macroContext[eventName] || {},
      triggerZScores[eventName] ?? null,
    );

    const rawComposite =
      normalizedWeights.quant * quantPath +
      normalizedWeights.tag * tag +
      normalizedWeights.macro * macro;
    const coverage = coveragePenalty(sharedAssets.length, livePool.length);
    const composite = rawComposite * coverage.sparsePenalty;

    scores.push({
      event: eventName,
      composite,
      rawComposite,
      quant: quantPath,
      quant_pt: quantPoint,
      tag,
      macro,
      sharedAssetCount: sharedAssets.length,
      coverageRatio: coverage.coverageRatio,
      sparsePenalty: coverage.sparsePenalty,
      confidenceLabel: coverage.confidenceLabel,
    });
  }

  scores.sort((left, right) => right.composite - left.composite);
  return scores;
}

export function selectEvents(scores: AnalogueScore[], cutoff: number): string[] {
  const selected = scores.filter((score) => score.composite >= cutoff).map((score) => score.event);
  return selected.length > 0 ? selected : scores.map((score) => score.event);
}

export function filterScoresByActiveEvents(
  scores: AnalogueScore[],
  activeEvents: Set<string>,
): AnalogueScore[] {
  return scores.filter((score) => activeEvents.has(score.event));
}

export function compositeReturn(
  eventReturns: EventReturns,
  label: string,
  selectedEvents: string[],
  scores: AnalogueScore[]
): Record<number, number> | null {
  const scoreMap = new Map(scores.map((score) => [score.event, score.composite]));
  const weightedValues: Record<number, number> = {};
  const weightSums: Record<number, number> = {};

  for (const eventName of selectedEvents) {
    const series = eventReturns[label]?.[eventName];
    if (!series) continue;
    const weight = scoreMap.get(eventName) || 0;
    for (const [offsetStr, value] of Object.entries(series)) {
      const offset = parseInt(offsetStr, 10);
      weightedValues[offset] = (weightedValues[offset] || 0) + value * weight;
      weightSums[offset] = (weightSums[offset] || 0) + weight;
    }
  }

  const result: Record<number, number> = {};
  for (const offset of Object.keys(weightedValues).map(Number)) {
    if (weightSums[offset] > 0) {
      result[offset] = weightedValues[offset] / weightSums[offset];
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}
