from __future__ import annotations

from dataclasses import replace

from engine.models import SharedLiveSnapshot


def get_live_scoring_returns(live: SharedLiveSnapshot | None) -> dict[str, dict[int, float]] | None:
    if not live:
        return None
    return live.scoring_returns or live.returns or None


def get_live_display_returns(live: SharedLiveSnapshot | None) -> dict[str, dict[int, float]] | None:
    if not live:
        return None
    return live.returns or live.scoring_returns or None


def get_live_display_day(live: SharedLiveSnapshot | None) -> int:
    if not live:
        return 0
    latest = live.day_n if live.day_n is not None else live.trading_day_n
    requested = live.analysis_day_n if live.analysis_day_n is not None else latest
    return max(0, min(requested or 0, latest or 0))


def get_live_scoring_day(live: SharedLiveSnapshot | None) -> int:
    if not live:
        return 0
    latest = live.trading_day_n if live.trading_day_n is not None else live.day_n
    requested = live.analysis_day_n if live.analysis_day_n is not None else latest
    return max(0, min(requested or 0, latest or 0))


def get_live_display_date(live: SharedLiveSnapshot | None) -> str | None:
    if not live:
        return None
    display_day = get_live_display_day(live)
    if 0 <= display_day < len(live.business_dates):
        return live.business_dates[display_day] or live.as_of_date
    return live.as_of_date


def get_live_scoring_levels(live: SharedLiveSnapshot | None) -> dict[str, dict[int, float]] | None:
    if not live:
        return None
    return live.scoring_levels or live.levels or None


def get_series_point_at_or_before(series: dict[int, float] | None, target_offset: int) -> tuple[int, float] | None:
    if not series:
        return None
    offsets = sorted(offset for offset in series if offset <= target_offset)
    if not offsets:
        return None
    offset = offsets[-1]
    return offset, series[offset]


def get_live_return_point_at_or_before(
    live: SharedLiveSnapshot | None,
    label: str,
    target_offset: int,
) -> tuple[int, float] | None:
    returns = get_live_scoring_returns(live)
    return get_series_point_at_or_before(returns.get(label) if returns else None, target_offset)


def get_live_display_return_point_at_or_before(
    live: SharedLiveSnapshot | None,
    label: str,
    target_offset: int,
) -> tuple[int, float] | None:
    returns = get_live_display_returns(live)
    return get_series_point_at_or_before(returns.get(label) if returns else None, target_offset)


def get_live_level_point_at_or_before(
    live: SharedLiveSnapshot | None,
    label: str,
    target_offset: int,
) -> tuple[int, float] | None:
    levels = get_live_scoring_levels(live)
    return get_series_point_at_or_before(levels.get(label) if levels else None, target_offset)


def get_effective_scoring_day(live: SharedLiveSnapshot | None, labels: list[str] | None = None) -> int:
    returns = get_live_scoring_returns(live)
    base_day = get_live_scoring_day(live)
    if not returns:
        return base_day
    candidate_labels = [label for label in (labels or list(returns.keys())) if returns.get(label)]
    if not candidate_labels:
        return base_day
    max_available = -1
    for label in candidate_labels:
        point = get_series_point_at_or_before(returns.get(label), 10**9)
        if point:
            max_available = max(max_available, point[0])
    return min(base_day, max_available) if max_available >= 0 else base_day


def get_effective_scoring_date(live: SharedLiveSnapshot | None, labels: list[str] | None = None) -> str | None:
    if not live:
        return None
    effective_day = get_effective_scoring_day(live, labels)
    if 0 <= effective_day < len(live.business_dates):
        return live.business_dates[effective_day] or live.as_of_date
    return live.as_of_date


def clone_live_with_updates(live: SharedLiveSnapshot, **updates) -> SharedLiveSnapshot:
    return replace(live, **updates)
