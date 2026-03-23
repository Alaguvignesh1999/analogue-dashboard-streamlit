from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIVE_DEFAULTS_PATH = ROOT / "config" / "live_defaults.json"

PRE_WINDOW_TD = 63
POST_WINDOW_TD = 63
FETCH_BUFFER = 90
TRIGGER_ASSET = "Brent Futures"
DATA_SCHEMA_VERSION = 2
TRIGGER_ZSCORE_SIGMA = 1.5
KELLY_FRACTION = 0.5
RISK_BUDGET_USD = 100_000
VOL_SCALAR_DAYS = 21
STEP_IN_PRIMARY = 7

POIS = [
    ("t-3M", -63),
    ("t-1M", -21),
    ("t-1W", -5),
    ("t0", 0),
    ("t+1W", 5),
    ("t+1M", 21),
    ("t+3M", 63),
]

ANALOGUE_WEIGHTS = {"quant": 0.50, "tag": 0.30, "macro": 0.20}

SIMILARITY_ASSET_POOL = [
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

DEFAULT_LIVE_SIM_ASSETS = [
    "Brent Futures",
    "VIX",
    "Gold",
    "DXY",
    "S&P 500",
]

PORTFOLIO_SCENARIOS = {
    "Geopolitical Long": {
        "Brent Futures": 500_000,
        "WTI Crude (spot)": 300_000,
        "Gold": 400_000,
        "20Y Treasury (TLT)": 300_000,
        "Defense (ITA)": 200_000,
        "S&P 500": -300_000,
        "MSCI EM": -200_000,
        "Airlines (JETS)": -150_000,
    },
    "Risk-Off Flight": {
        "20Y Treasury (TLT)": 600_000,
        "Gold": 400_000,
        "USDJPY": -300_000,
        "USDCHF": -200_000,
        "HY Bond ETF (HYG)": -400_000,
        "EM Sov Debt (EMB)": -300_000,
        "MSCI EM": -300_000,
    },
    "Oil Shock Arb": {
        "Brent Futures": 600_000,
        "Natural Gas Fut": 200_000,
        "Oil Services": 300_000,
        "Energy Equities": 300_000,
        "USDNOK": -200_000,
        "USDCAD": -200_000,
        "Airlines (JETS)": -400_000,
        "Technology": -200_000,
    },
}

TAB_GROUPS = {
    "historical": [
        ("events", "Events"),
        ("overlay", "Overlay"),
        ("cross-asset", "Cross Asset"),
        ("heatmap", "Heatmap"),
        ("scatter", "Scatter"),
        ("vix", "VIX"),
        ("box", "Box"),
        ("summary", "Summary"),
        ("stepin", "Step-In"),
    ],
    "live": [
        ("l1-config", "L1 Config"),
        ("l2-analogues", "L2 Analogues"),
        ("l3-paths", "L3 Paths"),
        ("l4-ideas", "L4 Ideas"),
        ("l5-detail", "L5 Detail"),
    ],
    "analysis": [
        ("l6-screener", "L6 Screener"),
        ("l7-leadlag", "L7 Lead Lag"),
        ("l8-reverse", "L8 Reverse"),
        ("l9-prepos", "L9 PrePos"),
        ("l10-rotation", "L10 Rotation"),
    ],
    "risk": [
        ("l11-stress", "L11 Stress"),
        ("l12-decay", "L12 Decay"),
        ("l14-confidence", "L14 Confidence"),
        ("l15-oos", "L15 OOS"),
        ("gate", "Gate"),
    ],
    "tools": [
        ("correlation", "Correlation"),
        ("l13-memo", "L13 Memo"),
    ],
}

DEFAULT_TAB_BY_GROUP = {
    "historical": "overlay",
    "live": "l1-config",
    "analysis": "l6-screener",
    "risk": "l11-stress",
    "tools": "correlation",
}


def load_live_defaults() -> dict:
    return json.loads(LIVE_DEFAULTS_PATH.read_text(encoding="utf-8"))
