import { create } from 'zustand';
import { EventReturns, AssetMeta } from '@/engine/returns';
import { AnalogueScore } from '@/engine/similarity';
import { EVENTS, EventDef } from '@/config/events';

export type TabGroup = 'historical' | 'live' | 'analysis' | 'risk' | 'tools';
export type TabId = string;

interface LiveState {
  name: string;
  day0: string | null; // ISO date
  tags: Set<string>;
  trigger: number;
  triggerPctile: number | null;
  cpi: string;
  fed: string;
  returns: Record<string, Record<number, number>> | null;
  dayN: number | null;
}

interface DashboardState {
  // Navigation
  activeGroup: TabGroup;
  activeTab: TabId;
  setActiveGroup: (g: TabGroup) => void;
  setActiveTab: (t: TabId) => void;

  // Data
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

  setData: (data: {
    eventReturns: EventReturns;
    assetMeta: Record<string, AssetMeta>;
    assetOrder: string[];
    allLabels: string[];
    allClasses: string[];
    triggerZScores: Record<string, number>;
    lastUpdated: string;
  }) => void;
  setLoading: (v: boolean) => void;

  // Live
  live: LiveState;
  setLive: (l: Partial<LiveState>) => void;

  // Scores
  scores: AnalogueScore[];
  setScores: (s: AnalogueScore[]) => void;
  scoreCutoff: number;
  setCutoff: (c: number) => void;

  // Shared horizon
  horizon: number;
  setHorizon: (h: number) => void;

  // Active events (checkboxes)
  activeEvents: Set<string>;
  toggleEvent: (name: string) => void;
  setActiveEvents: (names: Set<string>) => void;
}

export const useDashboard = create<DashboardState>((set) => ({
  // Navigation
  activeGroup: 'historical',
  activeTab: 'overlay',
  setActiveGroup: (g) => set({ activeGroup: g }),
  setActiveTab: (t) => set({ activeTab: t }),

  // Data
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

  setData: (data) => set({
    eventReturns: data.eventReturns,
    assetMeta: data.assetMeta,
    assetOrder: data.assetOrder,
    allLabels: data.allLabels,
    allClasses: data.allClasses,
    triggerZScores: data.triggerZScores,
    lastUpdated: data.lastUpdated,
    dataLoaded: true,
    isLoading: false,
  }),
  setLoading: (v) => set({ isLoading: v }),

  // Live
  live: {
    name: 'Iran War 2026',
    day0: '2026-02-28',
    tags: new Set(['energy_shock', 'military_conflict']),
    trigger: 70,
    triggerPctile: null,
    cpi: 'mid',
    fed: 'hold',
    returns: null,
    dayN: null,
  },
  setLive: (l) => set(state => ({
    live: { ...state.live, ...l }
  })),

  // Scores
  scores: [],
  setScores: (s) => set({ scores: s }),
  scoreCutoff: 0.50,
  setCutoff: (c) => set({ scoreCutoff: c }),

  // Shared horizon
  horizon: 21,
  setHorizon: (h) => set({ horizon: h }),

  // Active events
  activeEvents: new Set(EVENTS.map(e => e.name)),
  toggleEvent: (name) => set(state => {
    const next = new Set(state.activeEvents);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return { activeEvents: next };
  }),
  setActiveEvents: (names) => set({ activeEvents: names }),
}));
