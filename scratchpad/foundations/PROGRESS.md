# Progress: foundations

Resume/survival file. If context is lost, this page alone should let work resume.

## Status

| Milestone | State |
|-----------|-------|
| M1 — Walking skeleton (Vite + Phaser + TS, core/render split) | done |
| M2 — Isometric grid + a unit that moves | done |
| M3 — Turn-based battle loop | todo |
| M4 — Data-driven jobs & skills + phase pipeline | todo |
| M5 — Signature non-combat jobs (chef / survivalist / merchant) | todo |
| M6 — Roguelike run loop (seeded, permadeath, meta) | todo |

States: `todo` → `in-progress` → `testable` → `done`
(`testable` = code complete, awaiting user-testable gate confirmation.)

## Current block

- **Milestone:** M3 — Turn-based battle loop (next up). M2 is done — the
  in-browser click-to-move gate is confirmed.
- **Last green sha:** M2 landed `core/grid.ts` (TileGrid: dimensions +
  per-tile walkability + 4-connected neighbours) and `core/pathfinding.ts`
  (A* over the grid, Manhattan heuristic, returns a `GridCoord[]` or `null`),
  plus `game/IsoScene.ts` rebuilt to draw an 8×8 iso grid with blocked walls,
  one unit, and click-to-move that animates along the A* path.
- **What landed:** `npm test` → 14/14 green (3 iso + 5 grid + 6 pathfinding,
  covering a straight path, routing around a blocked tile, no-path-exists, and
  start==goal); `npm run build` typechecks + bundles; `core/` verified free of
  Phaser/DOM imports.
- **Next step:** confirm the M2 user-testable gate in a browser (`npm run dev`:
  click a tile, the unit walks there routing around walls), then begin M3 —
  turn/initiative order, action economy (move + act), attack/damage, win/lose,
  an End Turn button, and a basic enemy AI.
- **Note:** npm "latest" is now Phaser 4; we deliberately pinned Phaser 3 (`^3.90.0`)
  to honor decision D1. Revisit as a tracked pivot if we ever want Phaser 4.
- **Blockers:** none.

## Closeout

Filled in only when the feature is finished. `archive-feature.sh` REFUSES to
archive until this section is complete.

- **Graduated to:** <commit body | architecture doc | README | nothing (spike) | memento (workflow asset improved)>
- **Archived:** <no | yyyy-mm-dd>
