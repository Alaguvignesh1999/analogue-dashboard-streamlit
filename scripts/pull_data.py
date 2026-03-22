#!/usr/bin/env python3
"""
Data pull script for GitHub Actions.
Pulls all yfinance + FRED data, computes event_returns, and outputs JSON.
Mirrors notebook §3.1 logic exactly.
"""

import json, os, time, hashlib, gzip, warnings
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
import requests

warnings.filterwarnings("ignore")

OUT_DIR = Path("public/data")
OUT_DIR.mkdir(parents=True, exist_ok=True)
LIVE_DEFAULTS_PATH = Path("config/live_defaults.json")

FRED_API_KEY = os.environ.get("FRED_API_KEY", "")
FRED_TIMEOUT = 60

# ── CONFIG (mirrors §1.2–§1.6) ───────────────────────────────

EVENTS = [
    ("1990 Gulf War",           "1990-08-02"),
    ("1991 Kuwait Oil Fires",   "1991-01-16"),
    ("1998 Desert Fox",         "1998-12-16"),
    ("2001 Afghanistan (OEF)",  "2001-10-07"),
    ("2003 SARS",               "2003-03-12"),
    ("2003 Iraq War",           "2003-03-20"),
    ("2011 Libya",              "2011-03-19"),
    ("2014 ISIS/Mosul",         "2014-06-10"),
    ("2017 Syria Strikes",      "2017-04-07"),
    ("COVID-19",                "2020-03-01"),
    ("2022 Russia-Ukraine",     "2022-02-24"),
    ("2023 Red Sea Crisis",     "2023-12-19"),
]

PRE_WINDOW_TD  = 63
POST_WINDOW_TD = 63
FETCH_BUFFER   = 90
TRIGGER_ASSET  = "Brent Futures"

POIS = [("t-3M",-63),("t-1M",-21),("t-1W",-5),("t0",0),("t+1W",5),("t+1M",21),("t+3M",63)]

YF_RATES_TICKERS = {"^IRX","^FVX","^TNX","^TYX"}
FRED_PRICE_SERIES = set()
INVERT_OVERRIDE = {"DXY": True}
VIX_TICKER = "^VIX"
VIX_LABEL = "VIX"

