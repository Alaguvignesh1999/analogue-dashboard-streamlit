from __future__ import annotations

import copy
import gzip
import json
from functools import lru_cache
from pathlib import Path

from config.defaults import DATA_SCHEMA_VERSION
from engine.models import (
    AssetMeta,
    AvailabilityWindow,
    DashboardBundle,
    DataProvenance,
    DailyHistoryPayload,
    EventDef,
    LiveAssetStatus,
    MacroContext,
    SharedLiveSnapshot,
)
from engine.returns import normalize_label


REMOVED_ASSETS = {"Euro HY OAS"}
EVENT_NAME_ALIASES = {
    "1973 Oil Embargoâ€ ": "1973 Oil Embargo",
    "1973 Oil Embargo†": "1973 Oil Embargo",
    "2020 COVID-19 PHEIC": "COVID-19",
}
EVENT_DATE_OVERRIDES = {"COVID-19": "2020-03-01"}
FRED_FAILURE_LABELS = {"BAMLHE00EHY0EY": "Euro HY OAS"}


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_gzip_json(path: Path) -> dict:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def _load_json_or_gzip(data_dir: Path, stem: str) -> dict | None:
    json_path = data_dir / f"{stem}.json"
    gzip_path = data_dir / f"{stem}.json.gz"
    if gzip_path.exists():
        return _load_gzip_json(gzip_path)
    if json_path.exists():
        return _load_json(json_path)
    return None


def _normalize_event_name(name: str) -> str:
    normalized = normalize_label(name)
    return EVENT_NAME_ALIASES.get(normalized, normalized)


def _parse_event_returns(raw: dict) -> dict[str, dict[str, dict[int, float]]]:
    result: dict[str, dict[str, dict[int, float]]] = {}
    for label, events in raw.items():
        normalized_label = normalize_label(label)
        result[normalized_label] = {}
        for event_name, offsets in events.items():
            normalized_event = _normalize_event_name(event_name)
            result[normalized_label][normalized_event] = {int(offset): float(value) for offset, value in offsets.items()}
    return result


def _normalize_asset_meta(raw: dict) -> dict[str, AssetMeta]:
    result: dict[str, AssetMeta] = {}
    for label, meta in raw.items():
        normalized_label = normalize_label(label)
        if normalized_label in REMOVED_ASSETS:
            continue
        result[normalized_label] = AssetMeta(
            ticker=normalize_label(meta["ticker"]),
            class_name=normalize_label(meta["class"]),
            source=meta["source"],
            invert=bool(meta.get("invert", False)),
            is_rates_bp=bool(meta.get("is_rates_bp", False)),
            display_label=normalize_label(meta.get("display_label") or normalized_label),
        )
    return result


def _normalize_event_tags(raw: dict[str, list[str]]) -> dict[str, set[str]]:
    return {
        _normalize_event_name(name): {normalize_label(tag) for tag in tags}
        for name, tags in raw.items()
    }


def _normalize_macro_context(raw: dict) -> dict[str, MacroContext]:
    result: dict[str, MacroContext] = {}
    for event_name, context in raw.items():
        result[_normalize_event_name(event_name)] = MacroContext(
            trigger=float(context["trigger"]),
            cpi=context["cpi"] if context["cpi"] in {"high", "mid", "low"} else "mid",
            fed=context["fed"] if context["fed"] in {"hiking", "cutting", "hold"} else "hold",
        )
    return result


def _derive_availability(labels: list[str], explicit: dict | None) -> dict[str, AvailabilityWindow]:
    normalized_explicit = {
        normalize_label(label): AvailabilityWindow(
            start_date=window.get("startDate"),
            end_date=window.get("endDate"),
        )
        for label, window in (explicit or {}).items()
    }
    return {label: normalized_explicit.get(label, AvailabilityWindow(None, None)) for label in labels}


def _parse_daily_history(raw: dict | None) -> DailyHistoryPayload | None:
    if not raw:
        return None
    availability = {
        normalize_label(label): AvailabilityWindow(window.get("startDate"), window.get("endDate"))
        for label, window in (raw.get("availability") or {}).items()
    }
    return DailyHistoryPayload(
        dates=list(raw.get("dates", [])),
        prices={normalize_label(label): values for label, values in raw.get("prices", {}).items()},
        observed_indices={normalize_label(label): [int(idx) for idx in values] for label, values in raw.get("observedIndices", {}).items()},
        availability=availability,
        as_of=raw.get("asOf"),
        schema_version=raw.get("schemaVersion"),
    )


