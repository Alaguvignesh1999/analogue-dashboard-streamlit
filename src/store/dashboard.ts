import { create } from 'zustand';
import { EventReturns, AssetMeta } from '@/engine/returns';
import { AnalogueScore } from '@/engine/similarity';
import { ANALOGUE_WEIGHTS, DATA_SCHEMA_VERSION, SIMILARITY_ASSET_POOL } from '@/config/engine';
import { EVENTS, EVENT_TAGS, MACRO_CONTEXT, EventDef, MacroContext } from '@/config/events';
import { AvailabilityWindow } from '@/config/availability';
import { DataProvenance, DailyHistoryPayload } from '@/engine/types';

export type TabGroup = 'historical' | 'live' | 'analysis' | 'risk' | 'tools';
export type TabId = string;

export interface CustomEventDef extends EventDef {
  source: 'custom';
  tags: string[];
  trigger: number | null;
  createdAt: string;
}

interface LiveState {
  name: string;
  day0: string | null;
  tags: Set<string>;
  trigger: number;
  triggerPctile: number | null;
  triggerZScore: number | null;
  triggerDate: string | null;
  cpi: string;
  fed: string;
  returns: Record<string, Record<number, number>> | null;
  levels: Record<string, Record<number, number>> | null;
  dayN: number | null;
  actualDay0: string | null;
  businessDates: string[];
  asOfDate: string | null;
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
    liveAsOf: null,
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
        liveAsOf: state.provenance.liveAsOf,
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
    name: 'Iran War 2026',
    day0: '2026-02-28',
    tags: new Set(['energy_shock', 'military_conflict']),
    trigger: 70,
    triggerPctile: null,
    triggerZScore: null,
    triggerDate: null,
    cpi: 'mid',
    fed: 'hold',
    returns: null,
    levels: null,
    dayN: null,
    actualDay0: null,
    businessDates: [],
    asOfDate: null,
  },
  setLive: (l) => set((state) => ({
    live: { ...state.live, ...l },
    provenance: {
      ...state.provenance,
      liveAsOf: l.asOfDate ?? state.provenance.liveAsOf,
    },
  })),
  resetLive: () => set((state) => ({
    live: {
      ...state.live,
      returns: null,
      levels: null,
      dayN: null,
      actualDay0: null,
      businessDates: [],
      asOfDate: null,
      triggerPctile: null,
      triggerZScore: null,
      triggerDate: null,
    },
    provenance: {
      ...state.provenance,
      liveSource: 'none',
      liveAsOf: null,
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
  similarityAssets: [...SIMILARITY_ASSET_POOL],
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
      const parsed = JSON.parse(raw) as Array<CustomEventDef & {
        returnsByAsset?: Record<string, Record<number, number>>;
      }>;
      const customEvents = parsed.map(({ returnsByAsset: _ignored, ...event }) => event);
      const events = [...state.events];
      const eventReturns = { ...state.eventReturns };
      const eventTags = { ...state.eventTags };
      const macroContext = { ...state.macroContext };
      const activeEvents = new Set(state.activeEvents);

      for (const item of parsed) {
        if (!events.find((event) => event.name === item.name)) {
          events.push({ name: item.name, date: item.date });
        }
        if (item.returnsByAsset) {
          for (const [label, series] of Object.entries(item.returnsByAsset)) {
            eventReturns[label] = {
              ...(eventReturns[label] || {}),
              [item.name]: series,
            };
          }
        }
        eventTags[item.name] = new Set(item.tags);
        macroContext[item.name] = {
          trigger: item.trigger ?? 0,
          cpi: 'mid' as const,
          fed: 'hold' as const,
        };
        activeEvents.add(item.name);
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