ASSETS = [
    ("S&P 500","^GSPC","Equities","yf"),
    ("MSCI World ex-US","EFA","Equities","yf"),
    ("MSCI EM","EEM","Equities","yf"),
    ("Energy Equities","XLE","Equities","yf"),
    ("Nikkei 225","^N225","World Indices","yf"),
    ("KOSPI","^KS11","World Indices","yf"),
    ("Hang Seng","^HSI","World Indices","yf"),
    ("Shanghai Comp","000001.SS","World Indices","yf"),
    ("Taiwan Weighted","^TWII","World Indices","yf"),
    ("ASX 200","^AXJO","World Indices","yf"),
    ("Nifty 50","^NSEI","World Indices","yf"),
    ("FTSE 100","^FTSE","World Indices","yf"),
    ("DAX","^GDAXI","World Indices","yf"),
    ("CAC 40","^FCHI","World Indices","yf"),
    ("Euro Stoxx 50","^STOXX50E","World Indices","yf"),
    ("STI","^STI","World Indices","yf"),
    ("Sensex","^BSESN","World Indices","yf"),
    ("Jakarta Comp","^JKSE","World Indices","yf"),
    ("Comm Services","XLC","Sector ETFs","yf"),
    ("Materials","XLB","Sector ETFs","yf"),
    ("Financials","XLF","Sector ETFs","yf"),
    ("Industrials","XLI","Sector ETFs","yf"),
    ("Technology","XLK","Sector ETFs","yf"),
    ("Cons Staples","XLP","Sector ETFs","yf"),
    ("Real Estate","XLRE","Sector ETFs","yf"),
    ("Utilities","XLU","Sector ETFs","yf"),
    ("Healthcare","XLV","Sector ETFs","yf"),
    ("Cons Discret","XLY","Sector ETFs","yf"),
    ("Gold Miners","GDX","Sector ETFs","yf"),
    ("Oil Services","OIH","Sector ETFs","yf"),
    ("Regional Banks","KRE","Sector ETFs","yf"),
    ("Homebuilders","ITB","Sector ETFs","yf"),
    ("Innovation (ARKK)","ARKK","Sector ETFs","yf"),
    ("20Y Treasury (TLT)","TLT","Bond ETFs","yf"),
    ("7-10Y Treasury (IEF)","IEF","Bond ETFs","yf"),
    ("1-3Y Treasury (SHY)","SHY","Bond ETFs","yf"),
    ("TIPS ETF (TIP)","TIP","Bond ETFs","yf"),
    ("Gold ETF (IAU)","IAU","Bond ETFs","yf"),
    ("Airlines (JETS)","JETS","Thematic ETFs","yf"),
    ("Agri (MOO)","MOO","Thematic ETFs","yf"),
    ("Defense (ITA)","ITA","Thematic ETFs","yf"),
    ("Cyber Security (BUG)","BUG","Thematic ETFs","yf"),
    ("Clean Energy (ICLN)","ICLN","Thematic ETFs","yf"),
    ("Nuclear (NLR)","NLR","Thematic ETFs","yf"),
    ("ETF Japan","EWJ","Country ETFs","yf"),
    ("ETF Brazil","EWZ","Country ETFs","yf"),
    ("ETF Korea","EWY","Country ETFs","yf"),
    ("ETF Taiwan","EWT","Country ETFs","yf"),
    ("ETF China","MCHI","Country ETFs","yf"),
    ("ETF Germany","EWG","Country ETFs","yf"),
    ("ETF UK","EWU","Country ETFs","yf"),
    ("ETF Australia","EWA","Country ETFs","yf"),
    ("ETF India","INDA","Country ETFs","yf"),
    ("ETF Mexico","EWW","Country ETFs","yf"),
    ("ETF South Africa","EZA","Country ETFs","yf"),
    ("ETF Turkey","TUR","Country ETFs","yf"),
    ("WTI Crude (spot)","CL=F","Oil & Energy","yf"),
    ("Brent Futures","BZ=F","Oil & Energy","yf"),
    ("Natural Gas Fut","NG=F","Oil & Energy","yf"),
    ("Oil Vol (OVX)","^OVX","Oil & Energy","yf"),
    ("Gasoline (UGA)","UGA","Oil & Energy","yf"),
    ("Gold","GC=F","Precious Metals","yf"),
    ("Silver","SI=F","Precious Metals","yf"),
    ("Platinum","PL=F","Precious Metals","yf"),
    ("Palladium","PA=F","Precious Metals","yf"),
    ("Gold Vol (GVZ)","^GVZ","Precious Metals","yf"),
    ("DXY","DX-Y.NYB","FX","yf"),
    ("USDCHF","USDCHF=X","FX","yf"),
    ("EURUSD","EURUSD=X","FX","yf"),
    ("GBPUSD","GBPUSD=X","FX","yf"),
    ("AUDUSD","AUDUSD=X","FX","yf"),
    ("NZDUSD","NZDUSD=X","FX","yf"),
    ("USDJPY","USDJPY=X","FX","yf"),
    ("USDCAD","USDCAD=X","FX","yf"),
    ("USDNOK","USDNOK=X","FX","yf"),
    ("USDSEK","USDSEK=X","FX","yf"),
    ("USDMXN","USDMXN=X","FX","yf"),
    ("USDBRL","USDBRL=X","FX","yf"),
    ("USDCLP","USDCLP=X","FX","yf"),
    ("USDCOP","USDCOP=X","FX","yf"),
    ("USDZAR","USDZAR=X","FX","yf"),
    ("USDTRY","USDTRY=X","FX","yf"),
    ("USDPLN","USDPLN=X","FX","yf"),
    ("USDHUF","USDHUF=X","FX","yf"),
    ("USDCZK","USDCZK=X","FX","yf"),
    ("USDILS","USDILS=X","FX","yf"),
    ("USDCNH","USDCNH=X","FX","yf"),
    ("USDTWD","TWD=X","FX","yf"),
    ("USDINR","USDINR=X","FX","yf"),
    ("USDIDR","USDIDR=X","FX","yf"),
    ("USDKRW","USDKRW=X","FX","yf"),
    ("USDMYR","USDMYR=X","FX","yf"),
    ("USDTHB","USDTHB=X","FX","yf"),
    ("USDPHP","USDPHP=X","FX","yf"),
    ("USDSGD","USDSGD=X","FX","yf"),
    ("US 3M Yield","^IRX","Rates","yf"),
    ("US 2Y Yield","DGS2","Rates","fred"),
    ("US 5Y Yield","^FVX","Rates","yf"),
    ("US 10Y Yield","^TNX","Rates","yf"),
    ("US 30Y Yield","^TYX","Rates","yf"),
    ("US 10Y Breakeven","T10YIE","Rates","fred"),
    ("US 5Y Breakeven","T5YIE","Rates","fred"),
    ("US 10Y Real Yield","DFII10","Rates","fred"),
    ("2Y UST Fut","ZT=F","Rates Futures","yf"),
    ("5Y UST Fut","ZF=F","Rates Futures","yf"),
    ("10Y UST Fut","ZN=F","Rates Futures","yf"),
    ("30Y UST Fut","ZB=F","Rates Futures","yf"),
    ("US IG OAS","BAMLC0A0CM","Credit","fred"),
    ("US BBB OAS","BAMLC0A4CBBB","Credit","fred"),
    ("US HY OAS","BAMLH0A0HYM2","Credit","fred"),
    ("HY Bond ETF (HYG)","HYG","Credit","yf"),
    ("IG Bond ETF (LQD)","LQD","Credit","yf"),
    ("EM Sov Debt (EMB)","EMB","Credit","yf"),
    ("VIX","^VIX","Volatility","yf"),
    ("VXN (Nasdaq Vol)","^VXN","Volatility","yf"),
    ("Copper","HG=F","Commodities","yf"),
    ("Broad Commod","DJP","Commodities","yf"),
    ("Broad Commod (PDBC)","PDBC","Commodities","yf"),
    ("Agriculture","DBA","Commodities","yf"),
    ("Rice","ZR=F","Commodities","yf"),
    ("Corn","ZC=F","Commodities","yf"),
    ("Wheat","ZW=F","Commodities","yf"),
    ("Soybeans","ZS=F","Commodities","yf"),
    ("Lumber","LBR=F","Commodities","yf"),
    ("Cocoa","CC=F","Commodities","yf"),
    ("Coffee","KC=F","Commodities","yf"),
    ("Cotton","CT=F","Commodities","yf"),
    ("Sugar","SB=F","Commodities","yf"),
    ("Bitcoin","BTC-USD","Crypto","yf"),
    ("Ethereum","ETH-USD","Crypto","yf"),
    ("Shipping (BDRY)","BDRY","Shipping","yf"),
]

