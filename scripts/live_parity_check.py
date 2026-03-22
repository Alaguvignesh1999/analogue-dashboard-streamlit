#!/usr/bin/env python3
"""
Lightweight regression check for the live analogue pipeline.

This does not execute the Next.js route directly. Instead it verifies the
same critical invariants that must hold for notebook parity:
1. Live returns are measured from the prior close before Day 0.
2. Sign handling matches the generated historical bundle.
3. Core analogue ranking stays in a sensible notebook-like range.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVENT_RETURNS_PATH = ROOT / "public" / "data" / "event_returns.json"

DAY0 = "2026-02-28"
CORE_ASSETS = {
    "Brent Futures": ("BZ=F", True),
    "VIX": ("^VIX", True),
    "Gold": ("GC=F", True),
    "DXY": ("DX-Y.NYB", True),
    "S&P 500": ("^GSPC", True),
}
EVENTS = [
    "1973 Oil Embargo",
    "1990 Gulf War",
    "1991 Kuwait Oil Fires",
    "1998 Desert Fox",
    "2001 Afghanistan (OEF)",
    "2003 SARS",
    "2003 Iraq War",
    "2011 Libya",
    "2014 ISIS/Mosul",
    "2017 Syria Strikes",
    "COVID-19",
    "2022 Russia-Ukraine",
    "2023 Red Sea Crisis",
]


def load_event_returns() -> dict:
    payload = json.loads(EVENT_RETURNS_PATH.read_text(encoding="utf-8"))
    return payload["event_returns"] if "event_returns" in payload else payload


def fetch_yahoo_series(ticker: str, start_date: str) -> list[tuple[str, float]]:
    period1 = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp())
    period2 = int((datetime.utcnow() + timedelta(days=1)).timestamp())
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(ticker)}?period1={period1}&period2={period2}&interval=1d"
    )
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
            "Referer": "https://finance.yahoo.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = json.load(response)
    result = payload["chart"]["result"][0]
    out: list[tuple[str, float]] = []
    for ts, close in zip(result["timestamp"], result["indicators"]["quote"][0]["close"]):
        if close is None:
            continue
        out.append((datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d"), float(close)))
    return out


def build_live_returns(day0: str) -> dict[str, dict[int, float]]:
    start_date = (datetime.strptime(day0, "%Y-%m-%d") - timedelta(days=10)).strftime("%Y-%m-%d")
    live: dict[str, dict[int, float]] = {}

    for label, (ticker, invert) in CORE_ASSETS.items():
        observations = fetch_yahoo_series(ticker, start_date)
        day0_index = next((i for i, (date_str, _) in enumerate(observations) if date_str >= day0), None)
        if day0_index is None:
            continue

        baseline = observations[day0_index - 1][1] if day0_index > 0 else observations[day0_index][1]
        series: dict[int, float] = {}
        for offset, (_, price) in enumerate(observations[day0_index:]):
            pct = ((price / baseline) - 1) * 100
            series[offset] = pct if invert else -pct
        live[label] = series

    return live


def nearest_at_or_before(series: dict[int, float], target: int, tolerance: int) -> float:
    offsets = sorted(offset for offset in series if abs(offset - target) <= tolerance)
    if not offsets:
        return float("nan")
    below = [offset for offset in offsets if offset <= target]
    best = below[-1] if below else offsets[0]
    return series[best]


def cosine(a: list[float], b: list[float]) -> float:
    pairs = [(x, y) for x, y in zip(a, b) if not (math.isnan(x) or math.isnan(y))]
    if len(pairs) < 2:
        return 0.0
    dot = sum(x * y for x, y in pairs)
    na = sum(x * x for x, _ in pairs)
    nb = sum(y * y for _, y in pairs)
    return dot / math.sqrt(na * nb) if na > 0 and nb > 0 else 0.0


def path_vec(source: dict[str, dict[int, float]], assets: list[str], dn: int) -> list[float]:
    out: list[float] = []
    for asset in assets:
        series = source.get(asset, {})
        for offset in range(dn + 1):
            value = nearest_at_or_before(series, offset, 1)
            out.append(0.0 if math.isnan(value) else value)
    return out


def rank_quant_only(event_returns: dict, live_returns: dict[str, dict[int, float]]) -> list[tuple[str, float]]:
    dn = max(max(series.keys()) for series in live_returns.values())
    scores: list[tuple[str, float]] = []

    for event_name in EVENTS:
        historical: dict[str, dict[int, float]] = {}
        for asset in CORE_ASSETS:
            series = event_returns.get(asset, {}).get(event_name)
            if series:
                historical[asset] = {int(k): float(v) for k, v in series.items()}
        live_vec = path_vec(live_returns, list(CORE_ASSETS.keys()), dn)
        hist_vec = path_vec(historical, list(CORE_ASSETS.keys()), dn)
        scores.append((event_name, (cosine(live_vec, hist_vec) + 1) / 2))

    scores.sort(key=lambda row: row[1], reverse=True)
    return scores


def main() -> int:
    event_returns = load_event_returns()
    live_returns = build_live_returns(DAY0)

    failures: list[str] = []

    for asset in CORE_ASSETS:
        live_t0 = live_returns.get(asset, {}).get(0)
        if live_t0 is None:
            failures.append(f"{asset}: missing live Day 0 value")
            continue
        if abs(live_t0) < 1e-6:
            failures.append(f"{asset}: live Day 0 is ~0, expected prior-close-relative move")

    ranks = rank_quant_only(event_returns, live_returns)
    russia_rank = next(i + 1 for i, row in enumerate(ranks) if row[0] == "2022 Russia-Ukraine")
    if russia_rank > 3:
        failures.append(f"2022 Russia-Ukraine ranked #{russia_rank} in quant-only check; expected top 3")

    print("Live parity check")
    print(f"  Day 0 input: {DAY0}")
    print(f"  Assets checked: {', '.join(CORE_ASSETS.keys())}")
    print(f"  Quant-only Russia-Ukraine rank: #{russia_rank}")
    print("  Top 5 quant-only:")
    for event_name, score in ranks[:5]:
        print(f"    {event_name}: {score:.4f}")

    if failures:
      print("FAIL")
      for failure in failures:
          print(f"  - {failure}")
      return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
