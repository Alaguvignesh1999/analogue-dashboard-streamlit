from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


EventReturns = dict[str, dict[str, dict[int, float]]]
LiveReturns = dict[str, dict[int, float]]


@dataclass(frozen=True)
class AvailabilityWindow:
    start_date: str | None
    end_date: str | None


@dataclass(frozen=True)
class EventDef:
    name: str
    date: str


@dataclass(frozen=True)
class MacroContext:
    trigger: float
    cpi: Literal["high", "mid", "low"]
    fed: Literal["hiking", "cutting", "hold"]


@dataclass(frozen=True)
class AssetMeta:
    ticker: str
    class_name: str
    source: Literal["yf", "fred"]
    invert: bool
    is_rates_bp: bool
    display_label: str


@dataclass
class DataProvenance:
    historical_source: Literal["generated", "sample"]
    historical_as_of: str | None
    historical_loaded_at: str | None
    live_source: Literal["none", "live", "demo"]
    live_mode: Literal["none", "shared", "private", "demo"]
    live_as_of: str | None
    live_snapshot_date: str | None
    warnings: list[str] = field(default_factory=list)
    schema_version: int | None = None


@dataclass(frozen=True)
class DailyHistoryPayload:
    dates: list[str]
    prices: dict[str, list[float | None]]
    observed_indices: dict[str, list[int]] = field(default_factory=dict)
    availability: dict[str, AvailabilityWindow] = field(default_factory=dict)
    as_of: str | None = None
    schema_version: int | None = None


@dataclass(frozen=True)
class LiveAssetStatus:
    status: Literal["ok", "missing"]
    source: Literal["shared-snapshot", "generated-history", "runtime-fetch"]
    as_of_date: str | None
    warning: str | None = None


@dataclass
class SharedLiveSnapshot:
    name: str
    snapshot_date: str
    requested_day0: str
    actual_day0: str | None
    trigger_date: str | None
    as_of_date: str | None
    day_n: int
    trading_day_n: int
    returns: LiveReturns
    levels: LiveReturns
    scoring_returns: LiveReturns
    scoring_levels: LiveReturns
    asset_status: dict[str, LiveAssetStatus]
    warnings: list[str]
    provenance_mode: Literal["shared", "private"]
    provenance_source: Literal["shared-snapshot", "generated-history", "runtime-fetch"]
    provenance_built_at: str
    schema_version: int | None
    business_dates: list[str]
    trigger_price: float | None
    trigger_z_score: float | None
    trigger_pctile: float | None
    tag_set: list[str] = field(default_factory=list)
    cpi: str | None = None
    fed: str | None = None
    analysis_day_n: int | None = None
    request_mode: Literal["shared", "private"] | None = None


@dataclass(frozen=True)
class CustomEventDef:
    name: str
    date: str
    source: Literal["custom"] = "custom"
    tags: list[str] = field(default_factory=list)
    trigger: float | None = None
    created_at: str = ""
    selected_date: str = ""
    resolved_anchor_date: str | None = None
    storage_scope: Literal["session"] = "session"


@dataclass
class DashboardBundle:
    event_returns: EventReturns
    asset_meta: dict[str, AssetMeta]
    asset_order: list[str]
    all_labels: list[str]
    all_classes: list[str]
    trigger_z_scores: dict[str, float]
    last_updated: str | None
    events: list[EventDef]
    event_tags: dict[str, set[str]]
    macro_context: dict[str, MacroContext]
    availability: dict[str, AvailabilityWindow]
    provenance: DataProvenance
    daily_history: DailyHistoryPayload | None
    live_snapshot: SharedLiveSnapshot | None


@dataclass(frozen=True)
class AnalogueScore:
    event: str
    composite: float
    raw_composite: float
    quant: float
    quant_pt: float
    tag: float
    macro: float
    shared_asset_count: int
    coverage_ratio: float
    sparse_penalty: float
    confidence_label: Literal["high", "medium", "thin"]
