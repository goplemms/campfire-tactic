# Progress: foundations

Resume/survival file. If context is lost, this page alone should let work resume.

## Status

| Milestone | State |
|-----------|-------|
| M1 — Walking skeleton (Vite + Phaser + TS, core/render split) | done |
| M2 — Isometric grid + a unit that moves | todo |
| M3 — Turn-based battle loop | todo |
| M4 — Data-driven jobs & skills + phase pipeline | todo |
| M5 — Signature non-combat jobs (chef / survivalist / merchant) | todo |
| M6 — Roguelike run loop (seeded, permadeath, meta) | todo |

States: `todo` → `in-progress` → `testable` → `done`
(`testable` = code complete, awaiting user-testable gate confirmation.)

## Current block

- **Milestone:** M2 — Isometric grid + a unit that moves (not started).
- **Last green sha:** M1 merged to `main` as `e359e73` (merge of `f7412ee`);
  in-browser gate confirmed (iso tiles render). `npm test` 3/3 green.
- **Next step:** M2 — `core`: tile-grid model, iso/grid coordinate math (have
  the projection from M1), A* pathfinding (pure, unit-tested). `game`: draw the
  iso grid, place one unit, click-to-move along a valid path.
- **Workflow note:** this session can only push to its own branch, not `main`
  directly (branch-ownership gate). Land each milestone via branch → PR → merge.
- **Note:** npm "latest" is now Phaser 4; we deliberately pinned Phaser 3 (`^3.90.0`)
  to honor decision D1. Revisit as a tracked pivot if we ever want Phaser 4.
- **Blockers:** none.

## Closeout

Filled in only when the feature is finished. `archive-feature.sh` REFUSES to
archive until this section is complete.

- **Graduated to:** <commit body | architecture doc | README | nothing (spike) | memento (workflow asset improved)>
- **Archived:** <no | yyyy-mm-dd>
