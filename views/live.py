from __future__ import annotations

import pandas as pd
import streamlit as st

from config.defaults import DEFAULT_LIVE_SIM_ASSETS, POIS
from engine.live import get_effective_scoring_day, get_live_display_date, get_live_display_day, get_live_scoring_returns
from engine.math_utils import nan_mean, nan_median, nan_percentile, nan_std
from engine.returns import display_label, poi_ret
from engine.similarity import filter_scores_by_active_events, select_events
from engine.trades import (
    build_dot_plot,
    build_idea_correlation_matrix,
    build_live_deviation_series,
    compute_per_horizon_stats,
    compute_trade_rows,
)
from state.session import build_demo_live, build_private_live, load_shared_snapshot, reset_live, update_live_config
from views.helpers import current_scores, dataframe_or_empty, diagnostics_line, fmt_return, selected_event_names


def render_live_config_tab(bundle) -> None:
    config = st.session_state["live_config"]
    col1, col2 = st.columns(2)
    with col1:
        name = st.text_input("Event name", value=config["name"])
        day0 = st.date_input("Day 0", value=pd.Timestamp(config["day0"]).to_pydatetime() if config["day0"] else pd.Timestamp.today().to_pydatetime())
        tags = st.multiselect("Tags", ["energy_shock", "military_conflict", "shipping_disruption", "sanctions", "pandemic"], default=sorted(config["tags"]))
    with col2:
        trigger = st.number_input("Trigger price", value=float(config["trigger"]), step=0.1)
        cpi = st.selectbox("CPI regime", ["high", "mid", "low"], index=["high", "mid", "low"].index(config["cpi"]))
        fed = st.selectbox("Fed stance", ["hiking", "cutting", "hold"], index=["hiking", "cutting", "hold"].index(config["fed"]))
    similarity_assets = st.multiselect(
        "Similarity assets",
        bundle.all_labels,
        default=st.session_state["similarity_assets"],
        format_func=lambda label: display_label(bundle.asset_meta[label], label),
    )
    col3, col4, col5, col6 = st.columns(4)
    if col3.button("Load shared snapshot", use_container_width=True):
        update_live_config(name=name, day0=day0.isoformat(), tags=set(tags), trigger=trigger, cpi=cpi, fed=fed)
        load_shared_snapshot(bundle)
    if col4.button("Build private live", use_container_width=True):
        update_live_config(name=name, day0=day0.isoformat(), tags=set(tags), trigger=trigger, cpi=cpi, fed=fed)
        build_private_live(bundle)
    if col5.button("Demo mode", use_container_width=True):
        update_live_config(name=name, day0=day0.isoformat(), tags=set(tags), trigger=trigger, cpi=cpi, fed=fed)
        build_demo_live(bundle)
    if col6.button("Reset", use_container_width=True):
        reset_live()

    st.session_state["similarity_assets"] = similarity_assets or [asset for asset in DEFAULT_LIVE_SIM_ASSETS if asset in bundle.all_labels]
    live = st.session_state["live_payload"]
    if live:
        max_day = live.trading_day_n if live.trading_day_n is not None else live.day_n
        analysis_override = st.checkbox("Enable analysis-day override", value=live.analysis_day_n is not None)
        if analysis_override:
            live.analysis_day_n = st.slider("Analysis day", 0, max_day, live.analysis_day_n or max_day)
            st.session_state["live_payload"] = live
        st.caption(diagnostics_line(st.session_state["similarity_assets"]))
        st.write(
            {
                "mode": st.session_state["provenance_runtime"].live_mode,
                "requested_day0": live.requested_day0,
                "actual_day0": live.actual_day0,
                "as_of_date": live.as_of_date,
                "warnings": live.warnings,
            }
        )
    else:
        st.info("No live payload loaded yet.")


def render_analogues_tab(bundle) -> None:
    scores = filter_scores_by_active_events(current_scores(bundle), st.session_state["active_events"])
    if not scores:
        st.info("Load a live payload first from L1 Config.")
        return
    rows = [
        {
            "event": score.event,
            "composite": round(score.composite, 4),
            "raw_composite": round(score.raw_composite, 4),
            "quant": round(score.quant, 4),
            "tag": round(score.tag, 4),
            "macro": round(score.macro, 4),
            "shared_assets": score.shared_asset_count,
            "coverage": round(score.coverage_ratio, 3),
            "confidence": score.confidence_label,
        }
        for score in scores
    ]
    st.bar_chart(pd.DataFrame(rows).set_index("event")["composite"], use_container_width=True)
    dataframe_or_empty(rows)


