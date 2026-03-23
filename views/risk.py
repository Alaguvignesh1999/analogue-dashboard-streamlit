from __future__ import annotations

import math

import pandas as pd
import streamlit as st

from config.assets import CUSTOM_GROUPS
from config.defaults import KELLY_FRACTION, POIS, PORTFOLIO_SCENARIOS, RISK_BUDGET_USD, SIMILARITY_ASSET_POOL
from engine.decay import build_decay_timeline, dominant_segments
from engine.live import get_effective_scoring_day, get_live_display_date, get_live_display_day
from engine.math_utils import cosine, nan_max, nan_mean, nan_median, nan_min, nan_percentile, nan_std
from engine.returns import display_label, poi_ret, unit_label
from engine.similarity import filter_scores_by_active_events, select_events
from views.helpers import bootstrap_stats, current_scores, dataframe_or_empty, diagnostics_line, fmt_dollar, fmt_return, selected_event_names


def render_stress_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    portfolio_name = st.selectbox("Portfolio", list(PORTFOLIO_SCENARIOS), index=0)
    view_mode = st.radio("View", ["nominal", "percent"], horizontal=True)
    positions = PORTFOLIO_SCENARIOS[portfolio_name]
    selected_events = selected_event_names(bundle)
    day_n = get_effective_scoring_day(live, list(positions))
    horizon = st.session_state["horizon"]
    gross = sum(abs(notional) for notional in positions.values())
    rows = []
    for event_name in selected_events:
        total_pnl = 0.0
        total_pct = 0.0
        breakdown = []
        for asset, notional in positions.items():
            start = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, day_n)
            finish = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, day_n + horizon)
            if pd.isna(start) or pd.isna(finish):
                continue
            ret = finish - start
            pnl = notional * ret / 100
            weight = abs(notional) / gross if gross else 0.0
            total_pnl += pnl
            total_pct += weight * ret
            breakdown.append(f"{display_label(bundle.asset_meta[asset], asset)}: {fmt_dollar(pnl) if view_mode == 'nominal' else f'{ret:+.2f}%'}")
        rows.append({"event": event_name, "total": total_pnl if view_mode == "nominal" else total_pct, "breakdown": " | ".join(breakdown)})
    rows.sort(key=lambda row: row["total"])
    view = [{"event": row["event"], "total": fmt_dollar(row["total"]) if view_mode == "nominal" else f"{row['total']:+.2f}%", "breakdown": row["breakdown"]} for row in rows]
    dataframe_or_empty(view)


def render_decay_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    step = st.slider("Step", 1, 5, 1)
    scoring_mode = st.radio("Scoring mode", ["live-sim", "all-available"], horizontal=True)
    st.session_state["scoring_mode"] = scoring_mode
    scores = filter_scores_by_active_events(current_scores(bundle), st.session_state["active_events"])
    selected_events = select_events(scores, st.session_state["score_cutoff"]) if scores else [event.name for event in st.session_state["events_runtime"] if event.name in st.session_state["active_events"]]
    returns = live.scoring_returns or live.returns
    if not returns:
        st.info("No live returns available.")
        return
    labels = list(returns) if scoring_mode == "all-available" else st.session_state["similarity_assets"]
    day_n = get_effective_scoring_day(live, labels)
    timeline = build_decay_timeline(st.session_state["event_returns_runtime"], returns, day_n, selected_events, step, st.session_state["similarity_assets"], scoring_mode)
    score_rows = []
    for point in timeline:
        row = {"offset": point["offset"], "top1": point["top1"]}
        for score in point["scores"][:5]:
            row[score["event"]] = score["score"]
        score_rows.append(row)
    st.caption(diagnostics_line(labels))
    dataframe_or_empty(score_rows)
    segs = dominant_segments(timeline)
    if segs:
        st.write({"dominant_segments": segs})


def render_confidence_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    group = st.selectbox("Group", list(CUSTOM_GROUPS), index=list(CUSTOM_GROUPS).index("Equities") if "Equities" in CUSTOM_GROUPS else 0)
    labels = [label for label in CUSTOM_GROUPS[group] if label in bundle.all_labels]
    selected_events = selected_event_names(bundle)
    day_n = get_effective_scoring_day(live, labels)
    horizon = st.session_state["horizon"]
    rows = []
    for label in labels:
        values = []
        for event_name in selected_events:
            start = poi_ret(st.session_state["event_returns_runtime"], label, event_name, day_n)
            finish = poi_ret(st.session_state["event_returns_runtime"], label, event_name, day_n + horizon)
            if pd.notna(start) and pd.notna(finish):
                values.append(finish - start)
        if len(values) < 2:
            continue
        stats = bootstrap_stats(values)
        direction = 1 if stats["median"] >= 0 else -1
        wins = [abs(value) for value in values if value * direction > 0]
        losses = [abs(value) for value in values if value * direction < 0]
        hit_rate = len(wins) / len(values)
        avg_win = nan_mean(wins) if wins else 0.0
        avg_loss = nan_mean(losses) if losses else 1e-9
        b_ratio = avg_win / avg_loss if avg_loss > 0 else 0.0
        q = 1 - hit_rate
        kelly_raw = (hit_rate * b_ratio - q) / b_ratio if b_ratio > 0 else 0.0
        kelly_pct = max(0.0, min(kelly_raw * KELLY_FRACTION * 100, 100))
        rows.append(
            {
                "asset": display_label(bundle.asset_meta[label], label),
                "median": fmt_return(stats["median"], bundle.asset_meta[label].is_rates_bp),
                "p5": fmt_return(stats["p5"], bundle.asset_meta[label].is_rates_bp),
                "p95": fmt_return(stats["p95"], bundle.asset_meta[label].is_rates_bp),
                "boot_std": round(stats["std"], 2),
                "hit_rate": round(hit_rate * 100, 1),
                "kelly_pct": round(kelly_pct, 1),
                "notional": fmt_dollar(kelly_pct / 100 * RISK_BUDGET_USD),
            }
        )
    rows.sort(key=lambda row: row["kelly_pct"], reverse=True)
    dataframe_or_empty(rows)


