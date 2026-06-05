# M3 Kickoff — Turn-based battle loop (CT clock + trigger bus)

> A self-contained implementation brief. Paste/run this to build **M3**. It assumes
> the repo at the end of the design pass (decisions **D1–D20**, design docs under
> `docs/design/`). Develop on the working branch, follow the **memento workflow**
> (a milestone isn't done until tests are green **and** the in-browser gate is met;
> update `scratchpad/foundations/PROGRESS.md` + the M3 row in `plan.md`).

## Sources of truth (read before building)

- Plan/gate: `scratchpad/foundations/plan.md` → **M3**.
- Decisions: `scratchpad/foundations/decisions.md` → **D2** (core/render split),
  **D4** (trigger bus + field-entity registry), **D5** (CT clock + charged
  abilities), **D11** (initiative seed), **D12** (statuses + per-unit capture meter),
  **D16** (CT-scheduled chains), **D18** (vision), **D19** (forced movement).
- Specs: `docs/design/03-combat.md`, `docs/design/systems/action-economy.md`,
  `docs/design/systems/field-entities.md`, `docs/design/systems/vision.md`.

## Goal & user-testable gate

Build a **playable tiny skirmish** between two sides on the existing iso grid, run on
a continuous **CT clock**, ending in victory or defeat — and lay the **load-bearing
architectural seams** (event bus, entity registry, status/meter, scheduled effects,
a vision seam) that later milestones plug into.

**Gate (must all hold):**
1. `npm run dev` → in the browser, play a small skirmish to **victory or defeat**:
   units act in CT order, move (A*) and attack, HP drops, a side is eliminated.
2. An **advance-clock / End Turn** control drives the clock; a **basic enemy AI**
   takes its turn.
3. `npm test` green, including **CT-order**, **damage/defeat**, **win/lose**, and
   **bus emit→listener** tests.
4. `npm run build` typechecks + bundles; `core/` imports **no** Phaser/DOM.

## Architectural rules (non-negotiable)

- **Core/render split (D2):** all logic in `src/core/` (plain TS, headlessly
  testable, **no Phaser/DOM**). Phaser only in `src/game/`.
- **Tech:** TypeScript + Phaser 3 (pinned `^3.90`) + Vite + Vitest. Reuse existing
  `core/grid.ts` (`TileGrid`: `inBounds`/`isWalkable`/`walkableNeighbors`),
  `core/pathfinding.ts` (`findPath`), `core/iso.ts` (`gridToScreen`/`screenToGrid`,
  `GridCoord`). Export new modules via `core/index.ts`.
- **Data-driven (D4 ethos):** units/abilities described as data, not hard-coded
  subclasses.

## In scope — build these

**Core (`src/core/`):**
1. `units.ts` — `Unit` data: `id`, `side` (`player`/`enemy`), `pos: GridCoord`,
   and the **minimal combat stat block** — `speed`, `hp`/`maxHp`, `attack`,
   `defense`, `moveRange`, `sightRadius`. Units defined as data.
2. `clock.ts` — the **CT clock** (D5): each tick `ct += speed`; a unit acts at
   `ct ≥ 100`; spend-down after acting (act costs more than move). **Initiative seed**
   from a side's units' speed (D11 — a simple sum/avg is fine now). Include a
   **scheduled-effects queue**: schedule an effect to resolve at a future CT with a
   `speed` (the D5/D16 primitive for charged abilities/chains — build the primitive,
   exercise minimally).
3. `events.ts` — the **trigger/event bus** (D4): typed events
   `onTurnStart`/`onTurnEnd`, `onUnitEnterTile`/`onUnitLeaveTile`,
   `onUnitDamaged`/`onUnitDefeated`, `onChargeResolved`; `emit` + `subscribe`. Build
   it even though listeners are few — this is the seam that stops later content from
   being bolt-ons.
4. `entities.ts` — **field-entity registry** (D4): register/query non-unit tile
   entities that subscribe to the bus. **Minimal** in M3 (no real traps yet); prove
   the seam with one trivial test entity that reacts to `onUnitEnterTile`.
5. `combat.ts` — attack/damage resolution, HP, defeat (`onUnitDefeated`), and
   **win/lose** detection (a side eliminated).
6. `ai.ts` — **basic enemy AI**: on its turn, move toward (A*) and attack the nearest
   reachable enemy.
7. `turn.ts` (or a `Battle` orchestrator) — wires clock → next actor → (move + act) →
   bus events → win/lose. The single entry the render layer drives.

**Render (`src/game/`):** extend `IsoScene` (or a new `BattleScene`): draw both
sides' units, HP, the **next-up / CT order**, an **advance-clock / End Turn** button,
animate move (along A* path) and attack, and a **victory/defeat** overlay.

## Seams to honor now (thin — full behavior is later milestones)

Build the *hook*, exercise it minimally; do **not** build the full system:
- **Statuses + per-unit meters (D12):** a `status.ts` supporting applying a status to
  a unit, ticking it on `onTurnStart`, and expiry — plus a generic **per-unit counter**
  (the capture-meter shape). A sample `Immobilized` status as a test is enough.
- **Scheduled/charged effects (D5/D16):** the clock's scheduled-effects queue above —
  one charged "attack" test that resolves a few ticks later.
- **Vision seam (D18):** a `vision.ts` that computes a per-side visible set by
  **sight radius** (LoS may be simplified/stubbed in M3) and exposes a
  `canSee(side, tile)` the AI/targeting can consult. Full Hidden/Pinged/Seen/ghosts
  come later — M3 only lays the layer.

## Out of scope — do NOT build in M3

Real field entities (traps/nests/runes), Vancian magic/spells/scrolls, ammo &
consumables, full forced-movement (the `onUnitEnterTile` primitive is enough),
full vision rules (Pinged/ambush/ghosts), the Deployment phase & capture-from-deploy,
jobs/Upkeep/intel/morale, difficulty/recovery, the run loop. These are **M4–M6**.
Keep M3 to *a playable skirmish + clean seams*.

## Tests (Vitest, headless core)

- `clock.test.ts` — CT ordering by speed; act vs move spend-down; initiative seed;
  a scheduled effect resolves at the correct CT.
- `combat.test.ts` — damage application, defeat, win/lose detection.
- `events.test.ts` — `emit`→`subscribe`; `onUnitEnterTile` fires for a moved unit;
  the trivial registry entity reacts.
- `status.test.ts` — apply/tick/expire; a per-unit counter increments on turns.
- (light) `ai.test.ts` — AI returns a legal move+attack toward the nearest enemy.

## Suggested build order

1. `units.ts` + `clock.ts` (+ tests) → CT order provable headlessly.
2. `events.ts` + `combat.ts` (+ tests) → damage/defeat/win-lose via the bus.
3. `entities.ts` + `status.ts` + `vision.ts` seams (+ tests).
4. `ai.ts` + `turn.ts` orchestrator (+ tests).
5. Render: `BattleScene` with advance-clock, animations, HP, win/lose overlay.
6. Verify the gate in-browser; update `PROGRESS.md` (M3 → testable→done) and the
   M3 row in `plan.md`; commit/push.

## Done criteria

`npm test` green (incl. the tests above) · `npm run build` clean · `core/` free of
Phaser/DOM · the in-browser skirmish reaches victory/defeat on the CT clock with a
working advance-clock control and enemy AI.
