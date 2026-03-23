from __future__ import annotations

from pathlib import Path

import streamlit as st

from config.defaults import DEFAULT_TAB_BY_GROUP, TAB_GROUPS
from data_access.artifacts import load_dashboard_bundle
from state.session import initialize_session, set_active_group, set_active_tab, workspace_root
from views.analysis import (
    render_leadlag_tab,
    render_prepos_tab,
    render_reverse_tab,
    render_rotation_tab,
    render_screener_tab,
)
from views.historical import (
    render_box_tab,
    render_cross_asset_tab,
    render_events_tab,
    render_heatmap_tab,
    render_overlay_tab,
    render_scatter_tab,
    render_stepin_tab,
    render_summary_tab,
    render_vix_tab,
)
from views.live import (
    render_analogues_tab,
    render_detail_tab,
    render_live_config_tab,
    render_paths_tab,
    render_trade_ideas_tab,
)
from views.risk import (
    render_confidence_tab,
    render_decay_tab,
    render_gate_tab,
    render_oos_tab,
    render_stress_tab,
)
from views.tools import render_correlation_tab, render_memo_tab


st.set_page_config(
    page_title="Analogue Dashboard Streamlit",
    page_icon=":bar_chart:",
    layout="wide",
    initial_sidebar_state="expanded",
)


TAB_RENDERERS = {
    "events": render_events_tab,
    "overlay": render_overlay_tab,
    "cross-asset": render_cross_asset_tab,
    "heatmap": render_heatmap_tab,
    "scatter": render_scatter_tab,
    "vix": render_vix_tab,
    "box": render_box_tab,
    "summary": render_summary_tab,
    "stepin": render_stepin_tab,
    "l1-config": render_live_config_tab,
    "l2-analogues": render_analogues_tab,
    "l3-paths": render_paths_tab,
    "l4-ideas": render_trade_ideas_tab,
    "l5-detail": render_detail_tab,
    "l6-screener": render_screener_tab,
    "l7-leadlag": render_leadlag_tab,
    "l8-reverse": render_reverse_tab,
    "l9-prepos": render_prepos_tab,
    "l10-rotation": render_rotation_tab,
    "l11-stress": render_stress_tab,
    "l12-decay": render_decay_tab,
    "l14-confidence": render_confidence_tab,
    "l15-oos": render_oos_tab,
    "gate": render_gate_tab,
    "correlation": render_correlation_tab,
    "l13-memo": render_memo_tab,
}


def sidebar(bundle) -> tuple[str, str]:
    with st.sidebar:
        st.title("Analogue Dashboard")
        st.caption("Python-native Streamlit build in a fully separate copy")
        st.caption(f"Workspace: {workspace_root()}")
        if bundle.provenance.historical_as_of:
            st.caption(f"Historical as-of: {bundle.provenance.historical_as_of}")
        st.divider()
        group = st.radio(
            "Section",
            list(TAB_GROUPS),
            index=list(TAB_GROUPS).index(st.session_state.get("active_group", "historical")),
            format_func=lambda value: value.title(),
        )
        if group != st.session_state.get("active_group"):
            set_active_group(group)
        tab_options = TAB_GROUPS[group]
        tab_ids = [tab_id for tab_id, _ in tab_options]
        label_map = {tab_id: label for tab_id, label in tab_options}
        current_tab = st.session_state.get("active_tab", DEFAULT_TAB_BY_GROUP[group])
        if current_tab not in tab_ids:
            current_tab = DEFAULT_TAB_BY_GROUP[group]
        tab = st.selectbox(
            "Tab",
            tab_ids,
            index=tab_ids.index(current_tab),
            format_func=lambda tab_id: label_map[tab_id],
        )
        if tab != st.session_state.get("active_tab"):
            set_active_tab(tab)
        st.divider()
        st.write(
            {
                "assets": len(bundle.all_labels),
                "events": len(st.session_state["events_runtime"]),
                "active_events": len(st.session_state["active_events"]),
                "custom_events": len(st.session_state["custom_events"]),
                "live_mode": st.session_state["provenance_runtime"].live_mode,
            }
        )
    return group, tab


def main() -> None:
    root = Path(__file__).resolve().parent
    bundle = load_dashboard_bundle(str(root))
    initialize_session(bundle)
    _, tab = sidebar(bundle)

    st.title("Analogue Dashboard Streamlit")
    st.caption("Separate Streamlit migration with artifact-driven parity targets and session-local custom events.")

    renderer = TAB_RENDERERS.get(tab)
    if not renderer:
        st.error(f"Tab not found: {tab}")
        return
    renderer(bundle)


if __name__ == "__main__":
    main()