def _parse_live_snapshot(raw: dict | None) -> SharedLiveSnapshot | None:
    if not raw:
        return None

    def parse_nested(source: dict) -> dict[str, dict[int, float]]:
        return {
            normalize_label(label): {int(offset): float(value) for offset, value in series.items()}
            for label, series in source.items()
        }

    statuses = {
        normalize_label(label): LiveAssetStatus(
            status=value["status"],
            source=value["source"],
            as_of_date=value.get("asOfDate"),
            warning=value.get("warning"),
        )
        for label, value in raw.get("assetStatus", {}).items()
    }
    provenance = raw.get("provenance", {})
    return SharedLiveSnapshot(
        name=raw.get("name", "Shared Live Snapshot"),
        snapshot_date=raw.get("snapshotDate") or raw.get("asOfDate") or "",
        requested_day0=raw.get("requestedDay0", ""),
        actual_day0=raw.get("actualDay0"),
        trigger_date=raw.get("triggerDate"),
        as_of_date=raw.get("asOfDate"),
        day_n=int(raw.get("dayN", 0)),
        trading_day_n=int(raw.get("tradingDayN", 0)),
        returns=parse_nested(raw.get("returns", {})),
        levels=parse_nested(raw.get("levels", {})),
        scoring_returns=parse_nested(raw.get("scoringReturns", {})),
        scoring_levels=parse_nested(raw.get("scoringLevels", {})),
        asset_status=statuses,
        warnings=list(raw.get("warnings", [])),
        provenance_mode=provenance.get("mode", "shared"),
        provenance_source=provenance.get("source", "shared-snapshot"),
        provenance_built_at=provenance.get("builtAt", ""),
        schema_version=provenance.get("schemaVersion"),
        business_dates=list(raw.get("businessDates", [])),
        trigger_price=raw.get("triggerPrice"),
        trigger_z_score=raw.get("triggerZScore"),
        trigger_pctile=raw.get("triggerPctile"),
        tag_set=list(raw.get("tagSet", [])),
        cpi=raw.get("cpi"),
        fed=raw.get("fed"),
        request_mode=provenance.get("mode"),
    )


@lru_cache(maxsize=1)
def load_dashboard_bundle(root: str) -> DashboardBundle:
    root_path = Path(root)
    data_dir = root_path / "public" / "data"
    meta = _load_json(data_dir / "meta.json")
    event_returns_raw = _load_json_or_gzip(data_dir, "event_returns")
    if not event_returns_raw:
        raise FileNotFoundError("event_returns.json(.gz) not found")
    trigger_z_scores_raw = _load_json_or_gzip(data_dir, "trigger_zscores") or {}
    last_updated = _load_json_or_gzip(data_dir, "last_updated") or {}
    daily_history = _parse_daily_history(_load_json_or_gzip(data_dir, "daily_history"))
    live_snapshot = _parse_live_snapshot(_load_json_or_gzip(data_dir, "live_snapshot"))

    event_returns = _parse_event_returns(event_returns_raw)
    asset_meta = _normalize_asset_meta(meta["asset_meta"])
    events = sorted(
        [
            EventDef(
                _normalize_event_name(event["name"]),
                EVENT_DATE_OVERRIDES.get(_normalize_event_name(event["name"]), event["date"]),
            )
            for event in meta["events"]
        ],
        key=lambda event: event.date,
    )

    removed_by_failure = {
        FRED_FAILURE_LABELS[series_id]
        for series_id in last_updated.get("fred_failures", [])
        if series_id in FRED_FAILURE_LABELS
    }
    excluded_assets = REMOVED_ASSETS | removed_by_failure
    all_labels = [normalize_label(label) for label in meta["all_labels"] if normalize_label(label) not in excluded_assets]
    asset_order = [normalize_label(label) for label in meta["asset_order"] if normalize_label(label) not in excluded_assets]
    all_classes = [normalize_label(label) for label in meta["all_classes"]]
    event_tags = _normalize_event_tags(meta["event_tags"])
    macro_context = _normalize_macro_context(meta["macro_context"])
    availability = _derive_availability(all_labels, meta.get("availability") or (daily_history.availability if daily_history else None))
    historical_source = "sample" if last_updated.get("pipeline_mode") == "sample" else "generated"
    warnings = []
    if last_updated.get("fred_failures"):
        warnings.append(f"FRED partial failure: {', '.join(last_updated['fred_failures'])}")
    if historical_source == "sample":
        warnings.append("Historical data source: sample artifacts")
    if not daily_history:
        warnings.append("Daily history artifact missing: refresh data before testing custom events")

    for label in excluded_assets:
        asset_meta.pop(label, None)
        event_returns.pop(label, None)
        availability.pop(label, None)

    provenance = DataProvenance(
        historical_source=historical_source,
        historical_as_of=last_updated.get("as_of") or last_updated.get("timestamp") or (daily_history.as_of if daily_history else None),
        historical_loaded_at=None,
        live_source="none",
        live_mode="none",
        live_as_of=None,
        live_snapshot_date=None,
        warnings=warnings,
        schema_version=meta.get("schema_version") or last_updated.get("schema_version") or (daily_history.schema_version if daily_history else DATA_SCHEMA_VERSION),
    )
    trigger_z_scores = {_normalize_event_name(name): float(value) for name, value in trigger_z_scores_raw.items()}
    return DashboardBundle(
        event_returns=event_returns,
        asset_meta=asset_meta,
        asset_order=asset_order,
        all_labels=all_labels,
        all_classes=all_classes,
        trigger_z_scores=trigger_z_scores,
        last_updated=last_updated.get("timestamp"),
        events=events,
        event_tags=event_tags,
        macro_context=macro_context,
        availability=availability,
        provenance=provenance,
        daily_history=daily_history,
        live_snapshot=live_snapshot,
    )


def clone_bundle(bundle: DashboardBundle) -> DashboardBundle:
    return copy.deepcopy(bundle)
