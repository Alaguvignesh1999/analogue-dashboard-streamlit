from __future__ import annotations

import pandas as pd
import streamlit as st

from config.assets import ALL_ASSETS_OPTION, CUSTOM_GROUPS, get_group_labels, group_options_from_data
from config.defaults import POIS
from engine.live import get_effective_scoring_day, get_live_scoring_returns
from engine.math_utils import corrcoef, nan_mean, nan_median, nan_std
from engine.returns import display_label, poi_ret, unit_label
from engine.similarity import filter_scores_by_active_events, run_analogue_match, select_events
from views.helpers import current_scores, dataframe_or_empty, diagnostics_line, fmt_return


def render_screener_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    group_values = group_options_from_data(bundle.all_classes)
    group = st.selectbox("Group", [value for value, _ in group_values], index=0)
    min_hit = st.slider("Min hit rate", 0, 100, 60, 5)
    min_cov = st.slider("Min coverage", 0, 100, 50, 5)
    min_rr = st.slider("Min R/R", 0.0, 5.0, 0.8, 0.1)
    corr_threshold = st.slider("Correlation flag", 0.5, 0.95, 0.7, 0.05)
    labels = get_group_labels(group, bundle.all_labels, bundle.asset_meta)
    scores = filter_scores_by_active_events(current_scores(bundle), st.session_state["active_events"])
    selected_events = select_events(scores, st.session_state["score_cutoff"]) if scores else []
    day_n = get_effective_scoring_day(live, labels)
    fo = day_n + st.session_state["horizon"]
    rows = []
    for label in labels:
        values = []
        forward_by_event = {}
        for event_name in selected_events:
            start = poi_ret(st.session_state["event_returns_runtime"], label, event_name, day_n)
            finish = poi_ret(st.session_state["event_returns_runtime"], label, event_name, fo)
            if pd.notna(start) and pd.notna(finish):
                move = finish - start
                values.append(move)
                forward_by_event[event_name] = move
        if len(values) < 2:
            continue
        median = nan_median(values)
        hit_rate = len([value for value in values if value * (1 if median >= 0 else -1) > 0]) / len(values)
        disagree = len([value for value in values if value * (1 if median >= 0 else -1) < 0]) / len(values)
        bimodal = disagree > 0.35 and (nan_std(values) / (abs(median) + 1e-9)) > 1.5
        mae_values = []
        for event_name in selected_events:
            path_values = []
            for offset in range(day_n, fo + 1):
                start = poi_ret(st.session_state["event_returns_runtime"], label, event_name, day_n)
                value = poi_ret(st.session_state["event_returns_runtime"], label, event_name, offset)
                if pd.notna(start) and pd.notna(value):
                    path_values.append(value - start)
            if path_values:
                mae_values.append(min(path_values))
        mae_med = nan_median(mae_values) if mae_values else float("nan")
        rr_ratio = abs(median) / abs(mae_med) if pd.notna(mae_med) and abs(mae_med) > 1e-9 else float("nan")
        coverage = len(values) / max(len(selected_events), 1)
        conviction = "SKIP"
        if bimodal:
            conviction = "SPLIT"
        elif hit_rate >= min_hit / 100 and coverage >= min_cov / 100 and (pd.isna(rr_ratio) or rr_ratio >= min_rr):
            conviction = "ACT" if hit_rate >= 0.75 and coverage >= 0.7 else "MONITOR"
        rows.append(
            {
                "asset": label,
                "label": display_label(bundle.asset_meta[label], label),
                "direction": "LONG" if median >= 0 else "SHORT",
                "median": median,
                "hit_rate": hit_rate,
                "coverage": coverage,
                "mae_med": mae_med,
                "rr_ratio": rr_ratio,
                "conviction": conviction,
                "forward_by_event": forward_by_event,
            }
        )
    rows.sort(key=lambda row: ({"ACT": 0, "MONITOR": 1, "SPLIT": 2, "SKIP": 3}[row["conviction"]], -row["hit_rate"]))
    for i, current in enumerate(rows):
        overlaps = []
        for prior in rows[:i]:
            overlap_events = [event for event in selected_events if event in current["forward_by_event"] and event in prior["forward_by_event"]]
            if len(overlap_events) < 3:
                continue
            corr = corrcoef([current["forward_by_event"][e] for e in overlap_events], [prior["forward_by_event"][e] for e in overlap_events])
            if pd.notna(corr) and abs(corr) >= corr_threshold:
                overlaps.append(f"{prior['label']} ({corr:+.2f})")
        current["crowding"] = ", ".join(overlaps[:2]) if overlaps else "Independent"
    output = [
        {
            "asset": row["label"],
            "conviction": row["conviction"],
            "dir": row["direction"],
            "median": fmt_return(row["median"], bundle.asset_meta[row["asset"]].is_rates_bp),
            "hit_rate": round(row["hit_rate"] * 100, 1),
            "coverage": round(row["coverage"] * 100, 1),
            "mae_med": fmt_return(row["mae_med"], bundle.asset_meta[row["asset"]].is_rates_bp) if pd.notna(row["mae_med"]) else "--",
            "rr_ratio": None if pd.isna(row["rr_ratio"]) else round(row["rr_ratio"], 2),
            "crowding": row["crowding"],
        }
        for row in rows
    ]
    st.caption(diagnostics_line(labels))
    dataframe_or_empty(output)


