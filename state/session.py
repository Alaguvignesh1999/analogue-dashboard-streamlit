from __future__ import annotations

import copy
import random
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

import streamlit as st

from config.defaults import ANALOGUE_WEIGHTS, DEFAULT_LIVE_SIM_ASSETS, DEFAULT_TAB_BY_GROUP, load_live_defaults
from data_access.artifacts import clone_bundle
from engine.live_builder import build_live_payload_from_daily_history
from engine.models import CustomEventDef, DashboardBundle, DataProvenance, EventDef, MacroContext, SharedLiveSnapshot


def initialize_session(bundle: DashboardBundle) -> None:
    defaults = load_live_defaults()
    if st.session_state.get("_streamlit_dashboard_initialized"):
        return
    runtime_bundle = clone_bundle(bundle)
    st.session_state["_streamlit_dashboard_initialized"] = True
    st.session_state["active_group"] = "historical"
    st.session_state["active_tab"] = DEFAULT_TAB_BY_GROUP["historical"]
    st.session_state["events_runtime"] = runtime_bundle.events
    st.session_state["event_returns_runtime"] = runtime_bundle.event_returns
    st.session_state["event_tags_runtime"] = runtime_bundle.event_tags
    st.session_state["macro_context_runtime"] = runtime_bundle.macro_context
    st.session_state["active_events"] = {event.name for event in runtime_bundle.events}
    st.session_state["custom_events"] = []
    st.session_state["score_cutoff"] = 0.5
    st.session_state["analogue_weights"] = copy.deepcopy(ANALOGUE_WEIGHTS)
    st.session_state["similarity_assets"] = [asset for asset in DEFAULT_LIVE_SIM_ASSETS if asset in runtime_bundle.all_labels]
    st.session_state["scoring_mode"] = "live-sim"
    st.session_state["horizon"] = 21
    st.session_state["cross_asset_selection"] = set()
    st.session_state["selected_detail_asset"] = None
    st.session_state["selected_detail_horizon"] = None
    st.session_state["selected_trade_idea"] = None
    st.session_state["memo_text"] = ""
    st.session_state["live_config"] = {
        "name": defaults.get("name", "Live Event"),
        "day0": defaults.get("day0"),
        "tags": set(defaults.get("tags", [])),
        "trigger": 70.0,
        "cpi": defaults.get("cpi", "mid"),
        "fed": defaults.get("fed", "hold"),
    }
    st.session_state["live_payload"] = None
    st.session_state["provenance_runtime"] = copy.deepcopy(bundle.provenance)


def current_events() -> list[EventDef]:
    return st.session_state["events_runtime"]


def current_event_returns() -> dict:
    return st.session_state["event_returns_runtime"]


def current_event_tags() -> dict:
    return st.session_state["event_tags_runtime"]


def current_macro_context() -> dict:
    return st.session_state["macro_context_runtime"]


def current_provenance() -> DataProvenance:
    return st.session_state["provenance_runtime"]


def current_live_payload() -> SharedLiveSnapshot | None:
    return st.session_state.get("live_payload")


def set_active_group(group: str) -> None:
    st.session_state["active_group"] = group
    st.session_state["active_tab"] = DEFAULT_TAB_BY_GROUP[group]


def set_active_tab(tab_id: str) -> None:
    st.session_state["active_tab"] = tab_id


def update_live_config(**updates) -> None:
    st.session_state["live_config"] = {**st.session_state["live_config"], **updates}


def set_live_payload(payload: SharedLiveSnapshot | None) -> None:
    st.session_state["live_payload"] = payload


def set_provenance(**updates) -> None:
    provenance = st.session_state["provenance_runtime"]
    st.session_state["provenance_runtime"] = replace(provenance, **updates)


def load_shared_snapshot(bundle: DashboardBundle) -> None:
    if not bundle.live_snapshot:
        raise ValueError("live_snapshot.json is missing")
    payload = copy.deepcopy(bundle.live_snapshot)
    config = st.session_state["live_config"]
    config.update(
        {
            "name": payload.name,
            "day0": payload.requested_day0,
            "tags": set(payload.tag_set),
            "trigger": payload.trigger_price or config["trigger"],
            "cpi": payload.cpi or config["cpi"],
            "fed": payload.fed or config["fed"],
        }
    )
    st.session_state["live_config"] = config
    st.session_state["live_payload"] = payload
    set_provenance(
        live_source="live",
        live_mode="shared",
        live_as_of=payload.as_of_date,
        live_snapshot_date=payload.snapshot_date,
    )


def build_private_live(bundle: DashboardBundle) -> None:
    if not bundle.daily_history:
        raise ValueError("daily_history.json(.gz) is missing")
    config = st.session_state["live_config"]
    payload = build_live_payload_from_daily_history(
        bundle.daily_history,
        bundle.asset_meta,
        config["day0"],
        "private",
        name=config["name"],
        tags=sorted(config["tags"]),
        cpi=config["cpi"],
        fed=config["fed"],
        labels=bundle.all_labels,
        source="generated-history",
        schema_version=bundle.daily_history.schema_version,
    )
    payload.trigger_price = config["trigger"]
    st.session_state["live_payload"] = payload
    set_provenance(
        live_source="live",
        live_mode="private",
        live_as_of=payload.as_of_date,
        live_snapshot_date=payload.snapshot_date,
    )


