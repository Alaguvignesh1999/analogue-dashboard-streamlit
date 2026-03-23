from __future__ import annotations

from engine.models import AssetMeta


ALL_ASSETS_OPTION = "-- All Assets --"

CUSTOM_GROUPS: dict[str, list[str]] = {
    "Equities": ["S&P 500", "MSCI World ex-US", "MSCI EM", "Energy Equities"],
    "Sector ETFs": [
        "Comm Services", "Materials", "Financials", "Industrials", "Technology",
        "Cons Staples", "Real Estate", "Utilities", "Healthcare", "Cons Discret",
        "Gold Miners", "Oil Services", "Regional Banks", "Homebuilders", "Innovation (ARKK)",
    ],
    "World Indices": [
        "Nikkei 225", "KOSPI", "Hang Seng", "Shanghai Comp", "Taiwan Weighted",
        "ASX 200", "Nifty 50", "FTSE 100", "DAX", "CAC 40", "Euro Stoxx 50",
        "STI", "Sensex", "Jakarta Comp",
    ],
    "Country ETFs": [
        "ETF Japan", "ETF Brazil", "ETF Korea", "ETF Taiwan", "ETF China",
        "ETF Germany", "ETF UK", "ETF Australia", "ETF India", "ETF Mexico",
        "ETF South Africa", "ETF Turkey",
    ],
    "Country ETFs Asia": ["ETF Japan", "ETF Korea", "ETF Taiwan", "ETF China", "ETF Australia", "ETF India"],
    "Country ETFs EM": ["ETF Brazil", "ETF Korea", "ETF Taiwan", "ETF China", "ETF India", "ETF Mexico", "ETF South Africa", "ETF Turkey"],
    "Oil & Energy": ["WTI Crude (spot)", "Brent Futures", "Natural Gas Fut", "Oil Vol (OVX)", "Gasoline (UGA)", "Energy Equities", "Oil Services"],
    "Precious Metals": ["Gold", "Silver", "Platinum", "Palladium", "Gold Vol (GVZ)"],
    "Commodities": ["Copper", "Broad Commod", "Broad Commod (PDBC)", "Agriculture", "Rice", "Corn", "Wheat", "Soybeans", "Lumber", "Cocoa", "Coffee", "Cotton", "Sugar"],
    "Soft Commodities": ["Agriculture", "Rice", "Corn", "Wheat", "Soybeans", "Cocoa", "Coffee", "Cotton", "Sugar"],
    "FX All": [
        "DXY", "USDCHF", "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY",
        "USDCAD", "USDNOK", "USDSEK", "USDMXN", "USDBRL", "USDCLP", "USDCOP",
        "USDZAR", "USDTRY", "USDPLN", "USDHUF", "USDCZK", "USDILS", "USDCNH",
        "USDTWD", "USDINR", "USDIDR", "USDKRW", "USDMYR", "USDTHB", "USDPHP", "USDSGD",
    ],
    "FX G10": ["DXY", "USDCAD", "USDNOK", "AUDUSD", "NZDUSD", "USDJPY", "EURUSD", "GBPUSD", "USDCHF", "USDSEK"],
    "FX EM": ["USDMXN", "USDBRL", "USDCLP", "USDCOP", "USDZAR", "USDTRY", "USDPLN", "USDHUF", "USDCZK", "USDILS", "USDCNH", "USDTWD", "USDINR", "USDIDR", "USDKRW", "USDMYR", "USDTHB", "USDPHP"],
    "FX EM Asia": ["USDCNH", "USDTWD", "USDINR", "USDIDR", "USDKRW", "USDMYR", "USDTHB", "USDPHP", "USDSGD"],
    "FX ASEAN": ["USDSGD", "USDMYR", "USDTHB", "USDPHP", "USDIDR"],
    "FX EM EMEA": ["USDZAR", "USDTRY", "USDPLN", "USDHUF", "USDCZK", "USDILS"],
    "FX EM LATAM": ["USDMXN", "USDBRL", "USDCLP", "USDCOP"],
    "FX EM High Carry": ["USDMXN", "USDBRL", "USDCLP", "USDCOP", "USDZAR", "USDTRY"],
    "FX EM Low Carry": ["USDCNH", "USDTWD", "USDKRW", "USDINR", "USDMYR", "USDTHB", "USDPHP", "USDSGD"],
    "FX Oil Exporters": ["USDCAD", "USDNOK", "AUDUSD", "NZDUSD", "USDMXN", "USDBRL", "USDCOP"],
    "FX Oil Importers": ["USDJPY", "EURUSD", "GBPUSD", "USDCHF", "USDZAR", "USDTRY", "USDPLN", "USDCNH", "USDTWD", "USDINR", "USDIDR", "USDKRW", "USDMYR", "USDTHB", "USDPHP"],
    "Dollar Bloc": ["USDCAD", "AUDUSD", "NZDUSD"],
    "Commodity FX": ["USDCAD", "USDNOK", "AUDUSD", "USDMXN", "USDBRL", "USDCOP", "USDCLP", "USDZAR"],
    "DM Rates": ["US 3M Yield", "US 2Y Yield", "US 5Y Yield", "US 10Y Yield", "US 30Y Yield", "US 10Y Breakeven", "US 5Y Breakeven", "US 10Y Real Yield"],
    "Yield Curve": ["US 2Y Yield", "US 10Y Yield", "US 30Y Yield"],
    "Breakevens": ["US 5Y Breakeven", "US 10Y Breakeven", "US 10Y Real Yield"],
    "Rates Futures": ["2Y UST Fut", "5Y UST Fut", "10Y UST Fut", "30Y UST Fut"],
    "Credit": ["US IG OAS", "US BBB OAS", "US HY OAS", "HY Bond ETF (HYG)", "IG Bond ETF (LQD)", "EM Sov Debt (EMB)"],
    "Volatility": ["VIX", "VXN (Nasdaq Vol)", "Oil Vol (OVX)", "Gold Vol (GVZ)"],
    "Crypto": ["Bitcoin", "Ethereum"],
    "Shipping": ["Shipping (BDRY)"],
    "Bond ETFs": ["20Y Treasury (TLT)", "7-10Y Treasury (IEF)", "1-3Y Treasury (SHY)", "TIPS ETF (TIP)", "Gold ETF (IAU)"],
    "Yield Curve ETFs": ["1-3Y Treasury (SHY)", "7-10Y Treasury (IEF)", "20Y Treasury (TLT)"],
    "Thematic ETFs": ["Airlines (JETS)", "Agri (MOO)", "Defense (ITA)", "Cyber Security (BUG)", "Clean Energy (ICLN)", "Nuclear (NLR)"],
    "Defense & Security": ["Defense (ITA)", "Cyber Security (BUG)", "Nuclear (NLR)"],
    "Oil Sensitive": ["Airlines (JETS)", "Agri (MOO)", "WTI Crude (spot)", "Brent Futures", "Oil Services", "Energy Equities"],
    "Risk Barometer": ["S&P 500", "VIX", "US HY OAS", "WTI Crude (spot)", "DXY"],
    "Safe Havens": ["Gold", "Silver", "USDJPY", "USDCHF", "US 10Y Yield", "US 10Y Real Yield"],
    "Risk-On Basket": ["S&P 500", "MSCI EM", "Copper", "WTI Crude (spot)", "US HY OAS", "Bitcoin"],
    "Inflation Hedge": ["Gold", "WTI Crude (spot)", "Copper", "US 10Y Breakeven", "US 5Y Breakeven", "Agriculture"],
    "EM Stress": ["MSCI EM", "EM Sov Debt (EMB)", "USDCNH", "USDKRW", "USDINR", "US HY OAS", "Copper"],
    "Middle East Risk": ["WTI Crude (spot)", "Brent Futures", "Gold", "Oil Vol (OVX)", "USDILS", "Energy Equities", "Oil Services"],
}


def get_group_labels(group: str, all_labels: list[str], asset_meta: dict[str, AssetMeta]) -> list[str]:
    if group == ALL_ASSETS_OPTION:
        return list(all_labels)
    if group in CUSTOM_GROUPS:
        return [label for label in CUSTOM_GROUPS[group] if label in all_labels]
    return [label for label in all_labels if asset_meta.get(label) and asset_meta[label].class_name == group]


def group_options_from_data(all_classes: list[str]) -> list[tuple[str, str]]:
    groups = sorted(CUSTOM_GROUPS)
    classes = sorted(group for group in all_classes if group not in CUSTOM_GROUPS)
    values = [ALL_ASSETS_OPTION] + groups + classes
    return [(value, value) for value in values]
