# Progress: foundations

Resume/survival file. If context is lost, this page alone should let work resume.

## Status

| Milestone | State |
|-----------|-------|
| M1 — Walking skeleton (Vite + Phaser + TS, core/render split) | done |
| M2 — Isometric grid + a unit that moves | done |
| M3 — Turn-based battle loop (CT clock + trigger bus) | testable |
| M4 — Data-driven jobs & skills + phase pipeline | todo |
| M5 — Signature non-combat jobs (chef / survivalist / merchant) | todo |
| M5b — Logistics pillar & Deployment gamble (D6/D7) | todo |
| M6 — Roguelike run loop (seeded, permadeath, meta) | todo |

States: `todo` → `in-progress` → `testable` → `done`
(`testable` = code complete, awaiting user-testable gate confirmation.)

## Current block

- **Milestone:** M3 — Turn-based battle loop. **Code complete → `testable`**:
  the CT clock + trigger bus and all seams are built, `npm test` is **40/40
  green**, `npm run build` typechecks + bundles, and `core/` is verified free of
  Phaser/DOM. Awaiting the **in-browser gate** (play a skirmish to victory/defeat
  on the clock) to flip M3 → `done`.
  - **What landed (M3):** new `core/` modules — `units.ts` (data-driven unit +
    stat block), `clock.ts` (CT clock: tick `ct += speed`, turn at `ct ≥ 100`,
    act>move spend-down, `seedInitiative` from per-side avg Speed (D11), a
    scheduled-effects queue with a `speed` gauge for charged/chained effects
    (D5/D16)), `events.ts` (typed trigger bus, D4), `entities.ts` (field-entity
    registry wired to the bus, D4), `combat.ts` (damage / defeat / win-lose),
    `status.ts` (apply/tick/expire + Immobilized + per-unit counters = the
    capture-meter shape, D12), `vision.ts` (per-side visible set + `canSee`,
    LoS stubbed, D18), `ai.ts` (move-toward-and-attack nearest, occupancy-aware
    A*), `turn.ts` (the `Battle` orchestrator the render layer drives). Render:
    `game/scenes/BattleScene.ts` — both sides drawn with HP, a CT-order panel, an
    **Advance Clock** control, move/attack animation, and a victory/defeat overlay.
  - **Tests:** `clock.test.ts` (CT order, act/move spend-down, initiative seed,
    scheduled effect resolves at the right CT + `chargeResolved`), `combat.test.ts`
    (damage/defeat/win-lose), `events.test.ts` (emit→subscribe, unsubscribe, fault
    isolation, the trivial trap entity reacts to `onUnitEnterTile`), `status.test.ts`
    (apply/tick/expire + counter), `ai.test.ts` (legal move+attack toward nearest,
    immobilized, no-enemy), `turn.test.ts` (bus enter/leave per step, trap fires on
    move, and a full BattleScene-roster skirmish runs to a decisive end — no stalemate).
  - **Seam status:** statuses+meters (D12), scheduled/charged effects (D5/D16), and
    the vision layer (D18) are all present as thin hooks exercised by tests; full
    behaviour is M4–M6 as scoped. `forced` flag on `onUnitEnterTile` lays the D19
    forced-movement primitive (a pushed unit fires the tile's entity).
- **(prior) Milestone:** M2 is done — the in-browser click-to-move gate is confirmed.
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
  Survivalist salvage perk). Future-tagged: Snare adjacency-accelerator variant;
  per-unit morale lever; the "Intelligence" stat rename. **Next concrete build step
  is M3** (CT clock + trigger/event bus + field-entity registry), now well-specified
  by D4/D5/D11/D12/D16.
- **Session play-trace (COMPLETE):** walked a full game session (start → camp/upkeep
  → intel/provision → deploy → combat → result → overworld) to stress-test the spine.
  Verdict: across ~30 beats **nothing contradicted a decision**; the only change was
  an improvement (D11 → per-step auto-retreat). Strongest validations: **Vancian
  magic** makes spells a *logistics axis* (provision/expend/recover like ammo); a
  relic (**cast-iron pan, −2sp cooking upkeep**) proved D15's "gold-as-solvent" lets
  items plug into one Upkeep line; **push-into-traps** showed unit-driven combos
  (D16 spirit). **Surfaced batch to design next:**
  - *Declared (confirm & record):* ✅ **Vancian magic → D17** (scribed castings/day
    re-allocatable to pre-deploy + refresh on rest; scrolls as storage consumables;
    a free **default spell** floor; runes are Vancian via reagent cost + deploy peril;
    Vancian ⟂ charge-time; **consumables family** = ammo+scrolls+reagents, partial
    recovery on win). Still to record: **relics/special items**; **currency
    denominations** (gold + silver); **XP/leveling** exists.
  - *Open — combat-core (touch M3):* ✅ **fog-of-war/vision → D18** (symmetric;
    Hidden→Pinged→Seen ladder; sight=radius+LoS, Awareness ping=presence-no-identity
    ignoring LoS; ghosts; ambush from Hidden; Tier-3 intel grants starting vision;
    stealth-as-trait deferred; new `systems/vision.md`). ✅ **forced movement → D19**
    (push/pull, banded, involuntary, target-agnostic; forced entry onto an entity tile
    fires it; stop at blockers + optional collision damage; vision rules apply).
    ✅ **Ammo → D20** (basic arrows **infinite** = archer's default-spell twin; special
    arrows are limited consumables; every consumable carries a **recovery keyword**
    (N% on a win), Survivalist perk boosts it — refines D13/D17). **COMBAT-CORE BATCH
    COMPLETE.**
  - *Open — run frame:* **branching mission select** + the **overworld↔camp**
    relationship; **recruitment** of party members; **intel pre-selection scope**
    (reveals comp + rewards + recruits across options).
  - *Open — content patterns:* **enemy traits↔counters** (flying/Grounded, nets/
    runes); **class deploy abilities** (Rogue infiltration past the safe zone).
  - *Confirmed consistent:* freed units cold-join the CT clock; temporary statuses can
    be escaped/expire (allies free from snares, enemies self-free from nets); entity
    durability partial-loss; intel banding scales reveal depth.
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
