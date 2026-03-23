from __future__ import annotations

from datetime import datetime, timezone

from config.defaults import PRE_WINDOW_TD, TRIGGER_ASSET
from engine.custom_events import build_valid_series
from engine.models import AssetMeta, DailyHistoryPayload, LiveAssetStatus, SharedLiveSnapshot


def to_utc_date(value: str) -> int:
    return int(datetime.fromisoformat(f"{value}T00:00:00+00:00").timestamp())


def day_diff(start_date: str, end_date: str) -> int:
    return (to_utc_date(end_date) - to_utc_date(start_date)) // 86400


def compute_observed_series(
    daily_history: DailyHistoryPayload,
    label: str,
    requested_day0: str,
    meta: AssetMeta,
) -> dict | None:
    series = build_valid_series(daily_history, label)
    if not series:
        return None
    day0_index = -1
    for idx in range(len(series) - 1, -1, -1):
        if series[idx][1] <= requested_day0:
            day0_index = idx
            break
    if day0_index < 0:
        return None
    day0_price = series[day0_index][2]
    actual_day0 = series[day0_index][1]
    baseline = series[max(0, day0_index - 1)][2] if series else day0_price
    raw_returns: dict[int, float] = {}
    raw_levels: dict[int, float] = {}
    scoring_returns: dict[int, float] = {}
    scoring_levels: dict[int, float] = {}
    observed_dates: list[str] = []
    window_start = max(0, day0_index - PRE_WINDOW_TD - 5)
    for idx in range(window_start, len(series)):
        _, point_date, value = series[idx]
        offset = day_diff(actual_day0, point_date)
        raw_levels[offset] = value
        if meta.is_rates_bp:
            raw_returns[offset] = (value - baseline) * 100
        else:
            change = (value / baseline - 1) * 100
            raw_returns[offset] = change if meta.invert else -change
        if idx >= day0_index:
            observed_dates.append(point_date)
            scoring_levels[idx - day0_index] = value
            if meta.is_rates_bp:
                scoring_returns[idx - day0_index] = (value - baseline) * 100
            else:
                change = (value / baseline - 1) * 100
                scoring_returns[idx - day0_index] = change if meta.invert else -change
    return {
        "raw_returns": raw_returns,
        "raw_levels": raw_levels,
        "scoring_returns": scoring_returns,
        "scoring_levels": scoring_levels,
        "observed_dates": observed_dates,
        "day0_price": day0_price,
        "actual_day0": actual_day0,
        "as_of_date": observed_dates[-1] if observed_dates else None,
    }


def fill_calendar_series(
    raw_returns: dict[int, float],
    raw_levels: dict[int, float],
    day0_price: float,
    target_offset: int,
    max_carry_days: int = 3,
) -> dict[str, dict[int, float]]:
    offsets = sorted(raw_returns)
    if not offsets or target_offset < 0:
        return {"returns": {}, "levels": {}}
    start_offset = max(offsets[0], -PRE_WINDOW_TD)
    last_observed = offsets[-1]
    fill_limit = min(target_offset, last_observed + max_carry_days)
    first_observed = next((offset for offset in offsets if offset >= start_offset), offsets[0])
    last_return = raw_returns.get(first_observed, 0.0)
    last_level = raw_levels.get(first_observed, day0_price)
    returns: dict[int, float] = {}
    levels: dict[int, float] = {}
    for offset in range(start_offset, fill_limit + 1):
        if offset in raw_returns:
            last_return = raw_returns[offset]
        if offset in raw_levels:
            last_level = raw_levels[offset]
        returns[offset] = last_return
        levels[offset] = last_level
    return {"returns": returns, "levels": levels}


