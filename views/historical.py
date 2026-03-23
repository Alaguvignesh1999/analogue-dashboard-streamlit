from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import streamlit as st

from config.assets import ALL_ASSETS_OPTION, CUSTOM_GROUPS, get_group_labels, group_options_from_data
from config.defaults import POIS, POST_WINDOW_TD, PRE_WINDOW_TD
from engine.custom_events import compute_custom_event_returns, get_historical_coverage_range, get_trigger_price_for_date
from engine.live import get_live_display_day
from engine.math_utils import corrcoef, nan_max, nan_mean, nan_median, nan_min, nan_percentile, nan_std
from engine.returns import anchor_series_value, display_label, is_asset_available_for_event, poi_ret, unit_label
from state.session import add_custom_event, remove_custom_event
from views.helpers import dataframe_or_empty, fmt_return


def render_events_tab(bundle) -> None:
    current_names = [event.name for event in st.session_state["events_runtime"]]
    active = st.multiselect("Active events", current_names, default=sorted(st.session_state["active_events"]))
    st.session_state["active_events"] = set(active)

    coverage = get_historical_coverage_range(bundle.daily_history) if bundle.daily_history else {"start_date": None, "end_date": None}
    events_rows = []
    for event in st.session_state["events_runtime"]:
        tags = sorted(st.session_state["event_tags_runtime"].get(event.name, set()))
        source = "local" if any(item.name == event.name for item in st.session_state["custom_events"]) else "base"
        events_rows.append({"event": event.name, "date": event.date, "tags": ", ".join(tags), "source": source})
    st.caption(f"Historical coverage: {coverage['start_date'] or '--'} to {coverage['end_date'] or '--'}")
    dataframe_or_empty(events_rows, height=320)

    left, right = st.columns(2)
    with left:
        st.subheader("Add Custom Event")
        custom_name = st.text_input("Event name", key="hist_custom_name")
        custom_date = st.date_input("Selected date", key="hist_custom_date")
        custom_tags = st.multiselect("Tags", ["energy_shock", "military_conflict", "shipping_disruption", "sanctions", "pandemic"], key="hist_custom_tags")
        if st.button("Apply custom event", key="hist_add_custom"):
            if not bundle.daily_history:
                st.error("Daily history artifact is required for custom events.")
            else:
                date_text = custom_date.isoformat()
                computed = compute_custom_event_returns(bundle.daily_history, bundle.asset_meta, date_text)
                if not computed["resolved_anchor_date"]:
                    st.error("Could not resolve a trading-day anchor on or before that date.")
                else:
                    trigger = get_trigger_price_for_date(bundle.daily_history, date_text)
                    add_custom_event(
                        bundle,
                        event=__import__("engine.models", fromlist=["CustomEventDef"]).CustomEventDef(
                            name=custom_name.strip(),
                            date=computed["resolved_anchor_date"],
                            tags=list(custom_tags),
                            trigger=trigger["value"] if trigger else None,
                            created_at=datetime.now(timezone.utc).isoformat(),
                            selected_date=date_text,
                            resolved_anchor_date=computed["resolved_anchor_date"],
                        ),
                        returns_by_asset=computed["returns_by_asset"],
                    )
                    st.success(f"Added local event {custom_name.strip()} anchored at {computed['resolved_anchor_date']}.")
    with right:
        st.subheader("Exact-Date Override")
        override_target = st.selectbox("Existing event", current_names, key="hist_override_target")
        override_date = st.date_input("Override date", key="hist_override_date")
        default_tags = sorted(st.session_state["event_tags_runtime"].get(override_target, set()))
        override_tags = st.multiselect(
            "Override tags",
            ["energy_shock", "military_conflict", "shipping_disruption", "sanctions", "pandemic"],
            default=default_tags,
            key="hist_override_tags",
        )
        if st.button("Apply override", key="hist_apply_override"):
            if not bundle.daily_history:
                st.error("Daily history artifact is required for exact-date overrides.")
            else:
                date_text = override_date.isoformat()
                computed = compute_custom_event_returns(bundle.daily_history, bundle.asset_meta, date_text)
                trigger = get_trigger_price_for_date(bundle.daily_history, date_text)
                add_custom_event(
                    bundle,
                    event=__import__("engine.models", fromlist=["CustomEventDef"]).CustomEventDef(
                        name=override_target,
                        date=computed["resolved_anchor_date"] or date_text,
                        tags=list(override_tags),
                        trigger=trigger["value"] if trigger else None,
                        created_at=datetime.now(timezone.utc).isoformat(),
                        selected_date=date_text,
                        resolved_anchor_date=computed["resolved_anchor_date"],
                    ),
                    returns_by_asset=computed["returns_by_asset"],
                )
                st.success(f"Updated {override_target} locally to {computed['resolved_anchor_date'] or date_text}.")
        if st.button("Restore base event", key="hist_restore_override"):
            remove_custom_event(bundle, override_target)
            st.info(f"Restored {override_target} to the base artifact.")


