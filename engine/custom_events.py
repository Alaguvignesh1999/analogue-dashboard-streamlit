from __future__ import annotations

from config.defaults import POST_WINDOW_TD, PRE_WINDOW_TD, TRIGGER_ASSET
from engine.models import AssetMeta, DailyHistoryPayload


def build_valid_series(daily_history: DailyHistoryPayload, label: str) -> list[tuple[int, str, float]]:
    prices = daily_history.prices.get(label)
    if not prices:
        return []
    indices = daily_history.observed_indices.get(label) or list(range(len(daily_history.dates)))
    points: list[tuple[int, str, float]] = []
    for index in indices:
        value = prices[index]
        if value is None:
            continue
        points.append((index, daily_history.dates[index], float(value)))
    return points


def get_historical_coverage_range(daily_history: DailyHistoryPayload) -> dict[str, str | None]:
    return {
        "start_date": daily_history.dates[0] if daily_history.dates else None,
        "end_date": daily_history.as_of or (daily_history.dates[-1] if daily_history.dates else None),
    }


def resolve_point_on_or_before(daily_history: DailyHistoryPayload, label: str, date: str) -> tuple[int, str, float] | None:
    series = build_valid_series(daily_history, label)
    for point in reversed(series):
        if point[1] <= date:
            return point
    return None


def resolve_anchor_date_on_or_before(daily_history: DailyHistoryPayload, date: str) -> str | None:
    point = resolve_point_on_or_before(daily_history, TRIGGER_ASSET, date)
    return point[1] if point else None


def get_historical_price_for_date(daily_history: DailyHistoryPayload, label: str, date: str) -> dict | None:
    point = resolve_point_on_or_before(daily_history, label, date)
    return None if not point else {"date": point[1], "value": point[2]}


def get_trigger_price_for_date(daily_history: DailyHistoryPayload, date: str) -> dict | None:
    return get_historical_price_for_date(daily_history, TRIGGER_ASSET, date)


def compute_custom_event_returns(
    daily_history: DailyHistoryPayload,
    asset_meta: dict[str, AssetMeta],
    selected_date: str,
) -> dict:
    coverage = get_historical_coverage_range(daily_history)
    resolved_anchor_date = resolve_anchor_date_on_or_before(daily_history, selected_date)
    if not resolved_anchor_date:
        return {
            "returns_by_asset": {},
            "selected_date": selected_date,
            "resolved_anchor_date": None,
            "coverage": coverage,
        }
    returns_by_asset: dict[str, dict[int, float]] = {}
    for label, meta in asset_meta.items():
        series = build_valid_series(daily_history, label)
        if not series:
            continue
        day0_index = -1
        for idx in range(len(series) - 1, -1, -1):
            if series[idx][1] <= resolved_anchor_date:
                day0_index = idx
                break
        if day0_index < 0:
            continue
        denominator = series[max(0, day0_index - 1)][2] if series else None
        if not denominator:
            continue
        window_start = max(0, day0_index - PRE_WINDOW_TD - 5)
        window_end = min(len(series), day0_index + POST_WINDOW_TD + 6)
        result: dict[int, float] = {}
        for pos, (_, _, value) in enumerate(series[window_start:window_end], start=window_start):
            offset = pos - day0_index
            if meta.is_rates_bp:
                ret = (value - denominator) * 100
            else:
                ret = (value / denominator - 1) * 100
                if not meta.invert:
                    ret = -ret
            result[offset] = round(ret, 4)
        returns_by_asset[label] = result
    return {
        "returns_by_asset": returns_by_asset,
        "selected_date": selected_date,
        "resolved_anchor_date": resolved_anchor_date,
        "coverage": coverage,
    }