# Manual 1973 Oil Embargo data
_POI_MAP = {"t-1M":-21,"t-1W":-5,"t0":0,"t+1W":5,"t+1M":21,"t+3M":63}

def _px_to_ret(px_dict, is_rates=False):
    anchor = px_dict["t-1W"]
    if is_rates:
        return {_POI_MAP[k]: (px_dict[k]-anchor)*100 for k in px_dict}
    return {_POI_MAP[k]: (px_dict[k]/anchor-1)*100 for k in px_dict}

_wti_1973 = {-21:0.0,-5:0.0,0:0.0,5:17.0,21:33.0,63:130.0}

MANUAL_DATA = {
    "1973 Oil Embargo†": {
        "date": "1973-10-17",
        "assets": {
            "Gold": _px_to_ret({"t-1M":101.5625,"t-1W":102.625,"t0":103.125,"t+1W":99.5875,"t+1M":91.25,"t+3M":128.4125}),
            "DXY": _px_to_ret({"t-1M":97.8183,"t-1W":97.5388,"t0":97.1477,"t+1W":97.0417,"t+1M":100.6644,"t+3M":106.3856}),
            "US 10Y Yield": _px_to_ret({"t-1M":7.08,"t-1W":6.77,"t0":6.82,"t+1W":6.75,"t+1M":6.76,"t+3M":6.97}, is_rates=True),
            "WTI Crude (spot)": _wti_1973,
            "Brent Futures": _wti_1973,
        }
    }
}

MACRO_CONTEXT = {
    "1973 Oil Embargo†":      {"trigger":4,"cpi":"high","fed":"hiking"},
    "1990 Gulf War":          {"trigger":17,"cpi":"high","fed":"cutting"},
    "1991 Kuwait Oil Fires":  {"trigger":25,"cpi":"high","fed":"cutting"},
    "1998 Desert Fox":        {"trigger":11,"cpi":"low","fed":"hold"},
    "2001 Afghanistan (OEF)": {"trigger":22,"cpi":"low","fed":"cutting"},
    "2003 SARS":              {"trigger":35,"cpi":"low","fed":"cutting"},
    "2003 Iraq War":          {"trigger":37,"cpi":"low","fed":"cutting"},
    "2011 Libya":             {"trigger":85,"cpi":"mid","fed":"hold"},
    "2014 ISIS/Mosul":        {"trigger":104,"cpi":"low","fed":"hold"},
    "2017 Syria Strikes":     {"trigger":53,"cpi":"mid","fed":"hiking"},
    "2020 COVID-19 PHEIC":    {"trigger":54,"cpi":"low","fed":"cutting"},
    "2022 Russia-Ukraine":    {"trigger":91,"cpi":"high","fed":"hiking"},
    "2023 Red Sea Crisis":    {"trigger":73,"cpi":"mid","fed":"hold"},
}

