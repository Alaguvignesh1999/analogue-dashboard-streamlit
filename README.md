# Analogue Dashboard Streamlit

This folder is the fully separate Streamlit migration of the analogue dashboard.
It is intended to be worked on independently from the original Next.js project.

## What Runs Here

- `app.py`: Streamlit entrypoint
- `views/`: tab/group renderers
- `engine/`: Python ports of the scoring, live, decay, trade, and custom-event logic
- `data_access/`: artifact loading and normalization
- `state/`: Streamlit session-state contract
- `tests/`: parity, loader, and smoke tests

## What Is Kept For Reference

- `src/`, `package.json`, and related Next.js files are kept in this copied repo only as a historical reference while the Streamlit version matures.
- They are not the runtime target for this project.
- The original Next.js project outside this folder remains untouched.

## Core Product Rules

- Historical analysis reads only generated artifacts under `public/data/`.
- Live scoring uses the latest observed market date on or before the requested Day 0.
- Shared live snapshot is the default team view.
- Private live scenarios are built from generated daily history and do not mutate shared state.
- Custom events are session-local only and never write back to shared artifacts.

## Local Development

### 1. Install dependencies

```bash
pip install -r requirements.txt
pip install -r scripts/requirements.txt
```

### 2. Configure secrets for data refresh

Create `.env.local` from `.env.example` if you need to run the historical refresh pipeline locally:

```bash
FRED_API_KEY=your_real_key_here
```

### 3. Generate or refresh data locally

```bash
python scripts/pull_data.py
```

### 4. Run the Streamlit app

```bash
streamlit run app.py
```

## Validation

```bash
pytest -q
```

The copied repo includes:

- artifact loader checks
- engine parity checks
- Streamlit smoke tests

## Deployment

- GitHub Actions refreshes `public/data/*`
- `.github/workflows/streamlit-ci.yml` runs the Streamlit-side tests
- Streamlit Community Cloud should point at this copied repo/folder and launch `app.py`

## Documentation

- `docs/streamlit-migration.md`
- `docs/ARCHITECTURE.md`
- `docs/LIVE_STATE_MODEL.md`
- `docs/SCORING_PIPELINE.md`
