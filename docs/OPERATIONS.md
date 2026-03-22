# Operations

## Secrets

Required secret:

- `FRED_API_KEY`

Set it in:

- GitHub Actions secrets for scheduled data refresh
- Vercel environment variables if runtime live routes need FRED access

Do not store real secrets in notebooks, committed files, or chat logs.

## Scheduled Data Refresh

Workflow:

- `.github/workflows/data-refresh.yml`

Behavior:

- installs Python dependencies
- runs `scripts/pull_data.py`
- verifies generated outputs
- commits refreshed `public/data/*`

Use manual dispatch when releasing:

```bash
gh workflow run "Data Refresh" --ref main
```

Then monitor:

```bash
gh run list --workflow "Data Refresh" --limit 5
gh run watch <run-id>
```

## Release Checklist

### Before merging to main

1. `npm run build`
2. `npm run test:snapshot-contract`
3. `npm run test:live-parity`
4. `npm run test:data-integrity`
5. `npm run test:gate-regression`
6. verify preview deployment

### Before production deploy

1. merge release branch to `main`
2. run the GitHub data refresh on `main`
3. pull the refreshed data commit locally
4. rerun validation commands
5. deploy production with Vercel CLI

## Production Deploy

```bash
vercel deploy --prod -y
```

After deploy, confirm:

- the production alias points to the new deployment
- `public/data/last_updated.json` reflects the intended historical bundle
- no test gate regressed locally before deploy

## Repo Hygiene

- keep production changes merged to `main`
- keep experimental work on `codex/*` branches until verified
- avoid committing `.next/`, notebooks with secrets, or tarballs
- keep generated artifacts limited to `public/data/*`

## Troubleshooting

### Historical data looks stale

Check:

- `public/data/last_updated.json`
- latest `Data Refresh` GitHub Actions run

### Live data disagrees with notebook

Check:

- requested Day 0 vs actual anchored Day 0
- analysis-day override state
- selected similarity assets
- active event set and analogue cutoff

### A user asks where a custom event went

Custom events are browser-local. They do not sync across machines, browsers, or users.
