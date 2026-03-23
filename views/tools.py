from __future__ import annotations

import pandas as pd
import streamlit as st

from config.assets import CUSTOM_GROUPS
from config.defaults import SIMILARITY_ASSET_POOL
from engine.live import get_effective_scoring_date, get_effective_scoring_day, get_live_display_date, get_live_display_day
from engine.math_utils import corrcoef, nan_max, nan_mean, nan_min, nan_percentile, nan_std
from engine.returns import display_label, poi_ret
from engine.similarity import filter_scores_by_active_events, select_events
from views.helpers import current_scores, dataframe_or_empty, fmt_return


def render_correlation_tab(bundle) -> None:
    group = st.selectbox("Correlation group", list(CUSTOM_GROUPS), index=list(CUSTOM_GROUPS).index("Equities") if "Equities" in CUSTOM_GROUPS else 0)
    max_offset = st.slider("Window", 5, 63, 21)
    min_overlap = st.slider("Min overlap", 3, 50, 10)
    labels = [label for label in CUSTOM_GROUPS[group] if label in bundle.asset_meta]
    active_event_names = [event.name for event in st.session_state["events_runtime"] if event.name in st.session_state["active_events"]]
    rows = []
    for asset_a in labels:
        row = {"asset": display_label(bundle.asset_meta[asset_a], asset_a)}
        for asset_b in labels:
            vector_a = []
            vector_b = []
            for event_name in active_event_names:
                for offset in range(max_offset + 1):
                    value_a = poi_ret(st.session_state["event_returns_runtime"], asset_a, event_name, offset)
                    value_b = poi_ret(st.session_state["event_returns_runtime"], asset_b, event_name, offset)
                    if pd.notna(value_a) and pd.notna(value_b):
                        vector_a.append(value_a)
                        vector_b.append(value_b)
            overlap = min(len(vector_a), len(vector_b))
            row[display_label(bundle.asset_meta[asset_b], asset_b)] = round(corrcoef(vector_a, vector_b), 3) if overlap >= min_overlap else None
        rows.append(row)
    dataframe_or_empty(rows)


def render_memo_tab(bundle) -> None:
    live = st.session_state["live_payload"]
    if not live:
        st.info("Load a live payload first.")
        return
    scores = filter_scores_by_active_events(current_scores(bundle), st.session_state["active_events"])
    selected_events = select_events(scores, st.session_state["score_cutoff"]) if scores else []
    memo_assets = [asset for asset in SIMILARITY_ASSET_POOL if asset in bundle.asset_meta]
    day_n = get_effective_scoring_day(live, memo_assets)
    effective_date = get_effective_scoring_date(live, memo_assets)
    display_day = get_live_display_day(live)
    display_date = get_live_display_date(live)
    if st.button("Generate memo"):
        lines = [
            "# Trade Memo",
            "",
            "## Event Context",
            f"- Live event: {live.name or '--'}",
            f"- Requested Day 0: {live.requested_day0 or '--'}",
            f"- Current live state: D+{display_day}{f' ({display_date})' if display_date else f' ({effective_date})' if effective_date else ''}",
            f"- Horizon: D+{display_day} to D+{display_day + st.session_state['horizon']}",
            f"- Analogues selected: {len(selected_events)} of {len(scores)} active events (cutoff {st.session_state['score_cutoff']:.2f})",
            "",
            "## Top Analogues",
        ]
        for score in scores[:8]:
            selected = "[selected]" if score.composite >= st.session_state["score_cutoff"] else "[watch]"
            lines.append(f"- {selected} {score.event}: composite {score.composite * 100:.0f}%, quant {score.quant * 100:.0f}%, tag {score.tag * 100:.0f}%, macro {score.macro * 100:.0f}%")
        lines.extend(["", "## Top Signals"])
        asset_signals = []
        for asset in memo_assets:
            values = []
            for event_name in selected_events:
                start = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, day_n)
                finish = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, day_n + st.session_state["horizon"])
                if pd.notna(start) and pd.notna(finish):
                    values.append(finish - start)
            if len(values) < 2:
                continue
            median = nan_percentile(values, 50)
            iqr = nan_percentile(values, 75) - nan_percentile(values, 25)
            direction = 1 if median >= 0 else -1
            hit_rate = len([value for value in values if value * direction > 0]) / len(values)
            sharpe = nan_mean([value * direction for value in values]) / (nan_std([value * direction for value in values]) + 1e-9)
            asset_signals.append((asset, median, iqr, hit_rate, sharpe, len(values)))
        asset_signals.sort(key=lambda item: abs(item[4]), reverse=True)
        for asset, median, _, hit_rate, sharpe, count in asset_signals[:12]:
            direction = "LONG" if median >= 0 else "SHORT"
            lines.append(f"- {direction} {display_label(bundle.asset_meta[asset], asset)}: median {fmt_return(median, bundle.asset_meta[asset].is_rates_bp)}, hit {hit_rate * 100:.0f}%, Sharpe {sharpe:.2f}, n={count}")
        lines.extend(["", "## Risk Summary"])
        all_forwards = []
        for asset, *_ in asset_signals:
            for event_name in selected_events:
                start = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, day_n)
                finish = poi_ret(st.session_state["event_returns_runtime"], asset, event_name, day_n + st.session_state["horizon"])
                if pd.notna(start) and pd.notna(finish):
                    all_forwards.append(finish - start)
        if all_forwards:
            lines.append(f"- Cross-asset range: {nan_min(all_forwards):.1f} to {nan_max(all_forwards):.1f}")
            lines.append(f"- 5th percentile: {nan_percentile(all_forwards, 5):.1f}")
            lines.append(f"- 95th percentile: {nan_percentile(all_forwards, 95):.1f}")
        else:
            lines.append("- No aggregate forward distribution available.")
        lines.append(f"- Historical analogue count: {len(selected_events)}")
        lines.append(f"- Provenance: {live.request_mode or ('loaded live' if live.returns else 'none')}{f', snapshot {live.snapshot_date}' if live.snapshot_date else ''}")
        st.session_state["memo_text"] = "\n".join(lines)
    if st.session_state.get("memo_text"):
        st.code(st.session_state["memo_text"], language="markdown")
