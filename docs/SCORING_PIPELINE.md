# Scoring Pipeline

This document describes the intended scoring pipeline for the web dashboard.

## Historical Source Of Truth

Historical scoring inputs come from generated artifacts in `public/data/`:

- `event_returns.json.gz`
- `daily_history.json.gz`
- `availability` / provenance metadata

Historical tabs must not silently fetch or synthesize missing history.

## Live Source Of Truth

Live scoring uses:

- shared live snapshot by default
- private scenario mode only when explicitly requested

Live anchoring is always:

- latest observed market date on or before requested Day 0
- never forward-looking

## Analogue Composite

The composite score blends:

- `quant`
- `tag`
- `macro`

Weights are normalized in-app so they sum to `1.00`.

## Coverage Adjustment

Sparse older events can over-rank if they only overlap on one or two assets.
The dashboard therefore applies an overlap-aware penalty:

- require a minimum overlap floor before an event can compete normally
- compute coverage as `shared assets / requested comparison assets`
- penalize thin overlap rather than treating it as equal evidence

This applies to:

- analogue matching
- decay scoring

It is intentionally not a notebook-exact behavior; it is a reliability improvement for firm use.

## Shared Score-Sensitive Consumers

These tabs should read the same effective scoring basis:

- `L2 Analogues`
- `L4 Trade Ideas`
- `L5 Detail`
- `L6 Screener`
- `L12 Decay`
- `Gate`
- any other live risk/analysis surfaces that reference current live position

If one of these tabs diverges from the others, treat it as a bug.

## Group Registry

All group-driven selectors should use the canonical notebook-derived registry in:

- `src/config/assets.ts`

Do not recreate local copies of group definitions inside tabs.

## Notebook Parity Checkpoints

When changing score-sensitive logic, compare against the notebook for:

- selected analogue ordering
- trade-idea forward distributions
- decay ranking behavior
- coverage and overlap behavior
- event filtering / deselection propagation

## Release Gate

Minimum release commands:

```bash
npm run build
npm run test:snapshot-contract
npm run test:live-parity
npm run test:data-integrity
npm run test:gate-regression
npm run test:ui-contract
```