def render_paths_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    scores = current_scores(bundle)
    selected_events = selected_event_names(bundle)
    asset = st.selectbox("Asset", bundle.all_labels, index=bundle.all_labels.index("Brent Futures") if "Brent Futures" in bundle.all_labels else 0, format_func=lambda label: display_label(bundle.asset_meta[label], label))
    rows = []
    for offset in range(-63, 64):
        row = {"offset": offset}
        for event_name in selected_events[:8]:
            row[event_name] = st.session_state["event_returns_runtime"].get(asset, {}).get(event_name, {}).get(offset)
        live_value = live.returns.get(asset, {}).get(offset)
        if live_value is not None:
            row["LIVE"] = live_value
        rows.append(row)
    st.line_chart(pd.DataFrame(rows).set_index("offset"), use_container_width=True)
    comp = []
    for offset in range(-63, 64):
        values = [st.session_state["event_returns_runtime"].get(asset, {}).get(event_name, {}).get(offset) for event_name in selected_events]
        values = [value for value in values if value is not None]
        if values:
            comp.append({"offset": offset, "composite_median": nan_median(values)})
    if comp:
        st.line_chart(pd.DataFrame(comp).set_index("offset"), use_container_width=True)
    st.caption(f"Selected analogue events: {', '.join(selected_events[:8])}")


def render_trade_ideas_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    scores = filter_scores_by_active_events(current_scores(bundle), st.session_state["active_events"])
    selected_events = select_events(scores, st.session_state["score_cutoff"]) if scores else []
    day_n = get_effective_scoring_day(live, st.session_state["similarity_assets"])
    horizon = st.session_state["horizon"]
    rows = compute_trade_rows(bundle.all_labels, st.session_state["event_returns_runtime"], bundle.asset_meta, selected_events, day_n, horizon, live)
    view_rows = [
        {
            "asset": display_label(bundle.asset_meta[row["lbl"]], row["lbl"]),
            "dir": row["dir"],
            "median": fmt_return(row["med"], row["is_rates"]),
            "hit_rate": round(row["hit_rate"] * 100, 1),
            "sharpe": round(row["sharpe"], 2),
            "sortino": round(row["sortino"], 2),
            "live_pctile": None if pd.isna(row["live_pctile"]) else round(row["live_pctile"], 1),
            "status": row["status"],
            "n": row["n"],
        }
        for row in rows
    ]
    dataframe_or_empty(view_rows)
    if rows:
        labels = [row["lbl"] for row in rows]
        default = st.session_state["selected_detail_asset"] or labels[0]
        st.session_state["selected_detail_asset"] = st.selectbox("Detail asset", labels, index=labels.index(default), format_func=lambda label: display_label(bundle.asset_meta[label], label))
        st.session_state["selected_detail_horizon"] = horizon
        st.session_state["selected_trade_idea"] = st.session_state["selected_detail_asset"]


def render_detail_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    scores = filter_scores_by_active_events(current_scores(bundle), st.session_state["active_events"])
    selected_events = select_events(scores, st.session_state["score_cutoff"]) if scores else []
    asset = st.session_state.get("selected_detail_asset") or (bundle.all_labels[0] if bundle.all_labels else None)
    if not asset:
        st.info("Pick a trade idea first.")
        return
    day_n = get_effective_scoring_day(live, st.session_state["similarity_assets"])
    horizon = st.session_state["selected_detail_horizon"] or st.session_state["horizon"]
    horizons = [{"label": label, "offset": offset} for label, offset in POIS if offset >= day_n]
    horizon_stats = compute_per_horizon_stats(asset, selected_events, day_n, st.session_state["event_returns_runtime"], horizons)
    dot_plot = build_dot_plot(asset, selected_events, day_n, day_n + horizon, st.session_state["event_returns_runtime"])
    deviation = build_live_deviation_series(asset, selected_events, day_n, st.session_state["event_returns_runtime"], live)
    rows = compute_trade_rows(bundle.all_labels, st.session_state["event_returns_runtime"], bundle.asset_meta, selected_events, day_n, horizon, live)
    corr = build_idea_correlation_matrix(rows, selected_events, day_n, horizon, st.session_state["event_returns_runtime"])
    st.subheader(display_label(bundle.asset_meta[asset], asset))
    dataframe_or_empty(horizon_stats, height=240)
    if dot_plot:
        st.scatter_chart(pd.DataFrame(dot_plot), x="event", y="value", use_container_width=True)
    if deviation:
        st.line_chart(pd.DataFrame(deviation).set_index("offset"), use_container_width=True)
    if corr:
        matrix = pd.DataFrame(corr["matrix"], index=corr["labels"], columns=corr["labels"])
        st.dataframe(matrix, use_container_width=True)
