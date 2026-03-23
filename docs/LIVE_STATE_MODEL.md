# Live State Model

This dashboard intentionally separates three related but different live concepts:

## 1. Display Day

- `displayDayN`
- `displayDate`

This is the primary charting day for live path visuals such as `Overlay` and `Paths`.
It answers: "What day of the live event are we showing on the chart?"

Rules:

- defaults to the loaded live `dayN`
- respects the local analysis-day override
- is allowed to use the display path/calendar extension used for chart continuity

## 2. Effective Scoring Day

- `effectiveScoringDayN`
- `effectiveScoringDate`

This is the day actually used for score-sensitive calculations such as:

- analogue matching
- trade ideas
- detail drill-down
- gate
- decay
- screener

Rules:

- always uses the latest valid observation on or before the requested day
- never uses a future observation
- is asset-set dependent because different selected assets can have different valid overlap

## 3. Analysis-Day Override

- `analysisDayOverride`

This is a local workflow tool that lets the user pretend the live event is only at `D+N`.
It is useful for replaying the event as if the team were earlier in the timeline.

Rules:

- preview/local workflow only
- affects downstream score-sensitive tabs consistently
- does not mutate shared snapshot state

## Why The Distinction Matters

The dashboard used to mix display-day logic with scoring-day logic. That caused:

- inconsistent markers between `Overlay` and `Paths`
- scoring drift when live display paths were extended differently from scoring paths
- confusion when different tabs appeared to be using different "today" values

The current rule is:

- charts may show a display day
- scoring must use the effective scoring day
- diagnostics should expose both when they differ

## Where To Look In Code

- live helpers: `src/engine/live.ts`
- shared state: `src/store/dashboard.ts`
- diagnostics strip: `src/components/ui/DiagnosticsStrip.tsx`
- live config override UI: `src/components/tabs/live/LiveConfigTab.tsx`
