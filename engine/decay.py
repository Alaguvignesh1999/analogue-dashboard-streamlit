from __future__ import annotations

from engine.live import get_series_point_at_or_before
from engine.math_utils import cosine
from engine.models import EventReturns
from engine.similarity import coverage_penalty


def path_vec_at(returns_dict: dict[str, dict[int, float]], assets: list[str], day_n: int) -> list[float]:
    if day_n < 0:
        return []
    vector: list[float] = []
    for asset in assets:
        series = returns_dict.get(asset, {})
        for offset in range(day_n + 1):
            point = get_series_point_at_or_before(series, offset)
            vector.append(point[1] if point else float("nan"))
    return vector


def decay_scores_at(
    event_returns: EventReturns,
    live_returns: dict[str, dict[int, float]],
    day_n_target: int,
    event_names: list[str],
    sim_assets: list[str],
    mode: str = "live-sim",
) -> list[dict]:
    base_pool = list(live_returns) if mode == "all-available" else sim_assets
    live_pool = [asset for asset in base_pool if live_returns.get(asset)]
    if len(live_pool) < 2:
        return []
    live_path = path_vec_at(live_returns, live_pool, day_n_target)
    scores: list[dict] = []
    for event_name in event_names:
        hist_dict: dict[str, dict[int, float]] = {}
        shared_asset_count = 0
        for asset in live_pool:
            hist = event_returns.get(asset, {}).get(event_name)
            if hist:
                hist_dict[asset] = hist
                shared_asset_count += 1
        hist_path = path_vec_at(hist_dict, live_pool, day_n_target)
        raw_score = (cosine(live_path, hist_path) + 1) / 2
        coverage_ratio, sparse_penalty, confidence = coverage_penalty(shared_asset_count, len(live_pool))
        scores.append(
            {
                "event": event_name,
                "score": raw_score * sparse_penalty,
                "raw_score": raw_score,
                "shared_asset_count": shared_asset_count,
                "coverage_ratio": coverage_ratio,
                "sparse_penalty": sparse_penalty,
                "confidence_label": confidence,
            }
        )
    return sorted(scores, key=lambda item: item["score"], reverse=True)


def build_decay_timeline(
    event_returns: EventReturns,
    live_returns: dict[str, dict[int, float]],
    max_day_n: int,
    event_names: list[str],
    step: int,
    sim_assets: list[str],
    mode: str = "live-sim",
) -> list[dict]:
    timeline: list[dict] = []
    for day_n in range(0, max_day_n + 1, max(step, 1)):
        scores = decay_scores_at(event_returns, live_returns, day_n, event_names, sim_assets, mode)
        timeline.append({"offset": day_n, "scores": scores, "top1": scores[0]["event"] if scores else ""})
    return timeline


def dominant_segments(timeline: list[dict]) -> list[dict]:
    if not timeline:
        return []
    segments: list[dict] = []
    current = timeline[0]["top1"]
    start = timeline[0]["offset"]
    for point in timeline[1:]:
        if point["top1"] != current:
            segments.append({"event": current, "start": start, "end": point["offset"]})
            current = point["top1"]
            start = point["offset"]
    segments.append({"event": current, "start": start, "end": timeline[-1]["offset"]})
    return segments
