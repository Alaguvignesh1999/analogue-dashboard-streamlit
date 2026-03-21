// Hardcoded from notebook §1.2 — EVENT_TAGS, MACRO_CONTEXT
// Users can add events via UI; these are the built-in defaults.

export interface EventDef {
  name: string;
  date: string; // YYYY-MM-DD
}

export const EVENTS: EventDef[] = [
  { name: '1973 Oil Embargo†', date: '1973-10-17' },
  { name: '1990 Gulf War', date: '1990-08-02' },
  { name: '1991 Kuwait Oil Fires', date: '1991-01-16' },
  { name: '1998 Desert Fox', date: '1998-12-16' },
  { name: '2001 Afghanistan (OEF)', date: '2001-10-07' },
  { name: '2003 SARS', date: '2003-03-12' },
  { name: '2003 Iraq War', date: '2003-03-20' },
  { name: '2011 Libya', date: '2011-03-19' },
  { name: '2014 ISIS/Mosul', date: '2014-06-10' },
  { name: '2017 Syria Strikes', date: '2017-04-07' },
  { name: '2020 COVID-19 PHEIC', date: '2020-01-30' },
  { name: '2022 Russia-Ukraine', date: '2022-02-24' },
  { name: '2023 Red Sea Crisis', date: '2023-12-19' },
];

export const ALL_TAGS = [
  'energy_shock',
  'military_conflict',
  'shipping_disruption',
  'sanctions',
  'pandemic',
] as const;

export type EventTag = typeof ALL_TAGS[number];

export const EVENT_TAGS: Record<string, Set<string>> = {
  '1973 Oil Embargo†':      new Set(['energy_shock', 'sanctions']),
  '1990 Gulf War':          new Set(['military_conflict', 'energy_shock']),
  '1991 Kuwait Oil Fires':  new Set(['military_conflict', 'energy_shock']),
  '1998 Desert Fox':        new Set(['military_conflict']),
  '2001 Afghanistan (OEF)': new Set(['military_conflict']),
  '2003 SARS':              new Set(['pandemic']),
  '2003 Iraq War':          new Set(['military_conflict', 'energy_shock']),
  '2011 Libya':             new Set(['military_conflict', 'energy_shock']),
  '2014 ISIS/Mosul':        new Set(['military_conflict', 'energy_shock']),
  '2017 Syria Strikes':     new Set(['military_conflict']),
  '2020 COVID-19 PHEIC':    new Set(['pandemic']),
  '2022 Russia-Ukraine':    new Set(['military_conflict', 'energy_shock', 'sanctions']),
  '2023 Red Sea Crisis':    new Set(['shipping_disruption', 'military_conflict']),
};

export interface MacroContext {
  trigger: number; // TRIGGER_ASSET level at Day 0
  cpi: 'high' | 'mid' | 'low';
  fed: 'hiking' | 'cutting' | 'hold';
}

export const MACRO_CONTEXT: Record<string, MacroContext> = {
  '1973 Oil Embargo†':      { trigger:   4, cpi: 'high', fed: 'hiking' },
  '1990 Gulf War':          { trigger:  17, cpi: 'high', fed: 'cutting' },
  '1991 Kuwait Oil Fires':  { trigger:  25, cpi: 'high', fed: 'cutting' },
  '1998 Desert Fox':        { trigger:  11, cpi: 'low',  fed: 'hold' },
  '2001 Afghanistan (OEF)': { trigger:  22, cpi: 'low',  fed: 'cutting' },
  '2003 SARS':              { trigger:  35, cpi: 'low',  fed: 'cutting' },
  '2003 Iraq War':          { trigger:  37, cpi: 'low',  fed: 'cutting' },
  '2011 Libya':             { trigger:  85, cpi: 'mid',  fed: 'hold' },
  '2014 ISIS/Mosul':        { trigger: 104, cpi: 'low',  fed: 'hold' },
  '2017 Syria Strikes':     { trigger:  53, cpi: 'mid',  fed: 'hiking' },
  '2020 COVID-19 PHEIC':    { trigger:  54, cpi: 'low',  fed: 'cutting' },
  '2022 Russia-Ukraine':    { trigger:  91, cpi: 'high', fed: 'hiking' },
  '2023 Red Sea Crisis':    { trigger:  73, cpi: 'mid',  fed: 'hold' },
};

// Chart colours for each event (dark-mode friendly, from notebook)
export const EVENT_COLORS = [
  '#58a6ff', '#f78166', '#3fb950', '#d2a8ff', '#ffa657',
  '#ff7b72', '#79c0ff', '#56d364', '#e3b341', '#bc8cff',
  '#ff9bce', '#89ddff', '#a5d6ff',
];

export const EVENT_DASHES = [
  'solid', 'solid', 'solid', 'solid',
  'dashed', 'dashed', 'dashed', 'dashed',
  'dotted', 'dotted', 'dotted', 'dotted',
  'dashdot',
];
