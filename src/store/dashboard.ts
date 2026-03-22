import { create } from 'zustand';
import { EventReturns, AssetMeta } from '@/engine/returns';
import { AnalogueScore } from '@/engine/similarity';
import { ANALOGUE_WEIGHTS, DATA_SCHEMA_VERSION, DEFAULT_LIVE_SIM_ASSETS } from '@/config/engine';
import { EVENTS, EVENT_TAGS, MACRO_CONTEXT, EventDef, MacroContext } from '@/config/events';
import { AvailabilityWindow } from '@/config/availability';
import { DataProvenance, DailyHistoryPayload, LiveAssetStatus, LiveRequestMode } from '@/engine/types';
import liveDefaults from '../../config/live_defaults.json';

export type TabGroup = 'historical' | 'live' | 'analysis' | 'risk' | 'tools';
export type TabId = string;

export interface CustomEventDef extends EventDef {
  source: 'custom';
  tags: string[];
  trigger: number | null;
  createdAt: string;
  selectedDate: string;
  resolvedAnchorDate: string | null;
  storageScope: 'local';
}

interface LiveState {
  name: string;
  day0: string | null;
  analysisDayN: number | null;
  tags: Set<string>;
  trigger: number;
  triggerPctile: number | null;
  triggerZScore: number | null;
  triggerDate: string | null;
  cpi: string;
  fed: string;
  returns: Record<string, Record<number, number>> | null;
  levels: Record<string, Record<number, number>> | null;
  scoringReturns: Record<string, Record<number, number>> | null;
  scoringLevels: Record<string, Record<number, number>> | null;
  dayN: number | null;
  tradingDayN: number | null;
  actualDay0: string | null;
  businessDates: string[];
  asOfDate: string | null;
  requestMode: LiveRequestMode | null;
  snapshotDate: string | null;
  assetStatus: Record<string, LiveAssetStatus>;
  warnings: string[];
}

interface AnalogueWeightsState {
  quant: number;
  tag: number;
  macro: number;
}

interface DashboardState {
  activeGroup: TabGroup;
  activeTab: TabId;
  setActiveGroup: (g: TabGroup) => void;
  setActiveTab: (t: TabId) => void;

  isLoading: boolean;
  dataLoaded: boolean;
  lastUpdated: string | null;
  eventReturns: EventReturns;
  assetMeta: Record<string, AssetMeta>;
  assetOrder: string[];
  allLabels: string[];
  allClasses: string[];
  triggerZScores: Record<string, number>;
  events: EventDef[];
  eventTags: Record<string, Set<string>>;
  macroContext: Record<string, MacroContext>;
  availability: Record<string, AvailabilityWindow>;
  provenance: DataProvenance;
  dailyHistory: DailyHistoryPayload | null;
  customEvents: CustomEventDef[];

  setData: (data: {
    eventReturns: EventReturns;
    assetMeta: Record<string, AssetMeta>;
    assetOrder: string[];
    allLabels: string[];
    allClasses: string[];
    triggerZScores: Record<string, number>;
    lastUpdated: string;
    historicalAsOf: string | null;
    events: EventDef[];
    eventTags: Record<string, Set<string>>;
    macroContext: Record<string, MacroContext>;
    availability: Record<string, AvailabilityWindow>;
    historicalSource: 'generated' | 'sample';
    warnings: string[];
    schemaVersion: number | null;
  }) => void;
  setLoading: (v: boolean) => void;
  setDailyHistory: (dailyHistory: DailyHistoryPayload | null) => void;
  setProvenance: (patch: Partial<DataProvenance>) => void;

  live: LiveState;
  setLive: (l: Partial<LiveState>) => void;
  resetLive: () => void;

  scores: AnalogueScore[];
  setScores: (s: AnalogueScore[]) => void;
  scoreCutoff: number;
  setCutoff: (c: number) => void;
  analogueWeights: AnalogueWeightsState;
  setAnalogueWeights: (patch: Partial<AnalogueWeightsState>) => void;
  similarityAssets: string[];
  setSimilarityAssets: (assets: string[]) => void;

  horizon: number;
  setHorizon: (h: number) => void;

  activeEvents: Set<string>;
  toggleEvent: (name: string) => void;
  setActiveEvents: (names: Set<string>) => void;
  addCustomEvent: (event: CustomEventDef, returns?: Record<string, Record<number, number>>) => void;
  hydrateCustomEvents: () => void;

  crossAssetSelection: Set<string>;
  setCrossAssetSelection: (next: Set<string>) => void;
  toggleCrossAssetSelection: (label: string) => void;
}

const CUSTOM_EVENTS_STORAGE_KEY = 'analogue-dashboard.custom-events.v1';