def render_leadlag_tab(bundle) -> None:
    group = st.selectbox("Lead-lag group", [value for value in CUSTOM_GROUPS], index=list(CUSTOM_GROUPS).index("Risk Barometer") if "Risk Barometer" in CUSTOM_GROUPS else 0)
    assets = [asset for asset in CUSTOM_GROUPS[group] if asset in bundle.all_labels]
    event_names = [event.name for event in st.session_state["events_runtime"] if event.name in st.session_state["active_events"]]
    matrix_rows = []
    for asset_a in assets:
        row = {"asset": display_label(bundle.asset_meta[asset_a], asset_a)}
        for asset_b in assets:
            if asset_a == asset_b:
                row[display_label(bundle.asset_meta[asset_b], asset_b)] = 0.0
                continue
            event_lags = []
            for event_name in event_names:
                ret_a = []
                ret_b = []
                for _, offset in POIS:
                    value_a = poi_ret(st.session_state["event_returns_runtime"], asset_a, event_name, offset)
                    value_b = poi_ret(st.session_state["event_returns_runtime"], asset_b, event_name, offset)
                    if pd.notna(value_a) and pd.notna(value_b):
                        ret_a.append(value_a)
                        ret_b.append(value_b)
                if len(ret_a) < 3:
                    continue
                best_offset = 0
                best_corr = -1.0
                for lag in range(-2, 3):
                    path_a = []
                    path_b = []
                    for idx in range(len(ret_a)):
                        shifted = idx + lag
                        if 0 <= shifted < len(ret_b):
                            path_a.append(ret_a[idx])
                            path_b.append(ret_b[shifted])
                    if len(path_a) >= 2:
                        correlation = corrcoef(path_a, path_b)
                        if pd.notna(correlation) and correlation > best_corr:
                            best_corr = correlation
                            best_offset = lag
                event_lags.append(best_offset)
            row[display_label(bundle.asset_meta[asset_b], asset_b)] = round(nan_mean(event_lags), 2) if event_lags else None
        matrix_rows.append(row)
    dataframe_or_empty(matrix_rows)


def render_reverse_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    top_n = st.slider("Top matches", 3, 13, 5)
    scoring_returns = get_live_scoring_returns(live)
    if not scoring_returns:
        st.info("No live scoring returns available.")
        return
    scoring_day = get_effective_scoring_day(live, st.session_state["similarity_assets"])
    active_event_defs = [event for event in st.session_state["events_runtime"] if event.name in st.session_state["active_events"]]
    scores = run_analogue_match(
        st.session_state["event_returns_runtime"],
        scoring_returns,
        set(live.tag_set or []),
        live.trigger_z_score,
        live.cpi or st.session_state["live_config"]["cpi"],
        live.fed or st.session_state["live_config"]["fed"],
        scoring_day,
        bundle.trigger_z_scores,
        weights={"quant": 1.0, "tag": 0.0, "macro": 0.0},
        sim_assets=st.session_state["similarity_assets"],
        events=active_event_defs,
        event_tags=st.session_state["event_tags_runtime"],
        macro_context=st.session_state["macro_context_runtime"],
    )
    rows = [{"rank": idx + 1, "event": score.event, "cosine_similarity": round(score.quant, 4), "shared_assets": score.shared_asset_count} for idx, score in enumerate(scores[:top_n])]
    dataframe_or_empty(rows)


