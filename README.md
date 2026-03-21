# Analogue Engine - Cross-Asset Event Dashboard

A production-grade web app for multi-event, multi-asset historical analogue analysis. Built from a 69-cell Jupyter notebook powering geopolitical and macro shock analysis across 120+ assets and 13 historical events.

## Quick Start

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd analogue-dashboard
npm install
```

### 2. Configure Secrets
```bash
cp .env.example .env
```

Add your FRED key to `.env`:

```bash
FRED_API_KEY=your_key_here
```

Never commit real secrets to the repository.

### 3. Run Data Pipeline (first time)
```bash
pip install -r scripts/requirements.txt
python scripts/pull_data.py
```

This creates compressed JSON files in `public/data/` that the app reads on load.

### 4. Start Dev Server
```bash
npm run dev
# -> http://localhost:3000
```

### 5. Deploy to Vercel
```bash
# Push to GitHub, then:
# 1. Connect repo to Vercel
# 2. Add FRED_API_KEY as a Vercel environment variable
# 3. Deploy
```

## Data Pipeline

The data pipeline runs via **GitHub Actions** (`.github/workflows/data-refresh.yml`):
- **Daily** at 9:30 PM ET (post-market close)
- **Manual** trigger via `workflow_dispatch`

It pulls 120+ tickers from yfinance + FRED, computes event returns for all 13 events, and commits compressed JSON to `public/data/`.

### Required Secrets
- `FRED_API_KEY` in GitHub Actions Secrets for the scheduled data refresh workflow
- `FRED_API_KEY` in Vercel Environment Variables if you want the live server API routes to query FRED at runtime

## Architecture

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Charts | Recharts |
| State | Zustand |
| Data Pipeline | Python + GitHub Actions |
| Deployment | Vercel |
| Heavy Compute | Client-side (Web Workers planned) |

## Tab Groups (26 total)

### Historical (9 tabs)
Events - Overlay - Cross-Asset - Heatmap - Scatter - VIX - Box & Whisker - Summary - Step-In

### Live Engine (5 tabs)
L1 Config - L2 Analogues - L3 Paths - L4 Trade Ideas - L5 Detail

### Analysis (5 tabs)
Screener - Lead-Lag - Reverse Lookup - Pre-Positioning - Sector Rotation

### Risk (5 tabs)
Portfolio Stress - Signal Decay - Confidence/Kelly - OOS Validation - Entry/Exit Gate

### Tools (2 tabs)
Correlation (5 sub-tabs) - Trade Memo

## V1 Working Tabs
- Overlay (return path overlay)
- Heatmap (POI x event matrix)
- L1 Config (live event setup)
- L4 Trade Ideas (ranked table with Sharpe/Sortino/hit rate)
- L6 Screener (conviction/bimodal/redundancy)
- L12 Signal Decay (rank evolution chart)
- Entry/Exit Gate (traffic light table)
- Remaining 19 tabs (V2)
