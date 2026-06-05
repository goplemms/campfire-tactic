# Progress: foundations

Resume/survival file. If context is lost, this page alone should let work resume.

## Status

| Milestone | State |
|-----------|-------|
| M1 — Walking skeleton (Vite + Phaser + TS, core/render split) | done |
| M2 — Isometric grid + a unit that moves | done |
| M3 — Turn-based battle loop (CT clock + trigger bus) | todo |
| M4 — Data-driven jobs & skills + phase pipeline | todo |
| M5 — Signature non-combat jobs (chef / survivalist / merchant) | todo |
| M5b — Logistics pillar & Deployment gamble (D6/D7) | todo |
| M6 — Roguelike run loop (seeded, permadeath, meta) | todo |

States: `todo` → `in-progress` → `testable` → `done`
(`testable` = code complete, awaiting user-testable gate confirmation.)

## Current block

- **Milestone:** M3 — Turn-based battle loop (next up). M2 is done — the
  in-browser click-to-move gate is confirmed.
- **Design pass (2026-06-05):** captured the game's system vision in
  [`docs/design/`](../../docs/design/) (flow + 4 phase docs + 6 subsystem docs)
  and logged decisions **D4–D9**: field entities + trigger bus (D4), FFT CT clock +
  charged abilities (D5), two-tier logistics pillar (D6), the Deployment
  push-your-luck gamble (D7), **morale as passive tiered modifiers (D8)**, and
  **mortality/recovery/difficulty consequence policy (D9)**. Added milestone **M5b**
  for the logistics pillar (now also carrying camp morale + recovery). This reshapes
  M3's scope: it now builds the **CT clock** and a **trigger/event bus +
  field-entity registry** (before any entity exists), not a round-based loop.
- **Open-questions pass (in progress):** working through the design docs' open
  questions one by one. **Resolved Q1** (morale + mortality/recovery/difficulty →
  D8/D9) and **Q2** (intel: three lanes, banded tiers, new Intelligence stat, Seer
  job, banding convention → D10; new `systems/intel.md`), and **Q3** (Deployment
  exposure: two-stage spatial danger gradient, banded + shown on the board → D11),
  **Q4** (enemy-prep symmetry: A3 fortified encounters, Intel/Awareness
  detection, Act-cost disarm, and the Snare → unified in-combat capture → D12), and
  **Q5** (material recovery → D13), **Q6** (inventory: party-wide slotted stacks +
  "wide logistics, micro at the unit" → D14), and **Q8** (spoilage → **dropped** in
  favor of **Upkeep**: gold as the solvent for maintenance chores, with funded/
  underfunded Food + Repairs lines, gear-condition replacing equipment durability,
  and debt → morale → desertion → D15), and **Q9** (entity combos: no merging —
  **chain via the bus**, scheduling reactions onto the CT clock with a `speed`
  (instant→timer); provisional → D16). **The main open-questions list is now
  COMPLETE — decisions D1–D16 recorded; design spine done.** **Parked for a dedicated
  discussion: Ammo** (per-unit vs pool + the "empty ranged feels bad" balance; the
  wide-logistics principle leans it toward a shared pool; carries the conditional
  Survivalist salvage perk). Future-tagged: in-combat fog-of-war/vision; Snare
  adjacency-accelerator variant; per-unit morale lever; the "Intelligence" stat
  rename. **Next concrete build step is M3** (CT clock + trigger/event bus +
  field-entity registry), now well-specified by D4/D5/D11/D12/D16.
- **Last green sha:** M2 landed `core/grid.ts` (TileGrid: dimensions +
  per-tile walkability + 4-connected neighbours) and `core/pathfinding.ts`
  (A* over the grid, Manhattan heuristic, returns a `GridCoord[]` or `null`),
  plus `game/IsoScene.ts` rebuilt to draw an 8×8 iso grid with blocked walls,
  one unit, and click-to-move that animates along the A* path.
- **What landed:** `npm test` → 14/14 green (3 iso + 5 grid + 6 pathfinding,
  covering a straight path, routing around a blocked tile, no-path-exists, and
  start==goal); `npm run build` typechecks + bundles; `core/` verified free of
  Phaser/DOM imports.
- **Next step:** begin M3 per the design pass — the **FFT CT clock** (per-unit CT
  by Speed, turn at CT≥100, Move + Act, charged-ability scaffolding; D5), a
  **trigger/event bus + field-entity registry** built before any entity exists
  (D4), attack/damage, win/lose, an advance-clock control, and a basic enemy AI.
- **Note:** npm "latest" is now Phaser 4; we deliberately pinned Phaser 3 (`^3.90.0`)
  to honor decision D1. Revisit as a tracked pivot if we ever want Phaser 4.
- **Blockers:** none.

## Closeout

Filled in only when the feature is finished. `archive-feature.sh` REFUSES to
archive until this section is complete.

- **Graduated to:** <commit body | architecture doc | README | nothing (spike) | memento (workflow asset improved)>
- **Archived:** <no | yyyy-mm-dd>