function persistCustomEvents(customEvents: CustomEventDef[], eventReturns: EventReturns) {
  if (typeof window === 'undefined') return;
  const payload = customEvents.map((event) => ({
    ...event,
    returnsByAsset: Object.fromEntries(
      Object.entries(eventReturns)
        .filter(([, events]) => events[event.name])
        .map(([label, events]) => [label, events[event.name]])
    ),
  }));
  window.localStorage.setItem(CUSTOM_EVENTS_STORAGE_KEY, JSON.stringify(payload));
}

export const useDashboard = create<DashboardState>((set) => ({
  activeGroup: 'historical',
  activeTab: 'overlay',
  setActiveGroup: (g) => set({ activeGroup: g }),
  setActiveTab: (t) => set({ activeTab: t }),

  isLoading: true,
  dataLoaded: false,
  lastUpdated: null,
  eventReturns: {},
  assetMeta: {},
  assetOrder: [],
  allLabels: [],
  allClasses: [],
  triggerZScores: {},
  events: EVENTS,
  eventTags: EVENT_TAGS,
  macroContext: MACRO_CONTEXT,
  availability: {},
  provenance: {
    historicalSource: 'generated',
    historicalAsOf: null,
    historicalLoadedAt: null,
    liveSource: 'none',
    liveMode: 'none',
    liveAsOf: null,
    liveSnapshotDate: null,
    warnings: [],
    schemaVersion: DATA_SCHEMA_VERSION,
  },
  dailyHistory: null,
  customEvents: [],

  setData: (data) => set((state) => {
    const activeEvents = new Set(data.events.map((event) => event.name));
    for (const event of state.customEvents) {
      activeEvents.add(event.name);
    }

    return {
      eventReturns: data.eventReturns,
      assetMeta: data.assetMeta,
      assetOrder: data.assetOrder,
      allLabels: data.allLabels,
      allClasses: data.allClasses,
      triggerZScores: data.triggerZScores,
      lastUpdated: data.lastUpdated,
      events: data.events,
      eventTags: data.eventTags,
      macroContext: data.macroContext,
      availability: data.availability,
      activeEvents,
      dataLoaded: true,
      isLoading: false,
      provenance: {
        historicalSource: data.historicalSource,
        historicalAsOf: data.historicalAsOf,
        historicalLoadedAt: new Date().toISOString(),
        liveSource: state.provenance.liveSource,
        liveMode: state.provenance.liveMode,
        liveAsOf: state.provenance.liveAsOf,
        liveSnapshotDate: state.provenance.liveSnapshotDate,
        warnings: data.warnings,
        schemaVersion: data.schemaVersion,
      },
    };
  }),
  setLoading: (v) => set({ isLoading: v }),
  setDailyHistory: (dailyHistory) => set({ dailyHistory }),
  setProvenance: (patch) => set((state) => ({
    provenance: { ...state.provenance, ...patch },
  })),

  live: {
    name: liveDefaults.name,
    day0: liveDefaults.day0,
    analysisDayN: null,
    tags: new Set(liveDefaults.tags),
    trigger: 70,
    triggerPctile: null,
    triggerZScore: null,
    triggerDate: null,
    cpi: liveDefaults.cpi,
    fed: liveDefaults.fed,
    returns: null,
    levels: null,
    scoringReturns: null,
    scoringLevels: null,
    dayN: null,
    tradingDayN: null,
    actualDay0: null,
    businessDates: [],
    asOfDate: null,
    requestMode: null,
    snapshotDate: null,
    assetStatus: {},
    warnings: [],
  },
  setLive: (l) => set((state) => ({
    live: { ...state.live, ...l },
    provenance: {
      ...state.provenance,
      liveAsOf: l.asOfDate ?? state.provenance.liveAsOf,
      liveSnapshotDate: l.snapshotDate ?? state.provenance.liveSnapshotDate,
    },
  })),
  resetLive: () => set((state) => ({
    live: {
      ...state.live,
      returns: null,
      levels: null,
      scoringReturns: null,
      scoringLevels: null,
      analysisDayN: null,
      dayN: null,
      tradingDayN: null,
      actualDay0: null,
      businessDates: [],
      asOfDate: null,
      requestMode: null,
      snapshotDate: null,
      assetStatus: {},
      warnings: [],
      triggerPctile: null,
      triggerZScore: null,
      triggerDate: null,
    },
    provenance: {
      ...state.provenance,
      liveSource: 'none',
      liveMode: 'none',
      liveAsOf: null,
      liveSnapshotDate: null,
    },
  })),

  scores: [],
  setScores: (s) => set({ scores: s }),
  scoreCutoff: 0.5,
  setCutoff: (c) => set({ scoreCutoff: c }),
  analogueWeights: { ...ANALOGUE_WEIGHTS },
  setAnalogueWeights: (patch) => set((state) => {
    const merged = { ...state.analogueWeights, ...patch };
    const total = merged.quant + merged.tag + merged.macro;
    if (total <= 0) {
      return { analogueWeights: { ...ANALOGUE_WEIGHTS } };
    }
    return {
      analogueWeights: {
        quant: merged.quant / total,
        tag: merged.tag / total,
        macro: merged.macro / total,
      },
    };
  }),
  similarityAssets: [...DEFAULT_LIVE_SIM_ASSETS],
  setSimilarityAssets: (assets) => set({ similarityAssets: assets }),

  horizon: 21,
  setHorizon: (h) => set({ horizon: h }),

  activeEvents: new Set(EVENTS.map((event) => event.name)),
  toggleEvent: (name) => set((state) => {
    const next = new Set(state.activeEvents);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return { activeEvents: next };
  }),
  setActiveEvents: (names) => set({ activeEvents: names }),
  addCustomEvent: (event, returns) => set((state) => {
    const customEvents = [
      ...state.customEvents.filter((existing) => existing.name !== event.name),
      event,
    ].sort((a, b) => a.date.localeCompare(b.date));

    const events = [
      ...state.events.filter((existing) => existing.name !== event.name),
      { name: event.name, date: event.date },
    ].sort((a, b) => a.date.localeCompare(b.date));

    const eventReturns = { ...state.eventReturns };
    if (returns) {
      for (const [label, series] of Object.entries(returns)) {
        eventReturns[label] = {
          ...(eventReturns[label] || {}),
          [event.name]: series,
        };
      }
    }

    const eventTags = {
      ...state.eventTags,
      [event.name]: new Set(event.tags),
    };
    const macroContext = {
      ...state.macroContext,
      [event.name]: {
        trigger: event.trigger ?? 0,
        cpi: 'mid' as const,
        fed: 'hold' as const,
      },
    };
    const activeEvents = new Set(state.activeEvents);
    activeEvents.add(event.name);

    persistCustomEvents(customEvents, eventReturns);

    return { customEvents, events, eventReturns, eventTags, macroContext, activeEvents };
  }),
  hydrateCustomEvents: () => set((state) => {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem(CUSTOM_EVENTS_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Array<Partial<CustomEventDef> & {
        returnsByAsset?: Record<string, Record<number, number>>;
      }>;
      const customEvents = parsed.map(({ returnsByAsset: _ignored, ...event }) => ({
        name: event.name || 'Custom Event',
        date: event.date || event.selectedDate || '',
        source: 'custom' as const,
        tags: event.tags || [],
        trigger: event.trigger ?? null,
        createdAt: event.createdAt || new Date().toISOString(),
        selectedDate: event.selectedDate || event.date || '',
        resolvedAnchorDate: event.resolvedAnchorDate || event.date || null,
        storageScope: 'local' as const,
      }));
      const events = [...state.events];
      const eventReturns = { ...state.eventReturns };
      const eventTags = { ...state.eventTags };
      const macroContext = { ...state.macroContext };
      const activeEvents = new Set(state.activeEvents);

      for (const item of parsed) {
        const normalizedItem: CustomEventDef = {
          name: item.name || 'Custom Event',
          date: item.date || item.selectedDate || '',
          source: 'custom',
          tags: item.tags || [],
          trigger: item.trigger ?? null,
          createdAt: item.createdAt || new Date().toISOString(),
          selectedDate: item.selectedDate || item.date || '',
          resolvedAnchorDate: item.resolvedAnchorDate || item.date || null,
          storageScope: 'local',
        };
        if (!events.find((event) => event.name === normalizedItem.name)) {
          events.push({ name: normalizedItem.name, date: normalizedItem.date });
        }
        if (item.returnsByAsset) {
          for (const [label, series] of Object.entries(item.returnsByAsset)) {
            eventReturns[label] = {
              ...(eventReturns[label] || {}),
              [normalizedItem.name]: series,
            };
          }
        }
        eventTags[normalizedItem.name] = new Set(normalizedItem.tags);
        macroContext[normalizedItem.name] = {
          trigger: normalizedItem.trigger ?? 0,
          cpi: 'mid' as const,
          fed: 'hold' as const,
        };
        activeEvents.add(normalizedItem.name);
      }

      events.sort((a, b) => a.date.localeCompare(b.date));
      return { customEvents, events, eventReturns, eventTags, macroContext, activeEvents };
    } catch {
      return {};
    }
  }),

  crossAssetSelection: new Set<string>(),
  setCrossAssetSelection: (next) => set({ crossAssetSelection: next }),
  toggleCrossAssetSelection: (label) => set((state) => {
    const next = new Set(state.crossAssetSelection);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    return { crossAssetSelection: next };
  }),
}));
