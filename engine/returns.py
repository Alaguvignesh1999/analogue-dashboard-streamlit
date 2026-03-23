from __future__ import annotations

from engine.models import AssetMeta, AvailabilityWindow, EventReturns


def normalize_label(label: str) -> str:
    replacements = {
        "1973 Oil Embargoâ€ ": "1973 Oil Embargo",
        "1973 Oil Embargo†": "1973 Oil Embargo",
        "2020 COVID-19 PHEIC": "COVID-19",
    }
    return replacements.get(label, label).strip()


def get_series_value(series: dict[int, float] | None, offset: int, tolerance: int = 0) -> float | None:
    if not series:
        return None
    if offset in series:
        return series[offset]
    for distance in range(1, tolerance + 1):
        if offset + distance in series:
            return series[offset + distance]
        if offset - distance in series:
            return series[offset - distance]
    return None


def poi_ret(
    event_returns: EventReturns,
    label: str,
    event_name: str,
    offset: int,
    tolerance: int = 2,
) -> float:
    value = get_series_value(event_returns.get(label, {}).get(event_name), offset, tolerance)
    return float("nan") if value is None else value


def anchor_series_value(
    series: dict[int, float] | None,
    offset: int,
    mode: str,
    step_day: int = 0,
    tolerance: int = 0,
) -> float | None:
    value = get_series_value(series, offset, tolerance)
    if value is None:
        return None
    if mode == "raw":
        return value
    anchor_offset = 0 if mode == "day0" else step_day
    anchor_value = get_series_value(series, anchor_offset, tolerance)
    return None if anchor_value is None else value - anchor_value


def is_sparse_poi_series(series: dict[int, float] | None) -> bool:
    if not series:
        return False
    poi_offsets = {-21, -5, 0, 5, 21, 63}
    offsets = set(series.keys())
    return bool(offsets) and offsets.issubset(poi_offsets)


def get_return_series(event_returns: EventReturns, label: str, event_name: str) -> list[tuple[int, float]]:
    series = event_returns.get(label, {}).get(event_name, {})
    return sorted(series.items())


def unit_label(meta: AssetMeta | None) -> str:
    return "bp" if meta and meta.is_rates_bp else "%"


def display_label(meta: AssetMeta | None, label: str) -> str:
    return normalize_label(meta.display_label if meta else label)


def event_date_map(events: list) -> dict[str, str]:
    return {event.name: event.date for event in events}


def is_asset_available_for_event(
    label: str,
    event_date: str,
    availability: dict[str, AvailabilityWindow] | None,
) -> bool:
    window = (availability or {}).get(label)
    if not window or not window.start_date:
        return True
    return window.start_date <= event_date
