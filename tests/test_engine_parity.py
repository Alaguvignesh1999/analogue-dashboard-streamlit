from pathlib import Path

from config.defaults import DEFAULT_LIVE_SIM_ASSETS
from data_access.artifacts import load_dashboard_bundle
from engine.custom_events import compute_custom_event_returns
from engine.live_builder import build_live_payload_from_daily_history
from engine.similarity import run_analogue_match


ROOT = Path(__file__).resolve().parents[1]


def test_custom_event_builds_from_daily_history():
    bundle = load_dashboard_bundle(str(ROOT))
    assert bundle.daily_history is not None
    selected_date = bundle.events[-1].date
    computed = compute_custom_event_returns(bundle.daily_history, bundle.asset_meta, selected_date)
    assert computed["resolved_anchor_date"] is not None
    assert computed["resolved_anchor_date"] <= selected_date
    assert len(computed["returns_by_asset"]) > 0


def test_private_live_payload_builds():
    bundle = load_dashboard_bundle(str(ROOT))
    assert bundle.daily_history is not None
    requested_day0 = bundle.live_snapshot.requested_day0 if bundle.live_snapshot else bundle.events[-1].date
    payload = build_live_payload_from_daily_history(
        bundle.daily_history,
        bundle.asset_meta,
        requested_day0,
        "private",
        name="Test Scenario",
        labels=bundle.all_labels,
    )
    assert payload.actual_day0 <= requested_day0
    assert payload.day_n >= 0
    assert len(payload.returns) > 0


def test_similarity_scores_sort_descending():
    bundle = load_dashboard_bundle(str(ROOT))
    assert bundle.live_snapshot is not None
    scores = run_analogue_match(
        bundle.event_returns,
        bundle.live_snapshot.scoring_returns or bundle.live_snapshot.returns,
        set(bundle.live_snapshot.tag_set),
        bundle.live_snapshot.trigger_z_score,
        bundle.live_snapshot.cpi or "mid",
        bundle.live_snapshot.fed or "hold",
        bundle.live_snapshot.trading_day_n,
        bundle.trigger_z_scores,
        sim_assets=[asset for asset in DEFAULT_LIVE_SIM_ASSETS if asset in bundle.asset_meta],
        events=bundle.events,
        event_tags=bundle.event_tags,
        macro_context=bundle.macro_context,
    )
    assert scores
    assert scores[0].composite >= scores[-1].composite