def render_oos_tab(bundle) -> None:
    holdout = st.slider("Holdout events", 1, 5, 3)
    poi_offset = st.select_slider("Target horizon", options=[offset for _, offset in POIS if offset > 0], value=21)
    ref_default = "Brent Futures" if "Brent Futures" in SIMILARITY_ASSET_POOL else SIMILARITY_ASSET_POOL[0]
    reference_asset = st.selectbox("Reference asset", [asset for asset in SIMILARITY_ASSET_POOL if asset in bundle.asset_meta], index=[asset for asset in SIMILARITY_ASSET_POOL if asset in bundle.asset_meta].index(ref_default))
    event_names = [event.name for event in st.session_state["events_runtime"] if event.name in st.session_state["active_events"]]
    if len(event_names) < holdout + 2:
        st.info(f"Need at least {holdout + 2} active events.")
        return
    held_out = event_names[-holdout:]
    calibration = event_names[:-holdout]

    def build_overlap_vector(event_name: str) -> list[tuple[str, float]]:
        vector = []
        for asset in SIMILARITY_ASSET_POOL:
            value = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, poi_offset)
            if pd.notna(value):
                vector.append((asset, value))
        return vector

    rows = []
    for test_event in held_out:
        test_vec = build_overlap_vector(test_event)
        if len(test_vec) < 2:
            continue
        sims = []
        for cal_event in calibration:
            cal_vec = build_overlap_vector(cal_event)
            shared = [asset for asset, _ in test_vec if any(other_asset == asset for other_asset, _ in cal_vec)]
            if len(shared) < 2:
                continue
            test_values = [value for asset, value in test_vec if asset in shared]
            cal_values = [value for asset, value in cal_vec if asset in shared]
            sims.append({"event": cal_event, "sim": cosine(test_values, cal_values), "overlap": len(shared)})
        if not sims:
            continue
        sims.sort(key=lambda row: row["sim"], reverse=True)
        top = sims[: max(1, math.ceil(len(sims) * 0.3))]
        predicted_values = [poi_ret(st.session_state["event_returns_runtime"], reference_asset, row["event"], poi_offset) for row in top]
        predicted_values = [value for value in predicted_values if pd.notna(value)]
        actual = poi_ret(st.session_state["event_returns_runtime"], reference_asset, test_event, poi_offset)
        if not predicted_values or pd.isna(actual):
            continue
        predicted = nan_median(predicted_values)
        rows.append(
            {
                "event": test_event,
                "predicted": fmt_return(predicted, bundle.asset_meta[reference_asset].is_rates_bp),
                "actual": fmt_return(actual, bundle.asset_meta[reference_asset].is_rates_bp),
                "error": round(actual - predicted, 2),
                "dir_match": (predicted >= 0 and actual >= 0) or (predicted < 0 and actual < 0),
                "overlap": round(nan_mean([item["overlap"] for item in top])),
            }
        )
    dataframe_or_empty(rows)


def render_gate_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    selected_events = selected_event_names(bundle)
    day_n = get_effective_scoring_day(live, bundle.all_labels)
    horizon = st.session_state["horizon"]
    rows = []
    for label in bundle.all_labels:
        values = []
        for event_name in selected_events:
            start = poi_ret(st.session_state["event_returns_runtime"], label, event_name, day_n)
            finish = poi_ret(st.session_state["event_returns_runtime"], label, event_name, day_n + horizon)
            if pd.notna(start) and pd.notna(finish):
                values.append(finish - start)
        if len(values) < 2:
            continue
        median = nan_median(values)
        direction = 1 if median >= 0 else -1
        live_point = (live.scoring_returns or live.returns).get(label, {}).get(day_n)
        live_pctile = None
        if live_point is not None:
            historical = [poi_ret(st.session_state["event_returns_runtime"], label, event_name, day_n) for event_name in selected_events]
            historical = [value for value in historical if pd.notna(value)]
            if len(historical) >= 2:
                live_pctile = len([value for value in historical if live_point > value]) / len(historical) * 100
        gate = "N/A"
        if live_pctile is not None:
            gate = "ENTER" if live_pctile < 33 else "HALF" if live_pctile < 66 else "LATE" if live_pctile < 85 else "SKIP"
        tp = nan_percentile(values, 75 if median >= 0 else 25)
        sl = nan_percentile(values, 25 if median >= 0 else 75)
        rr = abs((direction * tp) / (direction * sl)) if abs(direction * sl) > 1e-6 else math.nan
        rows.append(
            {
                "asset": display_label(bundle.asset_meta[label], label),
                "dir": "LONG" if median >= 0 else "SHORT",
                "gate": gate,
                "median": fmt_return(median, bundle.asset_meta[label].is_rates_bp),
                "hit_rate": round(len([value for value in values if value * direction > 0]) / len(values) * 100, 1),
                "tp": fmt_return(tp, bundle.asset_meta[label].is_rates_bp),
                "sl": fmt_return(sl, bundle.asset_meta[label].is_rates_bp),
                "rr": None if pd.isna(rr) else round(rr, 2),
                "live_pctile": None if live_pctile is None else round(live_pctile, 1),
                "n": len(values),
            }
        )
    rows.sort(key=lambda row: (row["gate"] != "ENTER", -(row["hit_rate"] or 0)))
    st.caption(diagnostics_line(bundle.all_labels))
    dataframe_or_empty(rows)
