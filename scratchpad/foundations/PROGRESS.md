# Progress: foundations

Resume/survival file. If context is lost, this page alone should let work resume.

## Status

| Milestone | State |
|-----------|-------|
| M1 — Walking skeleton (Vite + Phaser + TS, core/render split) | testable |
| M2 — Isometric grid + a unit that moves | todo |
| M3 — Turn-based battle loop | todo |
| M4 — Data-driven jobs & skills + phase pipeline | todo |
| M5 — Signature non-combat jobs (chef / survivalist / merchant) | todo |
| M6 — Roguelike run loop (seeded, permadeath, meta) | todo |

States: `todo` → `in-progress` → `testable` → `done`
(`testable` = code complete, awaiting user-testable gate confirmation.)

## Current block

- **Milestone:** M1 — Walking skeleton (code complete; awaiting in-browser gate
  confirmation).
- **Last green sha:** committed in this change (Vite + TS + Phaser 3 + Vitest,
  `core/` iso math with 3 passing tests, `game/` IsoScene draws a 6×6 grid).
- **What landed:** `npm test` → 3/3 green; `npm run build` typechecks + bundles;
  `npm run dev` serves the page; `core/` verified free of Phaser/DOM imports.
- **Next step:** confirm the user-testable gate in a browser (`npm run dev` shows
  the isometric tiles), then begin M2 — iso grid + a unit that moves
  (A* pathfinding in `core`, click-to-move in `game`).
- **Note:** npm "latest" is now Phaser 4; we deliberately pinned Phaser 3 (`^3.90.0`)
  to honor decision D1. Revisit as a tracked pivot if we ever want Phaser 4.
- **Blockers:** none.

## Closeout

Filled in only when the feature is finished. `archive-feature.sh` REFUSES to
archive until this section is complete.

- **Graduated to:** <commit body | architecture doc | README | nothing (spike) | memento (workflow asset improved)>
- **Archived:** <no | yyyy-mm-dd>