def render_overlay_tab(bundle) -> None:
    class_options = bundle.all_classes
    selected_class = st.selectbox("Class", class_options, index=class_options.index("Oil & Energy") if "Oil & Energy" in class_options else 0)
    class_assets = [label for label, meta in bundle.asset_meta.items() if meta.class_name == selected_class]
    selected_asset = st.selectbox("Asset", class_assets, format_func=lambda label: display_label(bundle.asset_meta[label], label))
    anchor_mode = st.radio("Anchor", ["day0", "stepin"], horizontal=True)
    step_day = st.slider("Step day", -PRE_WINDOW_TD, POST_WINDOW_TD, 0, disabled=anchor_mode != "stepin")
    rows = []
    live = st.session_state["live_payload"]
    for offset in range(-PRE_WINDOW_TD, POST_WINDOW_TD + 1):
        row = {"offset": offset}
        for event_name in sorted(st.session_state["active_events"]):
            value = anchor_series_value(
                st.session_state["event_returns_runtime"].get(selected_asset, {}).get(event_name),
                offset,
                "stepin" if anchor_mode == "stepin" else "day0",
                step_day,
            )
            row[event_name] = value
        if live and live.returns.get(selected_asset):
            row["LIVE"] = anchor_series_value(
                live.returns[selected_asset],
                offset,
                "stepin" if anchor_mode == "stepin" else "day0",
                step_day,
            )
        rows.append(row)
    df = pd.DataFrame(rows).set_index("offset")
    st.caption(f"{display_label(bundle.asset_meta[selected_asset], selected_asset)} | {unit_label(bundle.asset_meta[selected_asset])}")
    st.line_chart(df, use_container_width=True)


def render_cross_asset_tab(bundle) -> None:
    event_names = [event.name for event in st.session_state["events_runtime"] if event.name in st.session_state["active_events"]]
    selected_event = st.selectbox("Event", event_names)
    group_options = [ALL_ASSETS_OPTION] + sorted(CUSTOM_GROUPS)
    group = st.selectbox("Browser group", group_options, index=group_options.index("Risk Barometer") if "Risk Barometer" in group_options else 0)
    default_assets = list(st.session_state["cross_asset_selection"]) or get_group_labels(group, bundle.all_labels, bundle.asset_meta)[:5]
    assets = st.multiselect("Assets", bundle.all_labels, default=default_assets, format_func=lambda label: display_label(bundle.asset_meta[label], label))
    st.session_state["cross_asset_selection"] = set(assets)
    rows = []
    for offset in range(-PRE_WINDOW_TD, POST_WINDOW_TD + 1):
        row = {"offset": offset}
        for asset in assets:
            row[display_label(bundle.asset_meta[asset], asset)] = anchor_series_value(
                st.session_state["event_returns_runtime"].get(asset, {}).get(selected_event),
                offset,
                "day0",
            )
        rows.append(row)
    if assets:
        st.line_chart(pd.DataFrame(rows).set_index("offset"), use_container_width=True)
    else:
        st.info("Select one or more assets to compare on a single event.")


def render_heatmap_tab(bundle) -> None:
    class_options = bundle.all_classes
    selected_class = st.selectbox("Class", class_options, key="heatmap_class", index=class_options.index("Oil & Energy") if "Oil & Energy" in class_options else 0)
    class_assets = [label for label, meta in bundle.asset_meta.items() if meta.class_name == selected_class]
    selected_asset = st.selectbox("Asset", class_assets, key="heatmap_asset", format_func=lambda label: display_label(bundle.asset_meta[label], label))
    event_dates = {event.name: event.date for event in st.session_state["events_runtime"]}
    rows = []
    for event_name in event_dates:
        if event_name not in st.session_state["active_events"]:
            continue
        if not is_asset_available_for_event(selected_asset, event_dates[event_name], bundle.availability):
            continue
        row = {"event": event_name}
        for label, offset in POIS:
            value = anchor_series_value(st.session_state["event_returns_runtime"].get(selected_asset, {}).get(event_name), offset, "day0")
            row[label] = round(value, 1) if value is not None else None
        rows.append(row)
    live = st.session_state["live_payload"]
    if live and live.returns.get(selected_asset):
        live_row = {"event": f"LIVE D+{get_live_display_day(live)}"}
        for label, offset in POIS:
            value = anchor_series_value(live.returns[selected_asset], offset, "day0")
            live_row[label] = round(value, 1) if value is not None else None
        rows.append(live_row)
    dataframe_or_empty(rows)


