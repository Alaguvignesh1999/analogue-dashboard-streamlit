from app import TAB_RENDERERS


REQUIRED_TABS = {
    "events",
    "overlay",
    "cross-asset",
    "heatmap",
    "scatter",
    "vix",
    "box",
    "summary",
    "stepin",
    "l1-config",
    "l2-analogues",
    "l3-paths",
    "l4-ideas",
    "l5-detail",
    "l6-screener",
    "l7-leadlag",
    "l8-reverse",
    "l9-prepos",
    "l10-rotation",
    "l11-stress",
    "l12-decay",
    "l14-confidence",
    "l15-oos",
    "gate",
    "correlation",
    "l13-memo",
}


def test_all_required_tabs_registered():
    assert REQUIRED_TABS.issubset(TAB_RENDERERS)


def test_all_renderers_callable():
    for key in REQUIRED_TABS:
        assert callable(TAB_RENDERERS[key])
