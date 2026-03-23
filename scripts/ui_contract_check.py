from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def assert_contains(text: str, needle: str, context: str) -> None:
    if needle not in text:
        raise AssertionError(f"Missing `{needle}` in {context}")


def assert_not_contains(text: str, needle: str, context: str) -> None:
    if needle in text:
        raise AssertionError(f"Unexpected `{needle}` in {context}")


def main() -> int:
    assets_text = read("src/config/assets.ts")
    for group in [
        "FX EM Asia",
        "FX ASEAN",
        "FX EM EMEA",
        "FX EM LATAM",
        "Country ETFs Asia",
        "Country ETFs EM",
    ]:
        assert_contains(assets_text, f"'{group}'", "src/config/assets.ts")

    trade_text = read("src/components/tabs/live/TradeIdeasTab.tsx")
    assert_contains(trade_text, "setActiveTab('l5-detail')", "TradeIdeasTab")
    assert_contains(trade_text, "setDetailContext({", "TradeIdeasTab")

    detail_text = read("src/components/tabs/live/DetailTab.tsx")
    for marker in [
        "Forward Stats By Horizon",
        "Per-Analogue Dot Plot",
        "Live vs Analogue Deviation",
    ]:
        assert_contains(detail_text, marker, "DetailTab")

    decay_text = read("src/components/tabs/risk/DecayTab.tsx")
    assert_contains(decay_text, "all-available", "DecayTab")
    assert_contains(decay_text, "Coverage-adjusted", "DecayTab")

    overlay_text = read("src/components/tabs/historical/OverlayTab.tsx")
    paths_text = read("src/components/tabs/live/PathsTab.tsx")
    assert_contains(overlay_text, "getLiveDisplayDay", "OverlayTab")
    assert_contains(paths_text, "getLiveDisplayDay", "PathsTab")

    stress_text = read("src/components/tabs/risk/StressTab.tsx")
    assert_contains(stress_text, "New Portfolio", "StressTab")
    assert_contains(stress_text, "% View", "StressTab")

    prepos_text = read("src/components/tabs/analysis/PrePosTab.tsx")
    assert_contains(prepos_text, "Vol-adjusted", "PrePosTab")

    diagnostics_text = read("src/components/ui/DiagnosticsStrip.tsx")
    assert_contains(diagnostics_text, "Live D+", "DiagnosticsStrip")
    assert_not_contains(diagnostics_text, "Effective", "DiagnosticsStrip")
    assert_not_contains(diagnostics_text, "Score", "DiagnosticsStrip")

    chart_card_text = read("src/components/ui/ChartCard.tsx")
    assert_contains(chart_card_text, "export function BottomDescription", "ChartCard")

    for rel_path in [
        "src/components/tabs/historical/OverlayTab.tsx",
        "src/components/tabs/live/TradeIdeasTab.tsx",
        "src/components/tabs/live/PathsTab.tsx",
        "src/components/tabs/live/DetailTab.tsx",
        "src/components/tabs/risk/StressTab.tsx",
    ]:
        tab_text = read(rel_path)
        assert_contains(tab_text, "BottomDescription", rel_path)
        for forbidden in [
            "effective scoring day",
            "effective live scoring day",
            "Score D+",
            "Score date",
            "effective D+",
            "Effective D+",
            "live scored to",
        ]:
            assert_not_contains(tab_text, forbidden, rel_path)

    print("ui-contract: ok")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"ui-contract: FAIL - {exc}")
        raise SystemExit(1)