EVENT_TAGS = {
    "1973 Oil Embargo†":      ["energy_shock","sanctions"],
    "1990 Gulf War":          ["military_conflict","energy_shock"],
    "1991 Kuwait Oil Fires":  ["military_conflict","energy_shock"],
    "1998 Desert Fox":        ["military_conflict"],
    "2001 Afghanistan (OEF)": ["military_conflict"],
    "2003 SARS":              ["pandemic"],
    "2003 Iraq War":          ["military_conflict","energy_shock"],
    "2011 Libya":             ["military_conflict","energy_shock"],
    "2014 ISIS/Mosul":        ["military_conflict","energy_shock"],
    "2017 Syria Strikes":     ["military_conflict"],
    "2020 COVID-19 PHEIC":    ["pandemic"],
    "2022 Russia-Ukraine":    ["military_conflict","energy_shock","sanctions"],
    "2023 Red Sea Crisis":    ["shipping_disruption","military_conflict"],
}

# ── HELPERS ───────────────────────────────────────────────────

def _fred_fetch(tkr, start, end):
    if not FRED_API_KEY:
        raise ValueError("No FRED_API_KEY")
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": tkr, "api_key": FRED_API_KEY, "file_type": "json",
        "observation_start": pd.Timestamp(start).strftime("%Y-%m-%d"),
        "observation_end": pd.Timestamp(end).strftime("%Y-%m-%d"),
    }
    resp = requests.get(url, params=params, timeout=FRED_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    obs = data.get("observations", [])
    if not obs: raise ValueError(f"No data for {tkr}")
    dates = pd.to_datetime([o["date"] for o in obs])
    values = pd.to_numeric([o["value"] for o in obs], errors="coerce")
    return pd.Series(values, index=dates, name=tkr).dropna()


def build_asset_meta():
    meta = {}
    order = []
    seen = set()
    for label, ticker, cls, source in ASSETS:
        if label in seen: continue
        seen.add(label)
        order.append(label)
        if label in INVERT_OVERRIDE:
            invert = INVERT_OVERRIDE[label]
        elif cls == "FX":
            invert = ticker.replace("=X","").startswith("USD")
        else:
            invert = True
        
        # Display label
        display = label
        if cls == "FX":
            tkr = ticker.replace("=X","")
            if not tkr.startswith("USD") and not INVERT_OVERRIDE.get(label, False):
                display = f"USD{tkr[:3]}"
        
        meta[label] = {
            "ticker": ticker,
            "class": cls,
            "source": source,
            "invert": invert,
            "is_rates_bp": (source=="fred" and ticker not in FRED_PRICE_SERIES) or
                           (source=="yf" and ticker in YF_RATES_TICKERS),
            "display_label": display,
        }
    return meta, order


def resolve_day0(evt_date_str, idx):
    dt = pd.Timestamp(evt_date_str)
    c = idx[idx >= dt]
    return c[0] if len(c) else None


def compute_event_series(label, evt_date_str, prices_df, meta):
    if label not in prices_df.columns: return None
    m = meta.get(label, {})
    d0 = resolve_day0(evt_date_str, prices_df.index)
    if d0 is None: return None
    col = prices_df[label].dropna()
    if d0 not in col.index: return None
    idx0 = col.index.get_loc(d0)
    denom = col.iloc[idx0-1] if idx0 > 0 else col.iloc[idx0]
    if denom == 0 or np.isnan(denom): return None
    ws = max(0, idx0 - PRE_WINDOW_TD - 5)
    we = min(len(col), idx0 + POST_WINDOW_TD + 5)
    window = col.iloc[ws:we]
    if m.get("is_rates_bp"):
        ret = (window - denom) * 100
    else:
        ret = (window / denom - 1) * 100
        if not m.get("invert", True): ret = -ret
    offsets = list(range(ws - idx0, we - idx0))
    n = min(len(offsets), len(ret.values))
    result = {}
    for i in range(n):
        off = offsets[i]
        val = float(ret.values[i])
        if not np.isnan(val):
            result[off] = round(val, 4)
    return result


def compute_trigger_zscore(evt_date_str, prices_df, window_td=1260):
    if TRIGGER_ASSET not in prices_df.columns: return None
    col = prices_df[TRIGGER_ASSET].dropna()
    d0 = resolve_day0(evt_date_str, col.index)
    if d0 is None or d0 not in col.index: return None
    idx0 = col.index.get_loc(d0)
    start = max(0, idx0 - window_td)
    hist = col.iloc[start:idx0]
    if len(hist) < 20: return None
    mu = float(hist.mean())
    sig = float(hist.std())
    if sig < 1e-9: return 0.0
    p0 = float(col.loc[d0])
    return round((p0 - mu) / sig, 3)


def build_availability(prices_df):
    availability = {}
    for label in prices_df.columns:
        series = prices_df[label].dropna()
        availability[label] = {
            "startDate": series.index[0].strftime("%Y-%m-%d") if not series.empty else None,
            "endDate": series.index[-1].strftime("%Y-%m-%d") if not series.empty else None,
        }
    return availability


def build_observed_indices(full_idx, raw_yf, raw_fred, asset_order, meta):
    position_map = {ts: idx for idx, ts in enumerate(full_idx)}
    observed = {}
    for label in asset_order:
        m = meta[label]
        tkr = m["ticker"]
        if m["source"] == "yf":
            if tkr not in raw_yf.columns:
                continue
            src = raw_yf[tkr].dropna()
        else:
            if tkr not in raw_fred.columns:
                continue
            src = raw_fred[tkr].dropna()

        indices = [position_map[idx] for idx in src.index if idx in position_map]
        if indices:
          observed[label] = indices

    if VIX_TICKER in raw_yf.columns:
        src = raw_yf[VIX_TICKER].dropna()
        indices = [position_map[idx] for idx in src.index if idx in position_map]
        if indices:
            observed[VIX_LABEL] = indices

    return observed


def load_live_defaults():
    if LIVE_DEFAULTS_PATH.exists():
        with open(LIVE_DEFAULTS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "name": "Iran War 2026",
        "day0": "2026-02-28",
        "tags": ["energy_shock", "military_conflict"],
        "cpi": "mid",
        "fed": "hold",
    }


def _compute_live_asset_series(label, requested_day0, daily_history, meta):
    if label not in daily_history["prices"]:
        return None
    observed_positions = daily_history.get("observedIndices", {}).get(label, [])
    dates = daily_history["dates"]
    prices = daily_history["prices"][label]
    points = [
        (dates[idx], float(prices[idx]))
        for idx in observed_positions
        if prices[idx] is not None
    ]
    if not points:
        return None

    eligible = [point for point in points if point[0] <= requested_day0]
    if len(eligible) == 0:
        return None

    d0, day0_price = eligible[-1]
    idx0 = next(i for i, point in enumerate(points) if point[0] == d0)
    denom = points[idx0 - 1][1] if idx0 > 0 else day0_price
    if denom == 0 or np.isnan(denom):
        return None

    raw_returns = {}
    raw_levels = {}
    scoring_returns = {}
    scoring_levels = {}
    observed_dates = []

    for i in range(idx0, len(points)):
        dt, val = points[i]
        if np.isnan(val):
            continue
        cal_off = int((pd.Timestamp(dt) - pd.Timestamp(d0)).days)
        td_off = i - idx0
        observed_dates.append(dt)
        raw_levels[cal_off] = round(val, 6)
        scoring_levels[td_off] = round(val, 6)
        if meta.get("is_rates_bp"):
            move = (val - float(denom)) * 100
        else:
            move = (val / float(denom) - 1) * 100
            if not meta.get("invert", True):
                move = -move
        raw_returns[cal_off] = round(float(move), 4)
        scoring_returns[td_off] = round(float(move), 4)

    return {
        "raw_returns": raw_returns,
        "raw_levels": raw_levels,
        "scoring_returns": scoring_returns,
        "scoring_levels": scoring_levels,
        "observed_dates": observed_dates,
        "day0_price": round(float(day0_price), 6),
        "actual_day0": d0,
        "as_of": observed_dates[-1] if observed_dates else None,
    }


def _fill_calendar_series(raw_returns, raw_levels, day0_price, target_offset, max_carry_days=3):
    offsets = sorted(raw_returns.keys())
    if not offsets or target_offset < 0:
        return {}, {}

    last_observed_offset = offsets[-1]
    fill_limit = min(target_offset, last_observed_offset + max_carry_days)
    out_returns, out_levels = {}, {}
    last_return = 0.0
    last_level = day0_price

    for offset in range(fill_limit + 1):
        if offset in raw_returns:
            last_return = raw_returns[offset]
        if offset in raw_levels:
            last_level = raw_levels[offset]
        out_returns[offset] = round(float(last_return), 4)
        out_levels[offset] = round(float(last_level), 6)
    return out_returns, out_levels


def build_live_snapshot(daily_history, meta, all_labels, live_defaults):
    requested_day0 = live_defaults["day0"]
    observed = {}
    asset_status = {}
    trigger_price = None
    canonical_dates = []
    actual_day0 = None
    as_of_date = None

    for label in all_labels:
        series = _compute_live_asset_series(
            label,
            requested_day0,
            daily_history,
            meta[label],
        )
        if not series or not series["raw_returns"]:
            asset_status[label] = {
                "status": "missing",
                "source": "generated-history",
                "asOfDate": None,
                "warning": f"No cached history available on or before {requested_day0}",
            }
            continue
        observed[label] = series
        asset_status[label] = {
            "status": "ok",
            "source": "generated-history",
            "asOfDate": series["as_of"],
        }
        if label == TRIGGER_ASSET:
            trigger_price = series["day0_price"]
            canonical_dates = series["observed_dates"]
            actual_day0 = series["actual_day0"]
            as_of_date = series["as_of"]
        elif len(series["observed_dates"]) > len(canonical_dates):
            canonical_dates = series["observed_dates"]
            actual_day0 = actual_day0 or series["actual_day0"]
            as_of_date = series["as_of"] or as_of_date

    actual_day0 = actual_day0 or requested_day0
    as_of_date = as_of_date or daily_history.get("asOf") or requested_day0
    day_n = max(0, (pd.Timestamp(as_of_date) - pd.Timestamp(actual_day0)).days)
    trading_day_n = max(0, len(canonical_dates) - 1)

    returns = {}
    levels = {}
    scoring_returns = {}
    scoring_levels = {}
    for label, series in observed.items():
        filled_returns, filled_levels = _fill_calendar_series(
            series["raw_returns"], series["raw_levels"], series["day0_price"], day_n
        )
        if not filled_returns:
            continue
        returns[label] = {str(k): v for k, v in filled_returns.items()}
        levels[label] = {str(k): v for k, v in filled_levels.items()}
        scoring_returns[label] = {str(k): v for k, v in series["scoring_returns"].items()}
        scoring_levels[label] = {str(k): v for k, v in series["scoring_levels"].items()}

    trigger_zscore = None
    if trigger_price is not None:
        historical_triggers = [4, 17, 25, 11, 22, 35, 37, 85, 104, 53, 54, 91, 73]
        mean = sum(historical_triggers) / len(historical_triggers)
        variance = sum((value - mean) ** 2 for value in historical_triggers) / len(historical_triggers)
        std = variance ** 0.5
        trigger_zscore = (trigger_price - mean) / std if std > 0 else 0.0

    return {
        "name": live_defaults["name"],
        "snapshotDate": daily_history.get("asOf") or requested_day0,
        "requestedDay0": requested_day0,
        "actualDay0": actual_day0,
        "triggerDate": actual_day0,
        "asOfDate": as_of_date,
        "dayN": day_n,
        "tradingDayN": trading_day_n,
        "returns": returns,
        "levels": levels,
        "scoringReturns": scoring_returns,
        "scoringLevels": scoring_levels,
        "assetStatus": asset_status,
        "warnings": [],
        "provenance": {
            "mode": "shared",
            "source": "shared-snapshot",
            "builtAt": datetime.utcnow().isoformat() + "Z",
            "schemaVersion": 2,
        },
        "businessDates": canonical_dates,
        "triggerPrice": round(float(trigger_price), 4) if trigger_price is not None else None,
        "triggerZScore": round(float(trigger_zscore), 4) if trigger_zscore is not None else None,
        "triggerPctile": round(float(trigger_zscore), 4) if trigger_zscore is not None else None,
        "tagSet": live_defaults.get("tags", []),
        "cpi": live_defaults.get("cpi", "mid"),
        "fed": live_defaults.get("fed", "hold"),
    }


# ── MAIN ──────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("ANALOGUE ENGINE — Data Refresh")
    print("=" * 60)
    
    meta, asset_order = build_asset_meta()
    all_events = EVENTS + [(n, d["date"]) for n, d in MANUAL_DATA.items()]
    
    event_dates = [pd.Timestamp(d) for _, d in EVENTS]
    global_start = min(event_dates) - timedelta(days=PRE_WINDOW_TD + FETCH_BUFFER)
    global_end = max(pd.Timestamp.today().normalize() + timedelta(days=5),
                     max(event_dates) + timedelta(days=POST_WINDOW_TD*2 + FETCH_BUFFER))
    
    print(f"Date range: {global_start.date()} → {global_end.date()}")
    
    # ── yfinance pull ────────────────────────────────────────
    yf_labels = [l for l in asset_order if meta[l]["source"] == "yf"]
    yf_tickers = list(dict.fromkeys([meta[l]["ticker"] for l in yf_labels]))
    if VIX_TICKER not in yf_tickers: yf_tickers.append(VIX_TICKER)
    
    print(f"yfinance: {len(yf_tickers)} tickers...")
    raw_yf = pd.DataFrame()
    for attempt in range(3):
        try:
            dl = yf.download(yf_tickers, start=global_start, end=global_end,
                             auto_adjust=True, progress=False)
            if "Close" in dl.columns or (hasattr(dl.columns, "levels") and
                "Close" in dl.columns.get_level_values(0)):
                raw_yf = dl["Close"]
            else:
                raw_yf = dl
            if isinstance(raw_yf, pd.Series):
                raw_yf = raw_yf.to_frame(yf_tickers[0])
            raw_yf.index = pd.to_datetime(raw_yf.index)
            if not raw_yf.empty and len(raw_yf) > 5:
                break
        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            time.sleep(4)
    
    print(f"yfinance: {raw_yf.shape[1]} cols, {len(raw_yf)} rows")
    
    # ── FRED pull ────────────────────────────────────────────
    fred_labels = [l for l in asset_order if meta[l]["source"] == "fred"]
    fred_tickers = list(dict.fromkeys([meta[l]["ticker"] for l in fred_labels]))
    raw_fred = pd.DataFrame()
    fred_fail = []
    
    if fred_tickers and FRED_API_KEY:
        print(f"FRED: {len(fred_tickers)} series...")
        for tkr in fred_tickers:
            try:
                raw_fred[tkr] = _fred_fetch(tkr, global_start, global_end)
            except Exception as e:
                fred_fail.append(tkr)
                print(f"  FRED failed: {tkr} ({e})")
        if not raw_fred.empty:
            raw_fred.index = pd.to_datetime(raw_fred.index)
            raw_fred = raw_fred.ffill()
        ok = len(fred_tickers) - len(fred_fail)
        print(f"FRED: {ok}/{len(fred_tickers)} pulled")
    elif fred_tickers:
        print("FRED: skipped (no FRED_API_KEY)")
    
    # ── Build unified price frame ────────────────────────────
    full_idx = raw_yf.index
    if not raw_fred.empty:
        full_idx = full_idx.union(raw_fred.index)
    full_idx = full_idx.sort_values()
    
    prices = pd.DataFrame(index=full_idx)
    for label in asset_order:
        m = meta[label]
        tkr = m["ticker"]
        if m["source"] == "yf":
            if tkr in raw_yf.columns:
                prices[label] = raw_yf[tkr].reindex(full_idx).ffill()
        else:
            if tkr in raw_fred.columns:
                prices[label] = raw_fred[tkr].reindex(full_idx).ffill()
    
    if VIX_TICKER in raw_yf.columns:
        prices[VIX_LABEL] = raw_yf[VIX_TICKER].reindex(full_idx).ffill()
    
    prices = prices.sort_index().dropna(how="all")
    all_labels = [l for l in asset_order if l in prices.columns]
    all_classes = sorted(set(meta[l]["class"] for l in all_labels))
    availability = build_availability(prices[all_labels])
    observed_indices = build_observed_indices(full_idx, raw_yf, raw_fred, asset_order, meta)
    
    print(f"Price frame: {prices.shape[1]} assets × {prices.shape[0]} rows")
    
    # ── Build event_returns ──────────────────────────────────
    event_returns = {l: {} for l in all_labels}
    for i, (en, ed) in enumerate(EVENTS):
        print(f"  event_returns {i+1}/{len(EVENTS)}: {en}", end="\r")
        for l in all_labels:
            s = compute_event_series(l, ed, prices, meta)
            if s is not None:
                event_returns[l][en] = s
    print(f"  event_returns: done ({len(EVENTS)} events)    ")
    
    # ── Inject manual data ───────────────────────────────────
    for evt_name, evt_cfg in MANUAL_DATA.items():
        for lbl, ret_dict in evt_cfg["assets"].items():
            if lbl not in event_returns:
                event_returns[lbl] = {}
            # Convert int keys to strings for JSON
            event_returns[lbl][evt_name] = {int(k): round(v, 4) for k, v in ret_dict.items()}
        print(f"  Injected: {evt_name} ({len(evt_cfg['assets'])} assets)")
    
    # ── Trigger z-scores ─────────────────────────────────────
    trigger_zscores = {}
    for en, ed in all_events:
        z = compute_trigger_zscore(ed, prices)
        if z is not None:
            trigger_zscores[en] = z
        else:
            # Fallback for manual data
            mc = MACRO_CONTEXT.get(en, {})
            tv = mc.get("trigger", 0)
            if tv > 0 and TRIGGER_ASSET in prices.columns:
                full = prices[TRIGGER_ASSET].dropna()
                mu = float(full.mean())
                sig = float(full.std()) or 1.0
                trigger_zscores[en] = round((tv - mu) / sig, 3)
            else:
                trigger_zscores[en] = 0.0
    
    print(f"Trigger z-scores: {len(trigger_zscores)} events mapped")
    
    # ── Save outputs ─────────────────────────────────────────
    
    # event_returns — gzip compressed JSON
    # Convert inner dict keys to strings for JSON compatibility
    er_json = {}
    for label, events_dict in event_returns.items():
        er_json[label] = {}
        for evt_name, offsets in events_dict.items():
            er_json[label][evt_name] = {str(k): v for k, v in offsets.items()}
    
    er_bytes = json.dumps(er_json, separators=(",", ":")).encode()
    with gzip.open(OUT_DIR / "event_returns.json.gz", "wb") as f:
        f.write(er_bytes)
    # Also save plain JSON as fallback (some hosts auto-decompress gzip)
    with open(OUT_DIR / "event_returns.json", "w") as f:
        f.write(er_bytes.decode())
    print(f"event_returns.json.gz: {len(er_bytes)/1024/1024:.1f}MB raw → {(OUT_DIR / 'event_returns.json.gz').stat().st_size/1024/1024:.1f}MB gzip")
    print(f"event_returns.json: {(OUT_DIR / 'event_returns.json').stat().st_size/1024/1024:.1f}MB (plain fallback)")
    
    # meta.json
    meta_out = {
        "asset_meta": meta,
        "asset_order": asset_order,
        "all_labels": all_labels,
        "all_classes": all_classes,
        "events": [{"name": n, "date": d} for n, d in all_events],
        "event_tags": EVENT_TAGS,
        "macro_context": MACRO_CONTEXT,
        "availability": availability,
        "schema_version": 2,
        "pois": [{"label": l, "offset": o} for l, o in POIS],
    }
    with open(OUT_DIR / "meta.json", "w") as f:
        json.dump(meta_out, f, separators=(",", ":"))
    
    # trigger_zscores.json
    with open(OUT_DIR / "trigger_zscores.json", "w") as f:
        json.dump(trigger_zscores, f, separators=(",", ":"))

    daily_history = {
        "dates": [idx.strftime("%Y-%m-%d") for idx in prices.index],
        "prices": {
            label: [None if pd.isna(v) else round(float(v), 6) for v in prices[label].tolist()]
            for label in all_labels
        },
        "observedIndices": {
            label: observed_indices.get(label, [])
            for label in all_labels
        },
        "availability": availability,
        "asOf": prices.index[-1].strftime("%Y-%m-%d") if len(prices.index) else None,
        "schemaVersion": 2,
    }
    dh_bytes = json.dumps(daily_history, separators=(",", ":")).encode()
    with gzip.open(OUT_DIR / "daily_history.json.gz", "wb") as f:
        f.write(dh_bytes)

    live_defaults = load_live_defaults()
    live_snapshot = build_live_snapshot(daily_history, meta, all_labels, live_defaults)
    with open(OUT_DIR / "live_snapshot.json", "w") as f:
        json.dump(live_snapshot, f, separators=(",", ":"))

    # last_updated.json
    with open(OUT_DIR / "last_updated.json", "w") as f:
        json.dump({
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "n_assets": len(all_labels),
            "n_events": len(all_events),
            "n_rows": len(prices),
            "fred_failures": fred_fail,
            "schema_version": 2,
            "pipeline_mode": "generated",
            "as_of": prices.index[-1].strftime("%Y-%m-%d") if len(prices.index) else None,
            "live_snapshot_date": live_snapshot["snapshotDate"],
            "live_snapshot_day0": live_snapshot["requestedDay0"],
        }, f, indent=2)
    
    print("\n✅ All data files written to public/data/")


if __name__ == "__main__":
    main()
