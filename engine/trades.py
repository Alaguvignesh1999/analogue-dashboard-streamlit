from __future__ import annotations

import math

from engine.live import (
    get_live_display_return_point_at_or_before,
    get_live_return_point_at_or_before,
)
from engine.math_utils import corrcoef, nan_max, nan_mean, nan_median, nan_min, nan_percentile, nan_std
from engine.models import AssetMeta, EventReturns, SharedLiveSnapshot
from engine.returns import poi_ret, unit_label


def stars(iqr: float, median: float) -> str:
    if abs(median) < 0.01:
        return "....."
    ratio = iqr / (abs(median) + 1e-9)
    if ratio < 0.4:
        return "*****"
    if ratio < 0.7:
        return "****."
    if ratio < 1.0:
        return "***.."
    if ratio < 1.5:
        return "**..."
    return "*...."


def status_from_pctile(pctile: float | None) -> str:
    if pctile is None or math.isnan(pctile):
        return "--"
    if pctile < 25:
        return "Still open"
    if pctile < 50:
        return "On track"
    if pctile < 75:
        return "Chasing"
    return "Extended"


def compute_trade_rows(
    labels: list[str],
    event_returns: EventReturns,
    asset_meta: dict[str, AssetMeta],
    selected_events: list[str],
    day_n: int,
    fwd_days: int,
    live: SharedLiveSnapshot | None,
) -> list[dict]:
    forward_offset = day_n + fwd_days
    if forward_offset <= day_n:
        return []
    rows: list[dict] = []
    for label in labels:
        fwd_vals: list[float] = []
        for event_name in selected_events:
            start = poi_ret(event_returns, label, event_name, day_n)
            finish = poi_ret(event_returns, label, event_name, forward_offset)
            if not math.isnan(start) and not math.isnan(finish):
                fwd_vals.append(finish - start)
        if len(fwd_vals) < 2:
            continue
        median = nan_median(fwd_vals)
        mean = nan_mean(fwd_vals)
        std = nan_std(fwd_vals)
        iqr = nan_percentile(fwd_vals, 75) - nan_percentile(fwd_vals, 25)
        is_rates = asset_meta.get(label).is_rates_bp if label in asset_meta else False
        direction = 1 if median >= 0 else -1
        hit_rate = len([value for value in fwd_vals if value * direction > 0]) / len(fwd_vals)
        adjusted = [value * direction for value in fwd_vals]
        mean_adjusted = nan_mean(adjusted)
        std_adjusted = nan_std(adjusted)
        sharpe = mean_adjusted / (std_adjusted + 1e-9)
        downside = [value for value in adjusted if value < 0]
        downside_std = nan_std(downside) if len(downside) > 1 else std_adjusted + 1e-9
        sortino = mean_adjusted / (downside_std + 1e-9)
        worst = nan_min(fwd_vals) if direction > 0 else nan_max(fwd_vals)
        best = nan_max(fwd_vals) if direction > 0 else nan_min(fwd_vals)
        skew = 0.0
        if len(fwd_vals) >= 3 and std > 0:
            skew = sum(((value - mean) / std) ** 3 for value in fwd_vals) / len(fwd_vals)
        live_gap = math.nan
        live_pctile = math.nan
        live_point = get_live_return_point_at_or_before(live, label, day_n)
        if live_point:
            historical_at_live = [
                poi_ret(event_returns, label, event_name, live_point[0])
                for event_name in selected_events
            ]
            historical_at_live = [value for value in historical_at_live if not math.isnan(value)]
            if len(historical_at_live) >= 2:
                live_gap = direction * (live_point[1] - nan_median(historical_at_live))
                live_pctile = len([value for value in historical_at_live if live_point[1] > value]) / len(historical_at_live) * 100
        meta = asset_meta[label]
        rows.append(
            {
                "lbl": label,
                "cls": meta.class_name,
                "ticker": meta.ticker,
                "dir": "LONG" if median >= 0 else "SHORT",
                "med": median,
                "mean": mean,
                "std": std,
                "iqr": iqr,
                "stars": stars(iqr, median),
                "n": len(fwd_vals),
                "n_total": len(selected_events),
                "unit": unit_label(meta),
                "is_rates": is_rates,
                "hit_rate": hit_rate,
                "sharpe": sharpe,
                "sortino": sortino,
                "skew": skew,
                "worst": worst,
                "best": best,
                "live_gap": live_gap,
                "live_pctile": live_pctile,
                "status": status_from_pctile(None if math.isnan(live_pctile) else live_pctile),
                "fwd_vals": fwd_vals,
            }
        )
    return sorted(rows, key=lambda row: row["sharpe"], reverse=True)


