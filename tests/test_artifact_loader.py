from pathlib import Path

from data_access.artifacts import load_dashboard_bundle


ROOT = Path(__file__).resolve().parents[1]


def test_bundle_loads():
    bundle = load_dashboard_bundle(str(ROOT))
    assert len(bundle.all_labels) >= 100
    assert len(bundle.events) >= 13
    assert bundle.provenance.schema_version is not None


def test_live_snapshot_contract_if_present():
    bundle = load_dashboard_bundle(str(ROOT))
    if not bundle.live_snapshot:
        return
    snapshot = bundle.live_snapshot
    assert snapshot.actual_day0 <= snapshot.requested_day0
    assert snapshot.day_n >= 0
    assert "Brent Futures" in snapshot.returns
