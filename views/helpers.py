from __future__ import annotations

import math

import pandas as pd
import streamlit as st

from config.defaults import ANALOGUE_WEIGHTS, POIS
from engine.live import (
    get_effective_scoring_date,
    get_effective_scoring_day,
    get_live_display_date,
    get_live_display_day,
    get_live_scoring_returns,
)
from engine.math_utils import nan_percentile
from engine.models import DashboardBundle
from engine.similarity import filter_scores_by_active_events, run_analogue_match, select_events
from state.session import (
    current_event_returns,
    current_event_tags,
    current_events,
    current_live_payload,
    current_macro_context,
)


def fmt_return(value: float, is_rates: bool, decimals: int = 1) -> str:
    if value is None or math.isnan(value):
        return "--"
    unit = "bp" if is_rates else "%"
    prefix = "+" if value >= 0 else ""
    return f"{prefix}{value:.{decimals}f}{unit}"


def fmt_dollar(value: float) -> str:
    if value is None or math.isnan(value):
        return "--"
    abs_value = abs(value)
    sign = "-" if value < 0 else ""
    if abs_value >= 1_000_000:
        return f"{sign}${abs_value / 1_000_000:.1f}M"
    if abs_value >= 1_000:
        return f"{sign}${abs_value / 1_000:.0f}k"
    return f"{sign}${abs_value:.0f}"


def active_event_defs() -> list:
    active = st.session_state["active_events"]
    return [event for event in current_events() if event.name in active]


def active_event_names() -> list[str]:
    return [event.name for event in active_event_defs()]


def current_scores(bundle: DashboardBundle) -> list:
    live = current_live_payload()
    scoring_returns = get_live_scoring_returns(live)
    if not live or not scoring_returns:
        return []
    similarity_assets = st.session_state["similarity_assets"]
    live_config = st.session_state["live_config"]
    weights = st.session_state.get("analogue_weights") or ANALOGUE_WEIGHTS
    scoring_day = get_effective_scoring_day(live, similarity_assets)
    return run_analogue_match(
        current_event_returns(),
        scoring_returns,
        set(live.tag_set or sorted(live_config["tags"])),
        live.trigger_z_score,
        live.cpi or live_config["cpi"],
        live.fed or live_config["fed"],
        scoring_day,
        bundle.trigger_z_scores,
        weights=weights,
        sim_assets=similarity_assets,
        events=active_event_defs(),
        event_tags=current_event_tags(),
        macro_context=current_macro_context(),
    )


def selected_event_names(bundle: DashboardBundle) -> list[str]:
    scores = filter_scores_by_active_events(current_scores(bundle), st.session_state["active_events"])
    cutoff = st.session_state["score_cutoff"]
    return select_events(scores, cutoff) if scores else active_event_names()


def diagnostics_line(labels: list[str] | None = None) -> str:
    live = current_live_payload()
    if not live:
        return "No live payload loaded"
    display_day = get_live_display_day(live)
    display_date = get_live_display_date(live) or "--"
    effective_day = get_effective_scoring_day(live, labels)
    effective_date = get_effective_scoring_date(live, labels) or "--"
    returns = get_live_scoring_returns(live) or {}
    target_labels = labels or list(returns)
    available = 0
    for label in target_labels:
        series = returns.get(label)
        if series and any(offset <= effective_day for offset in series):
            available += 1
    total = len(target_labels)
    ratio = available / total if total else 0.0
    return f"Live D+{display_day} ({display_date}) | Score D+{effective_day} ({effective_date}) | Coverage {available}/{total} ({ratio:.0%})"


def poi_options() -> list[tuple[str, int]]:
    return [(label, offset) for label, offset in POIS]


def bootstrap_stats(values: list[float], samples: int = 500) -> dict[str, float]:
    if not values:
        return {"median": math.nan, "p5": math.nan, "p95": math.nan, "std": math.nan}
    import random

    rng = random.Random(11)
    boot = []
    for _ in range(samples):
        resampled = [values[rng.randrange(len(values))] for _ in range(len(values))]
        boot.append(float(pd.Series(resampled).median()))
    return {
        "median": float(pd.Series(values).median()),
        "p5": nan_percentile(boot, 5),
        "p95": nan_percentile(boot, 95),
        "std": float(pd.Series(boot).std(ddof=0)),
    }


def dataframe_or_empty(rows: list[dict], *, height: int = 420) -> None:
    if not rows:
        st.info("No data available for the current settings.")
        return
    st.dataframe(pd.DataFrame(rows), use_container_width=True, height=height)