def render_scatter_tab(bundle) -> None:
    assets = sorted(bundle.all_labels)
    default_x = "Brent Futures" if "Brent Futures" in assets else assets[0]
    default_y = "Gold" if "Gold" in assets else assets[min(1, len(assets) - 1)]
    x_asset = st.selectbox("X asset", assets, index=assets.index(default_x), format_func=lambda label: display_label(bundle.asset_meta[label], label))
    y_asset = st.selectbox("Y asset", assets, index=assets.index(default_y), format_func=lambda label: display_label(bundle.asset_meta[label], label))
    poi_index = st.select_slider("POI", options=list(range(len(POIS))), value=0, format_func=lambda idx: POIS[idx][0])
    step_mode = st.checkbox("Step mode")
    step_day = st.slider("Step day", -PRE_WINDOW_TD, POST_WINDOW_TD, 0, disabled=not step_mode)
    poi_label, poi_offset = POIS[poi_index]
    event_dates = {event.name: event.date for event in st.session_state["events_runtime"]}
    rows = []
    for event_name in st.session_state["active_events"]:
        if not is_asset_available_for_event(x_asset, event_dates[event_name], bundle.availability):
            continue
        if not is_asset_available_for_event(y_asset, event_dates[event_name], bundle.availability):
            continue
        x_value = poi_ret(st.session_state["event_returns_runtime"], x_asset, event_name, poi_offset)
        y_value = poi_ret(st.session_state["event_returns_runtime"], y_asset, event_name, poi_offset)
        if step_mode:
            x_value -= poi_ret(st.session_state["event_returns_runtime"], x_asset, event_name, step_day)
            y_value -= poi_ret(st.session_state["event_returns_runtime"], y_asset, event_name, step_day)
        if pd.notna(x_value) and pd.notna(y_value):
            rows.append({"event": event_name, "x": x_value, "y": y_value, "series": "Historical"})
    live = st.session_state["live_payload"]
    if live and live.returns.get(x_asset) and live.returns.get(y_asset):
        x_live = live.returns[x_asset].get(get_live_display_day(live))
        y_live = live.returns[y_asset].get(get_live_display_day(live))
        if x_live is not None and y_live is not None:
            rows.append({"event": live.name, "x": x_live, "y": y_live, "series": "Live"})
    if rows:
        df = pd.DataFrame(rows)
        st.scatter_chart(df, x="x", y="y", color="series", use_container_width=True)
        st.caption(f"{display_label(bundle.asset_meta[x_asset], x_asset)} vs {display_label(bundle.asset_meta[y_asset], y_asset)} at {poi_label}")
        st.dataframe(df, use_container_width=True, height=240)
    else:
        st.info("No overlapping points available for the selected pair.")


def render_vix_tab(bundle) -> None:
    active_vix_events = [name for name in st.session_state["active_events"] if st.session_state["event_returns_runtime"].get("VIX", {}).get(name)]
    rows = []
    for offset in range(-PRE_WINDOW_TD, POST_WINDOW_TD + 1):
        values = [st.session_state["event_returns_runtime"]["VIX"][event].get(offset) for event in active_vix_events if offset in st.session_state["event_returns_runtime"]["VIX"][event]]
        values = [value for value in values if value is not None]
        row = {"offset": offset, "median": nan_median(values) if len(values) >= 2 else None, "q1": nan_percentile(values, 25) if len(values) >= 2 else None, "q3": nan_percentile(values, 75) if len(values) >= 2 else None}
        live = st.session_state["live_payload"]
        if live and live.returns.get("VIX") and offset in live.returns["VIX"]:
            row["LIVE"] = live.returns["VIX"][offset]
        rows.append(row)
    df = pd.DataFrame(rows).set_index("offset")
    st.line_chart(df[["median"] + (["LIVE"] if "LIVE" in df.columns else [])], use_container_width=True)
    dataframe_or_empty(pd.DataFrame(rows).to_dict("records"), height=280)