def build_demo_live(bundle: DashboardBundle) -> None:
    rng = random.Random(7)
    assets = [asset for asset in bundle.all_labels[:20]]
    returns: dict[str, dict[int, float]] = {}
    levels: dict[str, dict[int, float]] = {}
    for asset in assets:
        drift = 0.15 if any(token in asset for token in ["Crude", "Brent", "Gas"]) else 0.08 if "Gold" in asset else -0.05
        vol = 1.5 if "VIX" in asset or "Vol" in asset else 0.8
        cumulative = 0.0
        level = 100.0
        returns[asset] = {}
        levels[asset] = {}
        for day in range(26):
            cumulative += drift + (rng.random() - 0.48) * vol
            level = max(1.0, level * (1 + cumulative / 1000))
            returns[asset][day] = round(cumulative, 2)
            levels[asset][day] = round(level, 2)
    config = st.session_state["live_config"]
    payload = SharedLiveSnapshot(
        name=config["name"],
        snapshot_date=datetime.now(timezone.utc).isoformat(),
        requested_day0=config["day0"],
        actual_day0=config["day0"],
        trigger_date=config["day0"],
        as_of_date=datetime.now(timezone.utc).date().isoformat(),
        day_n=25,
        trading_day_n=25,
        returns=returns,
        levels=levels,
        scoring_returns=returns,
        scoring_levels=levels,
        asset_status={},
        warnings=[],
        provenance_mode="private",
        provenance_source="generated-history",
        provenance_built_at=datetime.now(timezone.utc).isoformat(),
        schema_version=bundle.provenance.schema_version,
        business_dates=[f"D+{day}" for day in range(26)],
        trigger_price=config["trigger"],
        trigger_z_score=0.8,
        trigger_pctile=0.8,
        tag_set=sorted(config["tags"]),
        cpi=config["cpi"],
        fed=config["fed"],
        request_mode=None,
    )
    st.session_state["live_payload"] = payload
    set_provenance(live_source="demo", live_mode="demo", live_as_of=payload.as_of_date, live_snapshot_date=None)


def reset_live() -> None:
    st.session_state["live_payload"] = None
    set_provenance(live_source="none", live_mode="none", live_as_of=None, live_snapshot_date=None)


def add_custom_event(bundle: DashboardBundle, event: CustomEventDef, returns_by_asset: dict[str, dict[int, float]]) -> None:
    custom_events = [item for item in st.session_state["custom_events"] if item.name != event.name]
    custom_events.append(event)
    st.session_state["custom_events"] = sorted(custom_events, key=lambda item: item.date)

    events_runtime: list[EventDef] = [item for item in st.session_state["events_runtime"] if item.name != event.name]
    base_event = next((item for item in bundle.events if item.name == event.name), None)
    events_runtime.append(EventDef(event.name, event.date if not base_event else event.date))
    st.session_state["events_runtime"] = sorted(events_runtime, key=lambda item: item.date)

    event_returns_runtime = st.session_state["event_returns_runtime"]
    for label, series in returns_by_asset.items():
        event_returns_runtime.setdefault(label, {})
        event_returns_runtime[label][event.name] = series
    st.session_state["event_returns_runtime"] = event_returns_runtime

    event_tags_runtime = st.session_state["event_tags_runtime"]
    event_tags_runtime[event.name] = set(event.tags)
    st.session_state["event_tags_runtime"] = event_tags_runtime

    macro_context_runtime = st.session_state["macro_context_runtime"]
    macro_context_runtime[event.name] = MacroContext(event.trigger or 0.0, "mid", "hold")
    st.session_state["macro_context_runtime"] = macro_context_runtime

    active_events = set(st.session_state["active_events"])
    active_events.add(event.name)
    st.session_state["active_events"] = active_events


def remove_custom_event(bundle: DashboardBundle, name: str) -> None:
    base_event = next((event for event in bundle.events if event.name == name), None)
    custom_events = [item for item in st.session_state["custom_events"] if item.name != name]
    st.session_state["custom_events"] = custom_events

    event_returns_runtime = st.session_state["event_returns_runtime"]
    if base_event:
        for label, series_by_event in bundle.event_returns.items():
            if name in series_by_event:
                event_returns_runtime.setdefault(label, {})
                event_returns_runtime[label][name] = copy.deepcopy(series_by_event[name])
    else:
        for label in list(event_returns_runtime):
            event_returns_runtime[label].pop(name, None)
    st.session_state["event_returns_runtime"] = event_returns_runtime

    event_tags_runtime = st.session_state["event_tags_runtime"]
    macro_context_runtime = st.session_state["macro_context_runtime"]
    if base_event:
        event_tags_runtime[name] = copy.deepcopy(bundle.event_tags.get(name, set()))
        macro_context_runtime[name] = copy.deepcopy(bundle.macro_context.get(name))
        st.session_state["events_runtime"] = copy.deepcopy(bundle.events) + [item for item in custom_events if item.name not in {event.name for event in bundle.events}]
        st.session_state["events_runtime"] = sorted(st.session_state["events_runtime"], key=lambda item: item.date)
    else:
        event_tags_runtime.pop(name, None)
        macro_context_runtime.pop(name, None)
        st.session_state["events_runtime"] = [event for event in st.session_state["events_runtime"] if event.name != name]
        active_events = set(st.session_state["active_events"])
        active_events.discard(name)
        st.session_state["active_events"] = active_events
    st.session_state["event_tags_runtime"] = event_tags_runtime
    st.session_state["macro_context_runtime"] = macro_context_runtime


def workspace_root() -> Path:
    return Path(__file__).resolve().parents[1]
