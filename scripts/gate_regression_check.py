import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
HORIZON = 21
CORE_ASSETS = [
    "Brent Futures",
    "S&P 500",
    "Gold",
    "VIX",
    "DXY",
]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def to_numeric_series(series):
    return {int(key): float(value) for key, value in series.items()}


def point_at_or_before(series, target_offset):
    eligible = [offset for offset in series.keys() if offset <= target_offset]
    if not eligible:
        return None
    offset = max(eligible)
    return offset, series[offset]


def main():
    snapshot = load_json(DATA_DIR / "live_snapshot.json")
    event_returns = load_json(DATA_DIR / "event_returns.json")

    scoring_returns = {
        label: to_numeric_series(series)
        for label, series in snapshot.get("scoringReturns", {}).items()
    }
    scoring_levels = {
        label: to_numeric_series(series)
        for label, series in snapshot.get("scoringLevels", {}).items()
    }

    available_assets = [asset for asset in CORE_ASSETS if asset in scoring_returns and scoring_returns[asset]]
    if len(available_assets) < 3:
        raise SystemExit(f"Expected at least 3 core assets in live snapshot, found {available_assets}")

    effective_day = min(
        int(snapshot.get("tradingDayN", 0)),
        max(max(series.keys()) for asset, series in scoring_returns.items() if asset in available_assets),
    )

    business_dates = snapshot.get("businessDates", [])
    if business_dates and effective_day >= len(business_dates):
        raise SystemExit(
            f"Effective scoring day {effective_day} exceeds businessDates length {len(business_dates)}"
        )

    errors = []
    checked = []

    for asset in available_assets:
        live_point = point_at_or_before(scoring_returns[asset], effective_day)
        level_point = point_at_or_before(scoring_levels.get(asset, {}), effective_day)
        if live_point is None:
            errors.append(f"{asset}: no live scoring return on or before D+{effective_day}")
            continue
        if level_point is None:
            errors.append(f"{asset}: no live scoring level on or before D+{effective_day}")
            continue

        historical_series = event_returns.get(asset, {})
        hist_at_day = []
        fwd_vals = []
        for event_name, series in historical_series.items():
            numeric = to_numeric_series(series)
            start = numeric.get(live_point[0])
            finish = numeric.get(live_point[0] + HORIZON)
            if start is not None:
                hist_at_day.append(start)
            if start is not None and finish is not None:
                fwd_vals.append(finish - start)

        if len(hist_at_day) < 2:
            errors.append(f"{asset}: insufficient historical comparisons at D+{live_point[0]} ({len(hist_at_day)})")
            continue
        if len(fwd_vals) < 2:
            errors.append(f"{asset}: insufficient forward values for gate horizon ({len(fwd_vals)})")
            continue

        checked.append((asset, live_point[0], len(hist_at_day), len(fwd_vals)))

    if errors:
        details = "\n".join(f"- {error}" for error in errors)
        raise SystemExit(f"Gate regression failed:\n{details}")

    print(
        "Gate regression passed for "
        + ", ".join(f"{asset}@D+{offset} ({hist_n}/{fwd_n})" for asset, offset, hist_n, fwd_n in checked)
    )


if __name__ == "__main__":
    main()