def render_box_tab(bundle) -> None:
    group_options = ["-- All --"] + sorted(CUSTOM_GROUPS)
    group = st.selectbox("Group", group_options, index=group_options.index("Risk Barometer") if "Risk Barometer" in group_options else 0)
    pois = st.multiselect("Horizons", [label for label, _ in POIS], default=[label for label, offset in POIS if offset >= 0])
    poi_map = dict(POIS)
    labels = bundle.all_labels[:20] if group == "-- All --" else [label for label in CUSTOM_GROUPS[group] if label in bundle.all_labels]
    rows = []
    for asset in labels:
        for poi_label in pois:
            offset = poi_map[poi_label]
            values = [poi_ret(st.session_state["event_returns_runtime"], asset, event_name, offset) for event_name in st.session_state["active_events"]]
            values = [value for value in values if pd.notna(value)]
            if len(values) < 2:
                continue
            rows.append(
                {
                    "asset": display_label(bundle.asset_meta[asset], asset),
                    "horizon": poi_label,
                    "min": nan_min(values),
                    "q1": nan_percentile(values, 25),
                    "median": nan_median(values),
                    "q3": nan_percentile(values, 75),
                    "max": nan_max(values),
                }
            )
    dataframe_or_empty(rows)


def render_summary_tab(bundle) -> None:
    group_options = ["All Assets"] + sorted(CUSTOM_GROUPS)
    group = st.selectbox("Summary group", group_options, index=group_options.index("Risk Barometer") if "Risk Barometer" in group_options else 0)
    labels = bundle.all_labels if group == "All Assets" else [label for label in CUSTOM_GROUPS[group] if label in bundle.all_labels]
    event_dates = {event.name: event.date for event in st.session_state["events_runtime"]}
    rows = []
    for asset in labels:
        row = {"asset": display_label(bundle.asset_meta[asset], asset)}
        for poi_label, poi_offset in POIS:
            values = []
            for event_name in st.session_state["active_events"]:
                if not is_asset_available_for_event(asset, event_dates[event_name], bundle.availability):
                    continue
                value = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, poi_offset)
                if pd.notna(value):
                    values.append(value)
            row[poi_label] = f"{nan_mean(values):.1f} +/- {nan_std(values):.1f}" if len(values) >= 2 else "--"
        rows.append(row)
    dataframe_or_empty(rows)


def render_stepin_tab(bundle) -> None:
    group_options = ["-- All --"] + sorted(CUSTOM_GROUPS)
    group = st.selectbox("Ranking group", group_options, index=group_options.index("Risk Barometer") if "Risk Barometer" in group_options else 0)
    step_day = st.slider("Entry day", 0, POST_WINDOW_TD, 5)
    fwd_offset = st.select_slider("Target horizon", options=[offset for _, offset in POIS if offset > 0], value=21, format_func=lambda offset: next(label for label, value in POIS if value == offset))
    labels = bundle.all_labels if group == "-- All --" else [label for label in CUSTOM_GROUPS[group] if label in bundle.all_labels]
    rows = []
    for asset in labels:
        values = []
        for event_name in st.session_state["active_events"]:
            at_step = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, step_day)
            at_fwd = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, fwd_offset)
            if pd.notna(at_step) and pd.notna(at_fwd):
                values.append(at_fwd - at_step)
        if len(values) < 2:
            continue
        median = nan_median(values)
        direction = 1 if median >= 0 else -1
        rows.append(
            {
                "asset": display_label(bundle.asset_meta[asset], asset),
                "signal": "LONG" if median >= 0 else "SHORT",
                "median": fmt_return(median, bundle.asset_meta[asset].is_rates_bp),
                "mean": fmt_return(nan_mean(values), bundle.asset_meta[asset].is_rates_bp),
                "std": round(nan_std(values), 2),
                "iqr": round(nan_percentile(values, 75) - nan_percentile(values, 25), 2),
                "hit_rate": round(len([value for value in values if value * direction > 0]) / len(values) * 100, 1),
                "sharpe": round(nan_mean([value * direction for value in values]) / (nan_std([value * direction for value in values]) + 1e-9), 2),
                "n": len(values),
            }
        )
    rows.sort(key=lambda row: abs(row["sharpe"]), reverse=True)
    dataframe_or_empty(rows)