def build_live_payload_from_daily_history(
    daily_history: DailyHistoryPayload,
    asset_meta: dict[str, AssetMeta],
    requested_day0: str,
    mode: str,
    *,
    name: str | None = None,
    tags: list[str] | None = None,
    cpi: str | None = None,
    fed: str | None = None,
    source: str = "generated-history",
    schema_version: int | None = None,
    warnings: list[str] | None = None,
    labels: list[str] | None = None,
) -> SharedLiveSnapshot:
    labels = [label for label in (labels or list(asset_meta.keys())) if label in daily_history.prices and label in asset_meta]
    observed_by_asset: dict[str, dict] = {}
    asset_status: dict[str, LiveAssetStatus] = {}
    trigger_price = None
    canonical_dates: list[str] = []
    actual_day0 = None
    as_of_date = None
    for label in labels:
        series = compute_observed_series(daily_history, label, requested_day0, asset_meta[label])
        if not series or not series["raw_returns"]:
            asset_status[label] = LiveAssetStatus("missing", source, None, f"No cached history available on or before {requested_day0}")
            continue
        observed_by_asset[label] = series
        asset_status[label] = LiveAssetStatus("ok", source, series["as_of_date"])
        if label == TRIGGER_ASSET:
            trigger_price = series["day0_price"]
            canonical_dates = series["observed_dates"]
            actual_day0 = series["actual_day0"]
            as_of_date = series["as_of_date"]
        elif len(series["observed_dates"]) > len(canonical_dates):
            canonical_dates = series["observed_dates"]
            actual_day0 = actual_day0 or series["actual_day0"]
            as_of_date = as_of_date or series["as_of_date"]
    canonical_actual_day0 = actual_day0 or requested_day0
    canonical_as_of = as_of_date or daily_history.as_of or (canonical_dates[-1] if canonical_dates else None)
    day_n = max(0, day_diff(canonical_actual_day0, canonical_as_of)) if canonical_as_of else 0
    trading_day_n = max(0, len(canonical_dates) - 1)
    returns: dict[str, dict[int, float]] = {}
    levels: dict[str, dict[int, float]] = {}
    scoring_returns: dict[str, dict[int, float]] = {}
    scoring_levels: dict[str, dict[int, float]] = {}
    for label, series in observed_by_asset.items():
        filled = fill_calendar_series(series["raw_returns"], series["raw_levels"], series["day0_price"], day_n)
        if not filled["returns"]:
            continue
        returns[label] = filled["returns"]
        levels[label] = filled["levels"]
        scoring_returns[label] = series["scoring_returns"]
        scoring_levels[label] = series["scoring_levels"]
    trigger_z_score = None
    if trigger_price is not None:
        historical = [4, 17, 25, 11, 22, 35, 37, 85, 104, 53, 54, 91, 73]
        mean = sum(historical) / len(historical)
        variance = sum((value - mean) ** 2 for value in historical) / len(historical)
        std = variance ** 0.5
        trigger_z_score = (trigger_price - mean) / std if std > 0 else 0.0
    return SharedLiveSnapshot(
        name=name or "Shared Live Snapshot",
        snapshot_date=daily_history.as_of or canonical_as_of or requested_day0,
        requested_day0=requested_day0,
        actual_day0=canonical_actual_day0,
        trigger_date=canonical_actual_day0,
        as_of_date=canonical_as_of,
        day_n=day_n,
        trading_day_n=trading_day_n,
        returns=returns,
        levels=levels,
        scoring_returns=scoring_returns,
        scoring_levels=scoring_levels,
        asset_status=asset_status,
        warnings=warnings or [],
        provenance_mode="private" if mode == "private" else "shared",
        provenance_source=source,  # type: ignore[arg-type]
        provenance_built_at=datetime.now(timezone.utc).isoformat(),
        schema_version=schema_version or daily_history.schema_version,
        business_dates=canonical_dates,
        trigger_price=trigger_price,
        trigger_z_score=trigger_z_score,
        trigger_pctile=trigger_z_score,
        tag_set=tags or [],
        cpi=cpi,
        fed=fed,
        request_mode="private" if mode == "private" else "shared",
    )
