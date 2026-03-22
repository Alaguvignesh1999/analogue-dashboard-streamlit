# Notebook Parity Notes

## Source of Truth

The original notebook remains the reference for intended analytics behavior, but the web app intentionally diverges in a few places where the notebook had statistical or operational weaknesses.

Notebook source used during parity work:

- `ME_Dashboard_Clean_12.ipynb`

## Intentional Improvements Over Notebook

### No-lookahead live anchoring

The notebook used forward-looking anchoring in some live-pull cases.

The web app does not.

Current rule:

- requested Day 0 resolves to the latest observed market date on or before the selected date

This is the canonical production rule.

### Shared live scoring basis

The web app separates:

- display/live path extension
- scoring series
- effective scoring day
- analysis-day override

That keeps ranking logic, decay, gate, and trade ideas aligned.

### Active event filtering

The notebook decay flow scored the full event universe even when that felt inconsistent with selection behavior elsewhere.

The web app now treats active event selection as authoritative across historical and live tooling.

### Local custom events

The notebook allowed flexible event experimentation.

The web app keeps that capability, but safely:

- custom events are browser-local only
- they must stay within loaded historical coverage
- they never mutate canonical shared artifacts

## Regression Gates

The main parity checks are:

- `scripts/live_parity_check.py`
- `scripts/data_integrity_check.py`
- `scripts/gate_regression_check.py`
- `scripts/live_snapshot_check.py`
