#!/usr/bin/env python3

import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
CONFIG_PATH = ROOT / "config" / "live_defaults.json"


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_gzip_json(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def latest_on_or_before(dates, values, target):
    match = None
    for idx, date in enumerate(dates):
        value = values[idx]
        if value is None:
            continue
        if date <= target:
            match = (date, value)
        else:
            break
    return match


def latest_observed_on_or_before(dates, values, observed_indices, target):
    match = None
    for idx in observed_indices:
        date = dates[idx]
        value = values[idx]
        if value is None:
            continue
        if date <= target:
            match = (date, value)
        else:
            break
    return match


def main():
    defaults = load_json(CONFIG_PATH)
    snapshot = load_json(DATA_DIR / "live_snapshot.json")
    daily = load_gzip_json(DATA_DIR / "daily_history.json.gz")

    assert snapshot["requestedDay0"] == defaults["day0"], "Snapshot day0 does not match shared default"
    assert snapshot["actualDay0"] <= snapshot["requestedDay0"], "Snapshot actualDay0 uses lookahead"
    assert snapshot["provenance"]["mode"] == "shared", "Snapshot provenance mode should be shared"
    assert snapshot["provenance"]["source"] == "shared-snapshot", "Snapshot provenance source should be shared-snapshot"
    assert snapshot["dayN"] >= 0, "Snapshot dayN should be non-negative"
    assert snapshot["tradingDayN"] >= 0, "Snapshot tradingDayN should be non-negative"
    assert "Brent Futures" in snapshot["returns"], "Snapshot should include Brent Futures"

    dates = daily["dates"]
    brent = daily["prices"]["Brent Futures"]
    observed_indices = daily.get("observedIndices", {}).get("Brent Futures", list(range(len(dates))))
    match = latest_observed_on_or_before(dates, brent, observed_indices, defaults["day0"])
    assert match is not None, "Could not resolve Brent Futures on or before default day0"
    expected_date, expected_price = match

    assert snapshot["actualDay0"] == expected_date, "Snapshot actualDay0 should be latest available on or before day0"
    assert abs(snapshot["triggerPrice"] - round(float(expected_price), 4)) < 1e-6, "Trigger price mismatch"

    print("live snapshot contract ok")


if __name__ == "__main__":
    main()