def render_prepos_tab(bundle) -> None:
    pre_window = st.slider("Pre window", 1, 63, 10)
    group_values = group_options_from_data(bundle.all_classes)
    group = st.selectbox("Group", [value for value, _ in group_values], index=0, key="prepos_group")
    labels = get_group_labels(group, bundle.all_labels, bundle.asset_meta)
    rows = []
    event_names = st.session_state["active_events"]
    for asset in labels:
        pre_returns = []
        scaled = []
        directions = []
        for event_name in event_names:
            at_zero = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, 0)
            at_pre = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, -pre_window)
            if pd.isna(at_zero) or pd.isna(at_pre):
                continue
            pre_return = at_zero - at_pre
            step_moves = []
            for offset in range(-pre_window + 1, 1):
                prev = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, offset - 1)
                cur = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, offset)
                if pd.notna(prev) and pd.notna(cur):
                    step_moves.append(cur - prev)
            pre_vol = nan_std(step_moves)
            if pd.isna(pre_vol) or pre_vol <= 1e-9:
                continue
            pre_returns.append(pre_return)
            scaled.append(pre_return / pre_vol)
            directions.append(1 if pre_return > 0 else -1 if pre_return < 0 else 0)
        if len(pre_returns) < 2:
            continue
        median = nan_median(pre_returns)
        non_zero = [direction for direction in directions if direction != 0]
        consistency = len([direction for direction in non_zero if direction == (1 if median >= 0 else -1)]) / len(non_zero) * 100 if non_zero else 0
        rows.append(
            {
                "asset": display_label(bundle.asset_meta[asset], asset),
                "vol_adj": round(nan_median(scaled), 2),
                "median": fmt_return(median, bundle.asset_meta[asset].is_rates_bp, 2),
                "mean": fmt_return(nan_mean(pre_returns), bundle.asset_meta[asset].is_rates_bp, 2),
                "std": fmt_return(nan_std(pre_returns), bundle.asset_meta[asset].is_rates_bp, 2),
                "consistency": round(consistency, 1),
                "coverage": round(len(pre_returns) / max(len(event_names), 1) * 100, 1),
                "bias": "UP" if nan_median(scaled) > 0.5 else "DOWN" if nan_median(scaled) < -0.5 else "FLAT",
                "n": len(pre_returns),
            }
        )
    rows.sort(key=lambda row: abs(row["vol_adj"]), reverse=True)
    dataframe_or_empty(rows)


def render_rotation_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    basket = st.selectbox("Basket", [value for value in CUSTOM_GROUPS], index=list(CUSTOM_GROUPS).index("Sector ETFs") if "Sector ETFs" in CUSTOM_GROUPS else 0)
    mode = st.radio("Mode", ["preset", "from-live"], horizontal=True)
    selected_events = selected_event_names(bundle)
    rotation_assets = [asset for asset in CUSTOM_GROUPS[basket] if asset in bundle.all_labels]
    effective_day = get_effective_scoring_day(live, st.session_state["similarity_assets"])
    poi_options = [(label, offset) for label, offset in POIS if offset >= 0]
    if mode == "preset":
        chosen_label = st.select_slider("Horizon", options=[label for label, _ in poi_options], value="t+1M")
        end_offset = dict(poi_options)[chosen_label]
        start_offset = 0
    else:
        days = st.slider("Forward days", 1, 63, 21)
        start_offset = effective_day
        end_offset = effective_day + days
    rows = []
    for asset in rotation_assets:
        values = []
        for event_name in selected_events:
            start = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, start_offset)
            finish = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, end_offset)
            if pd.notna(start) and pd.notna(finish):
                values.append(finish - start)
        if len(values) < 2:
            continue
        median = nan_median(values)
        rows.append(
            {
                "asset": display_label(bundle.asset_meta[asset], asset),
                "median": fmt_return(median, bundle.asset_meta[asset].is_rates_bp, 2),
                "mean": fmt_return(nan_mean(values), bundle.asset_meta[asset].is_rates_bp, 2),
                "std": fmt_return(nan_std(values), bundle.asset_meta[asset].is_rates_bp, 2),
                "hit_rate": round(len([value for value in values if value * (1 if median >= 0 else -1) > 0]) / len(values) * 100, 1),
                "bias": "LONG" if median >= 0 else "SHORT",
                "n": len(values),
            }
        )
    dataframe_or_empty(rows)
