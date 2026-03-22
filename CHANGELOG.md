# Changelog

## 2026-03-22

### Release candidate hardening

- upgraded the app to Next.js 15 and React 19
- cleared the prior high-severity dependency advisory
- rebuilt the live engine around a no-lookahead Day 0 policy
- added shared live snapshot handling and provenance surfacing
- restored analogue scoring parity with the notebook on the live stack
- fixed reverse lookup, gate targets, trade-idea weekend behavior, and live-day scoring consistency
- added local-only custom event creation within historical coverage
- added live analysis-day override so users can score the event as if it were only at an earlier Day N
- fixed selected-event leakage into decay and other live/risk/tools surfaces
- made decay recompute automatically from current state
- added local event management for added browser-local events

### Documentation

- refreshed the main README for the current production architecture
- added architecture and operations docs

### Validation gates used for release

- `npm run build`
- `npm run test:snapshot-contract`
- `npm run test:live-parity`
- `npm run test:data-integrity`
- `npm run test:gate-regression`
