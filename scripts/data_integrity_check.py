#!/usr/bin/env python3

from __future__ import annotations

import gzip
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"

CORE_LIVE_ASSETS = [
    "Brent Futures",
    "VIX",
    "Gold",
    "DXY",
    "S&P 500",
]

MANUAL_EVENT_PREFIXES = {
    "1973 Oil Embargo",
}


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_gzip_json(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def latest_observed_on_or_before(dates, values, observed_indices, target):
    match = None
    for idx in observed_indices:
        date = dates[idx]
        value = values[idx]
        if value is None:
            continue
        if date <= target:
            match = (date, float(value))
        else:
            break
    return match


def previous_observed_before(dates, values, observed_indices, target):
    previous = None
    for idx in observed_indices:
        date = dates[idx]
        value = values[idx]
        if value is None:
            continue
        if date < target:
            previous = (date, float(value))
        else:
            break
    return previous


def expected_live_move(meta_row, previous_price: float, current_price: float) -> float:
    if meta_row.get("is_rates_bp"):
        return round((current_price - previous_price) * 100, 4)

    move = (current_price / previous_price - 1) * 100
    if not meta_row.get("invert", True):
        move = -move
    return round(move, 4)


def is_manual_event(event_name: str) -> bool:
    return any(event_name.startswith(prefix) for prefix in MANUAL_EVENT_PREFIXES)


def main():
    meta = load_json(DATA_DIR / "meta.json")
    daily = load_gzip_json(DATA_DIR / "daily_history.json.gz")
    snapshot = load_json(DATA_DIR / "live_snapshot.json")
    event_returns = load_json(DATA_DIR / "event_returns.json")
    if "event_returns" in event_returns:
        event_returns = event_returns["event_returns"]

    asset_meta = meta["asset_meta"]
    availability = daily.get("availability", meta.get("availability", {}))
    dates = daily["dates"]
    observed_indices = daily.get("observedIndices", {})
    event_dates = {row["name"]: row["date"] for row in meta.get("events", [])}

    failures: list[str] = []

    if snapshot["actualDay0"] > snapshot["requestedDay0"]:
        failures.append("Shared snapshot actualDay0 uses lookahead.")

    trigger_label = "Brent Futures"
    trigger_match = latest_observed_on_or_before(
        dates,
        daily["prices"][trigger_label],
        observed_indices.get(trigger_label, list(range(len(dates)))),
        snapshot["requestedDay0"],
    )
    if not trigger_match:
        failures.append("Could not resolve Brent Futures on/before snapshot day0.")
    else:
        expected_date, expected_price = trigger_match
        if snapshot["actualDay0"] != expected_date:
            failures.append(
                f"Snapshot actualDay0 {snapshot['actualDay0']} != observed Brent anchor {expected_date}."
            )
        if abs(float(snapshot["triggerPrice"]) - round(expected_price, 4)) > 1e-6:
            failures.append("Snapshot triggerPrice does not match observed Brent anchor.")

    for label in CORE_LIVE_ASSETS:
        price_series = daily["prices"].get(label)
        observed = observed_indices.get(label)
        if not price_series or not observed:
            failures.append(f"{label}: missing observed daily-history series.")
            continue

        anchor = latest_observed_on_or_before(dates, price_series, observed, snapshot["requestedDay0"])
        previous = previous_observed_before(dates, price_series, observed, anchor[0] if anchor else snapshot["requestedDay0"])
        scoring_series = snapshot.get("scoringReturns", {}).get(label, {})

        if not anchor:
            failures.append(f"{label}: could not resolve anchor on/before requested day0.")
            continue
        if "0" not in scoring_series:
            failures.append(f"{label}: scoringReturns missing offset 0.")
            continue
        if not previous:
            failures.append(f"{label}: missing prior observed close before Day 0.")
            continue

        expected_move = expected_live_move(asset_meta[label], previous[1], anchor[1])
        actual_move = round(float(scoring_series["0"]), 4)
        if abs(expected_move - actual_move) > 1e-4:
            failures.append(
                f"{label}: scoring Day 0 move {actual_move} != prior-close-relative move {expected_move}."
            )

        scoring_offsets = sorted(int(offset) for offset in scoring_series.keys())
        contiguous = list(range(scoring_offsets[-1] + 1)) if scoring_offsets else []
        if scoring_offsets != contiguous:
            failures.append(f"{label}: scoringReturns offsets are not contiguous from 0.")

    for label, events in event_returns.items():
        start_date = (availability.get(label) or {}).get("startDate")
        if not start_date:
            continue
        for event_name in events.keys():
            if is_manual_event(event_name):
                continue
            event_date = event_dates.get(event_name)
            if not event_date:
                continue
            if event_date < start_date:
                failures.append(
                    f"{label}: event_returns contains pre-inception data for {event_name} ({event_date} < {start_date})."
                )

    for label in ["Bitcoin", "Ethereum"]:
        start_date = (availability.get(label) or {}).get("startDate")
        if not start_date:
            failures.append(f"{label}: missing availability start date.")
            continue
        for event_name in event_returns.get(label, {}).keys():
            if is_manual_event(event_name):
                continue
            event_date = event_dates.get(event_name)
            if event_date and event_date < start_date:
                failures.append(f"{label}: impossible event history detected for {event_name}.")

    similarity_pool = [
        "Brent Futures",
        "VIX",
        "Gold",
        "DXY",
        "S&P 500",
        "US 10Y Yield",
        "US HY OAS",
        "EURUSD",
        "USDJPY",
        "Copper",
        "Shipping (BDRY)",
    ]
    known_labels = set(meta.get("all_labels", []))
    missing_pool = [label for label in similarity_pool if label not in known_labels]
    if missing_pool:
        failures.append(f"Similarity pool contains labels missing from dataset: {missing_pool}")

    if failures:
        print("data integrity check FAIL")
        for failure in failures:
            print(f"  - {failure}")
        raise SystemExit(1)

    print("data integrity check ok")
    print(f"  Snapshot requested day0: {snapshot['requestedDay0']}")
    print(f"  Snapshot actual day0:    {snapshot['actualDay0']}")
    print(f"  Core live assets checked: {', '.join(CORE_LIVE_ASSETS)}")
    print("  Pre-inception event history checks passed for all non-manual events.")


if __name__ == "__main__":
    main()
