from __future__ import annotations

import math

from config.defaults import ANALOGUE_WEIGHTS, SIMILARITY_ASSET_POOL, TRIGGER_ZSCORE_SIGMA
from config.events import EVENT_TAGS, EVENTS, MACRO_CONTEXT
from engine.math_utils import cosine
from engine.models import AnalogueScore, EventDef, EventReturns, MacroContext
from engine.returns import poi_ret


MIN_SHARED_ASSETS = 3
NORMAL_COVERAGE_RATIO = 0.5


def coverage_penalty(shared_asset_count: int, requested_asset_count: int) -> tuple[float, float, str]:
    if requested_asset_count <= 0:
        return 0.0, 0.35, "thin"
    coverage_ratio = shared_asset_count / requested_asset_count
    ratio_penalty = max(0.35, min(1.0, coverage_ratio / NORMAL_COVERAGE_RATIO))
    floor_penalty = 1.0 if shared_asset_count >= MIN_SHARED_ASSETS else max(0.25, shared_asset_count / MIN_SHARED_ASSETS)
    sparse_penalty = min(1.0, ratio_penalty * floor_penalty)
    confidence = "thin"
    if shared_asset_count >= max(MIN_SHARED_ASSETS + 2, math.ceil(requested_asset_count * 0.75)):
        confidence = "high"
    elif shared_asset_count >= MIN_SHARED_ASSETS and coverage_ratio >= 0.4:
        confidence = "medium"
    return coverage_ratio, sparse_penalty, confidence


def tag_sim(left: set[str], right: set[str]) -> float:
    if not left and not right:
        return 1.0
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def macro_sim(
    live_trigger_z: float | None,
    live_cpi: str,
    live_fed: str,
    historical_context: MacroContext | dict,
    historical_trigger_z: float | None,
) -> float:
    score = 0.0
    historical_cpi = historical_context.cpi if isinstance(historical_context, MacroContext) else historical_context.get("cpi", "")
    historical_fed = historical_context.fed if isinstance(historical_context, MacroContext) else historical_context.get("fed", "")
    if live_trigger_z is not None and historical_trigger_z is not None:
        trigger_score = math.exp(-0.5 * ((live_trigger_z - historical_trigger_z) / TRIGGER_ZSCORE_SIGMA) ** 2)
        score += trigger_score * 0.4
    if live_cpi == historical_cpi:
        score += 0.35
    if live_fed == historical_fed:
        score += 0.25
    return score


def nearest_value_at_or_before(series: dict[int, float] | None, target_offset: int, tolerance: int) -> float:
    if not series:
        return math.nan
    offsets = sorted(offset for offset in series if abs(offset - target_offset) <= tolerance)
    if not offsets:
        return math.nan
    below = [offset for offset in offsets if offset <= target_offset]
    best = below[-1] if below else offsets[0]
    return series[best]


def path_vec(returns_by_asset: dict[str, dict[int, float]], assets: list[str], day_n: int) -> list[float]:
    vector: list[float] = []
    for asset in assets:
        series = returns_by_asset.get(asset)
        for offset in range(day_n + 1):
            value = nearest_value_at_or_before(series, offset, 1)
            vector.append(0.0 if math.isnan(value) else value)
    return vector


def run_analogue_match(
    event_returns: EventReturns,
    live_returns: dict[str, dict[int, float]],
    live_tags: set[str],
    live_trigger_z: float | None,
    live_cpi: str,
    live_fed: str,
    day_n: int,
    trigger_z_scores: dict[str, float],
    *,
    weights: dict[str, float] | None = None,
    sim_assets: list[str] | None = None,
    events: list[EventDef] | None = None,
    event_tags: dict[str, set[str]] | None = None,
    macro_context: dict[str, MacroContext] | None = None,
) -> list[AnalogueScore]:
    events = events or EVENTS
    event_tags = event_tags or EVENT_TAGS
    macro_context = macro_context or MACRO_CONTEXT
    sim_assets = sim_assets or SIMILARITY_ASSET_POOL
    weights = weights or ANALOGUE_WEIGHTS

    live_pool = [asset for asset in sim_assets if live_returns.get(asset)]
    available_offsets = {offset for asset in live_pool for offset in live_returns.get(asset, {})}
    scoring_day_n = min(day_n, max(available_offsets)) if available_offsets else day_n
    live_point_vec = [nearest_value_at_or_before(live_returns.get(asset), scoring_day_n, 2) for asset in sim_assets]

    weight_sum = sum(weights.values())
    normalized = {
        key: (value / weight_sum if weight_sum > 0 else ANALOGUE_WEIGHTS[key])
        for key, value in weights.items()
    }

    scores: list[AnalogueScore] = []
    for event in events:
        event_name = event.name
        hist_point_vec = [poi_ret(event_returns, asset, event_name, scoring_day_n) for asset in sim_assets]
        quant_point = (cosine(live_point_vec, hist_point_vec) + 1) / 2

        shared_assets = [
            asset
            for asset in live_pool
            if event_returns.get(asset, {}).get(event_name)
        ]
        live_path_vec = path_vec(live_returns, sim_assets, scoring_day_n)
        hist_path_dict = {
            asset: event_returns.get(asset, {}).get(event_name, {})
            for asset in sim_assets
            if event_returns.get(asset, {}).get(event_name)
        }
        hist_path_vec = path_vec(hist_path_dict, sim_assets, scoring_day_n)
        quant_path = (cosine(live_path_vec, hist_path_vec) + 1) / 2
        tag = tag_sim(live_tags, event_tags.get(event_name, set()))
        macro = macro_sim(
            live_trigger_z,
            live_cpi,
            live_fed,
            macro_context.get(event_name, {}),
            trigger_z_scores.get(event_name),
        )
        raw = normalized["quant"] * quant_path + normalized["tag"] * tag + normalized["macro"] * macro
        coverage_ratio, sparse_penalty, confidence = coverage_penalty(len(shared_assets), len(live_pool))
        scores.append(
            AnalogueScore(
                event=event_name,
                composite=raw * sparse_penalty,
                raw_composite=raw,
                quant=quant_path,
                quant_pt=quant_point,
                tag=tag,
                macro=macro,
                shared_asset_count=len(shared_assets),
                coverage_ratio=coverage_ratio,
                sparse_penalty=sparse_penalty,
                confidence_label=confidence,  # type: ignore[arg-type]
            )
        )
    return sorted(scores, key=lambda item: item.composite, reverse=True)


def select_events(scores: list[AnalogueScore], cutoff: float) -> list[str]:
    selected = [score.event for score in scores if score.composite >= cutoff]
    return selected if selected else [score.event for score in scores]


def filter_scores_by_active_events(scores: list[AnalogueScore], active_events: set[str]) -> list[AnalogueScore]:
    return [score for score in scores if score.event in active_events]


def composite_return(
    event_returns: EventReturns,
    label: str,
    selected_events: list[str],
    scores: list[AnalogueScore],
) -> dict[int, float] | None:
    score_map = {score.event: score.composite for score in scores}
    weighted_values: dict[int, float] = {}
    weight_sums: dict[int, float] = {}
    for event_name in selected_events:
        series = event_returns.get(label, {}).get(event_name, {})
        weight = score_map.get(event_name, 0.0)
        for offset, value in series.items():
            weighted_values[offset] = weighted_values.get(offset, 0.0) + value * weight
            weight_sums[offset] = weight_sums.get(offset, 0.0) + weight
    result = {
        offset: weighted_values[offset] / weight_sums[offset]
        for offset in weighted_values
        if weight_sums[offset] > 0
    }
    return result or None
