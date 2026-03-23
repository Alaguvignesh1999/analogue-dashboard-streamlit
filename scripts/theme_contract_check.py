from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def read(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def assert_contains(text: str, needle: str, context: str) -> None:
    if needle not in text:
        raise AssertionError(f"Missing `{needle}` in {context}")


def assert_not_contains(text: str, needle: str, context: str) -> None:
    if needle in text:
        raise AssertionError(f"Unexpected `{needle}` in {context}")


RAW_COLOR_RE = re.compile(r"#[0-9A-Fa-f]{3,8}|rgba?\(")
ALLOWED_RAW_COLOR_FILES = {
    "src/app/globals.css",
    "src/theme/chart.ts",
    "src/theme/registry.ts",
}


def assert_no_raw_colors_outside_theme_layer() -> None:
    for path in ROOT.joinpath("src").rglob("*"):
        if not path.is_file():
            continue
        rel_path = path.relative_to(ROOT).as_posix()
        if rel_path in ALLOWED_RAW_COLOR_FILES:
            continue
        if path.suffix not in {".ts", ".tsx", ".css"}:
            continue
        text = path.read_text(encoding="utf-8")
        match = RAW_COLOR_RE.search(text)
        if match:
            raise AssertionError(f"Raw color `{match.group(0)}` found in {rel_path}")


def parse_rgb_triplets(block_name: str, registry_text: str) -> list[str]:
    block = re.search(rf"const {block_name}: Record<string, string> = \{{(?P<body>.*?)\n\}};", registry_text, re.S)
    if not block:
        raise AssertionError(f"Missing {block_name} in src/theme/registry.ts")
    return re.findall(r"'--color-series-(?:\d+)':\s*'([0-9 ]+)'", block.group("body"))


def assert_light_series_palettes_match_dark(registry_text: str) -> None:
    dark_series = parse_rgb_triplets("darkTokens", registry_text)
    parchment_series = parse_rgb_triplets("parchmentTokens", registry_text)
    terminal_series = parse_rgb_triplets("terminalLightTokens", registry_text)
    if len(dark_series) != 13 or len(parchment_series) != 13 or len(terminal_series) != 13:
        raise AssertionError("Expected exactly 13 chart-series tokens per theme")
    if dark_series != parchment_series or dark_series != terminal_series:
        raise AssertionError("Light themes must preserve the canonical series palette ordering")


def assert_chart_palette_is_canonical(theme_chart: str) -> None:
    assert_contains(theme_chart, "CANONICAL_EVENT_ORDER", "src/theme/chart.ts")
    assert_contains(theme_chart, "getCanonicalEventIndex", "src/theme/chart.ts")
    assert_not_contains(theme_chart, "EVENT_COLOR_MAP", "src/theme/chart.ts")
    assert_not_contains(theme_chart, "VERIFIED_LIGHT_EVENT_COLORS", "src/theme/chart.ts")
    assert_not_contains(theme_chart, "VERIFIED_LIGHT_EVENT_STYLES", "src/theme/chart.ts")


def main() -> int:
    registry = read("src/theme/registry.ts")
    for needle in ["dark:", "parchment-terminal", "terminal-light", "buildThemeStyleSheet", "THEME_STORAGE_KEY", "themeColor", "description", "LIGHT_THEMES"]:
        assert_contains(registry, needle, "src/theme/registry.ts")

    provider = read("src/theme/provider.tsx")
    assert_contains(provider, "ThemeProvider", "src/theme/provider.tsx")
    assert_contains(provider, "localStorage", "src/theme/provider.tsx")
    assert_contains(provider, 'meta[name="theme-color"]', "src/theme/provider.tsx")

    layout = read("src/app/layout.tsx")
    for needle in ["ThemeProvider", "buildThemeStyleSheet", "getThemeBootScript", 'data-theme="dark"', "export const viewport", "THEMES.dark.themeColor"]:
        assert_contains(layout, needle, "src/app/layout.tsx")
    assert_not_contains(layout, 'className="dark"', "src/app/layout.tsx")

    tailwind = read("tailwind.config.ts")
    for needle in ["rgb(var(--color-bg-primary)", "rgb(var(--color-text-primary)", "rgb(var(--color-accent-teal)", "var(--font-plex-mono)", "var(--font-plex-sans)"]:
        assert_contains(tailwind, needle, "tailwind.config.ts")

    header = read("src/components/layout/Header.tsx")
    assert_contains(header, "ThemeToggle", "src/components/layout/Header.tsx")

    toggle = read("src/components/ui/ThemeToggle.tsx")
    for needle in ["Object.entries(themes)", "definition.description", "Palette"]:
        assert_contains(toggle, needle, "src/components/ui/ThemeToggle.tsx")

    shared_files = [
      "src/components/ui/ChartCard.tsx",
      "src/components/ui/DiagnosticsStrip.tsx",
      "src/components/layout/Header.tsx",
      "src/components/layout/TabBar.tsx",
    ]
    forbidden_hex = ["#09090b", "#111113", "#18181b", "#1e1e22", "#2a2a3a", "#00e5ff", "#00d4aa", "#71717a", "#e4e4e7"]
    for rel_path in shared_files:
        text = read(rel_path)
        for hex_value in forbidden_hex:
            assert_not_contains(text, hex_value, rel_path)

    globals_css = read("src/app/globals.css")
    for needle in ["rgb(var(--color-bg-primary))", "rgb(var(--color-text-primary))", "rgb(var(--color-tooltip-bg)", ".theme-transition", "parchment-terminal", "terminal-light", "var(--font-plex-mono)"]:
        assert_contains(globals_css, needle, "src/app/globals.css")

    theme_chart = read("src/theme/chart.ts")
    for needle in ["alphaThemeColor", "alphaSeriesColor", "themedHeatColor", "getEventLineStyle", "CHART_SERIES_PALETTE"]:
        assert_contains(theme_chart, needle, "src/theme/chart.ts")

    assert_light_series_palettes_match_dark(registry)
    assert_chart_palette_is_canonical(theme_chart)

    assert_no_raw_colors_outside_theme_layer()

    print("theme-contract: ok")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"theme-contract: FAIL - {exc}")
        raise SystemExit(1)
