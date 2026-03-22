# Analogue Dashboard

Analogue Dashboard is a Next.js web application for cross-asset historical analogue analysis, live-event matching, and scenario/risk workflows. It is the web productionization of the original notebook workflow, with generated historical artifacts, a shared live snapshot, and browser-local custom events.

## Current State

- Framework: Next.js 15 / React 19
- Historical dataset: generated artifacts in `public/data/`
- Live dataset: shared daily snapshot plus private scenario mode
- Asset coverage: 130+ assets across equities, rates, FX, credit, commodities, volatility, and crypto
- Base event set: 13 canonical historical events
- Custom events: local-only, browser-scoped, constrained to loaded historical coverage

## Core Product Rules

- Historical analysis reads only generated artifacts committed under `public/data/`.
- Live scoring uses the latest observed market date on or before the requested Day 0. No lookahead is allowed.
- Shared live snapshot is the default team view.
- Private live scenarios reuse cached/generated data first and do not overwrite shared snapshot state.
- Custom events never trigger historical backfills. They are computed locally from the already loaded daily-history artifact.

## Main Repository Layout

- `src/app/`: Next.js app shell and API routes
- `src/components/`: dashboard UI and tab implementations
- `src/engine/`: shared analytics, scoring, decay, live helpers, and custom-event logic
- `src/store/`: shared Zustand dashboard state
- `src/hooks/`: data loading and initialization
- `public/data/`: generated historical and live snapshot artifacts
- `scripts/`: data pipeline and regression/integrity checks
- `config/`: live defaults and project configuration
- `.github/workflows/`: scheduled refresh automation
- `docs/`: architecture and operations notes

## Data Artifacts

The frontend expects these generated artifacts:

- `public/data/meta.json`
- `public/data/event_returns.json.gz`
- `public/data/daily_history.json.gz`
- `public/data/trigger_zscores.json`
- `public/data/last_updated.json`
- `public/data/live_snapshot.json`

The app surfaces provenance from these artifacts so users can tell whether they are reading generated historical data, a shared live snapshot, a private scenario, or demo mode.

## Local Development

### 1. Install dependencies

```bash
npm install
pip install -r scripts/requirements.txt
```

### 2. Configure secrets

Create `.env.local` from `.env.example` and set:

```bash
FRED_API_KEY=your_real_key_here
```

Do not commit live secrets.

### 3. Generate or refresh data locally

```bash
python scripts/pull_data.py
```

### 4. Start the app

```bash
npm run dev
```

## Validation Commands

Run these before preview or production release:

```bash
npm run build
npm run test:snapshot-contract
npm run test:live-parity
npm run test:data-integrity
npm run test:gate-regression
```

## Deployment Model

### Historical refresh

GitHub Actions runs `.github/workflows/data-refresh.yml` on schedule and by manual dispatch. It regenerates `public/data/*` and commits those artifacts back to the repo.

### Preview deploys

Use Vercel preview deployments for ongoing work:

```bash
vercel deploy -y
```

### Production deploys

Only deploy to production after:

1. docs and code are committed
2. generated data is refreshed
3. validation commands pass
4. the release candidate is reviewed in preview

Then deploy:

```bash
vercel deploy --prod -y
```

## Documentation

- [Architecture](C:/Users/vigne/Downloads/analogue-dashboard-clean/docs/ARCHITECTURE.md)
- [Operations](C:/Users/vigne/Downloads/analogue-dashboard-clean/docs/OPERATIONS.md)
- [Changelog](C:/Users/vigne/Downloads/analogue-dashboard-clean/CHANGELOG.md)

## Important Operational Notes

- Production and GitHub `main` should stay aligned. Do not leave production running from an unmerged branch indefinitely.
- Browser-local custom events are intentionally private and are not written back to GitHub or the shared live snapshot.
- Some asset classes have mixed calendars. The live engine resolves on-or-before values and surfaces warnings when a requested asset has no valid data at the requested anchor.
- `last_updated.json` is the first place to verify whether the current historical bundle is generated, current, and free of FRED failures.