def compute_per_horizon_stats(
    label: str,
    selected_events: list[str],
    day_n: int,
    event_returns: EventReturns,
    horizons: list[dict],
) -> list[dict]:
    rows: list[dict] = []
    for horizon in horizons:
        offset = horizon["offset"]
        if offset <= day_n:
            continue
        vals: list[float] = []
        for event_name in selected_events:
            start = poi_ret(event_returns, label, event_name, day_n)
            finish = poi_ret(event_returns, label, event_name, offset)
            if not math.isnan(start) and not math.isnan(finish):
                vals.append(finish - start)
        if len(vals) < 2:
            continue
        median = nan_median(vals)
        mean = nan_mean(vals)
        std = nan_std(vals)
        downside = [value for value in vals if value < 0]
        downside_std = nan_std(downside) if len(downside) > 1 else std + 1e-9
        direction = 1 if median >= 0 else -1
        adjusted = [value * direction for value in vals]
        rows.append(
            {
                "horizon_label": horizon["label"],
                "horizon_offset": offset,
                "q1": nan_percentile(vals, 25),
                "med": median,
                "q3": nan_percentile(vals, 75),
                "hit": len([value for value in vals if value * direction > 0]) / len(vals),
                "sharpe": (mean * direction) / (std + 1e-9),
                "sortino": (mean * direction) / (downside_std + 1e-9),
                "skew": 0 if len(vals) < 3 else sum(((value - mean) / (std + 1e-9)) ** 3 for value in vals) / len(vals),
                "worst": nan_min(adjusted),
                "n": len(vals),
            }
        )
    return rows


def build_dot_plot(label: str, selected_events: list[str], start_offset: int, end_offset: int, event_returns: EventReturns) -> list[dict]:
    points: list[dict] = []
    if end_offset <= start_offset:
        return points
    for event_name in selected_events:
        start = poi_ret(event_returns, label, event_name, start_offset)
        finish = poi_ret(event_returns, label, event_name, end_offset)
        if not math.isnan(start) and not math.isnan(finish):
            points.append({"event": event_name, "value": finish - start})
    return points


def build_live_deviation_series(label: str, selected_events: list[str], day_n: int, event_returns: EventReturns, live: SharedLiveSnapshot | None) -> list[dict]:
    series: list[dict] = []
    for offset in range(day_n + 1):
        values = [poi_ret(event_returns, label, event_name, offset) for event_name in selected_events]
        values = [value for value in values if not math.isnan(value)]
        live_point = get_live_display_return_point_at_or_before(live, label, offset)
        series.append(
            {
                "offset": offset,
                "p25": nan_percentile(values, 25) if values else None,
                "p75": nan_percentile(values, 75) if values else None,
                "median": nan_median(values) if values else None,
                "live": live_point[1] if live_point else None,
            }
        )
    return series


def build_idea_correlation_matrix(rows: list[dict], selected_events: list[str], day_n: int, fwd_days: int, event_returns: EventReturns) -> dict | None:
    focus_rows = rows[: min(12, len(rows))]
    if len(focus_rows) < 2:
        return None
    end_offset = day_n + fwd_days
    per_asset_values = []
    for row in focus_rows:
        values = []
        for event_name in selected_events:
            start = poi_ret(event_returns, row["lbl"], event_name, day_n)
            finish = poi_ret(event_returns, row["lbl"], event_name, end_offset)
            values.append(finish - start if not math.isnan(start) and not math.isnan(finish) else math.nan)
        per_asset_values.append(values)
    overlap_counts = []
    matrix = []
    for left_values in per_asset_values:
        overlap_row = []
        corr_row = []
        for right_values in per_asset_values:
            filtered_left = []
            filtered_right = []
            for left, right in zip(left_values, right_values):
                if not math.isnan(left) and not math.isnan(right):
                    filtered_left.append(left)
                    filtered_right.append(right)
            overlap_row.append(len(filtered_left))
            corr_row.append(corrcoef(filtered_left, filtered_right) if len(filtered_left) >= 3 else math.nan)
        overlap_counts.append(overlap_row)
        matrix.append(corr_row)
    return {"labels": [row["lbl"] for row in focus_rows], "matrix": matrix, "overlap_counts": overlap_counts}
