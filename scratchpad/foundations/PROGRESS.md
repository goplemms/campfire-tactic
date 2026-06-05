# Progress: foundations

Resume/survival file. If context is lost, this page alone should let work resume.

## Status

| Milestone | State |
|-----------|-------|
| M1 — Walking skeleton (Vite + Phaser + TS, core/render split) | done |
| M2 — Isometric grid + a unit that moves | done |
| M3 — Turn-based battle loop (CT clock + trigger bus) | done |
| M4 — Data-driven jobs & skills + phase pipeline | done |
| M5 — Signature non-combat jobs (chef / survivalist / merchant) | done |
| M5b — Logistics pillar & Deployment gamble (D6/D7) | testable |
| M6 — Roguelike run loop (seeded, permadeath, meta) | todo |

States: `todo` → `in-progress` → `testable` → `done`
(`testable` = code complete, awaiting user-testable gate confirmation.)

## Current block

- **Milestone:** M5b — Logistics pillar & the Deployment gamble. **Code complete →
  `testable`** (same branch): `npm test` **73/73 green**, `npm run build` clean,
  `core/` free of Phaser/DOM. Awaiting the **in-browser gate**: provision a loadout
  under a storage cap → over-prep a unit into overdraw until captured → rescue her
  mid-battle → recover an unsprung trap in Resolution.
  - **What landed (M5b):** new `core/` modules — `inventory.ts` (party-wide slotted
    stacks: `MaterialDef` with `slotCost`/`stackSize`/`recoverable`, a `MATERIALS`
    registry, storage-cap-enforced add/remove = the **provisioning constraint**, D6/D14);
    `deployment.ts` (the **push-your-luck exposure gamble**, D7/D11: Awareness-banded
    `safeAllowance`, overdraw exposure meter, deterministic capture at the threshold;
    plus `captureUnit`/`freeCaptive`/`isCaptured`); `resolution.ts` (`recoverMaterials`
    — outcome-gated whole-field recovery of unsprung+recoverable entities incl. enemy
    salvage, D13). `units.ts` gained `awareness` + a `captured` flag; `clock.ts` now
    **excludes captured units** from the seed (switched avg→**sum** so losing a unit
    *lowers* the seed, D11), ticking, and turns; `ai.ts` ignores bound units;
    `combat.ts` `battleOutcome` treats captured as non-active; `entities.ts` `makeTrap`
    now carries recovery state (`sprung`/`recoverable`/`materialId`). Render:
    `BattleScene` extends the mini-loop — **Camp** loadout (Load Trap Kit under the
    cap, Merchant raises the cap), **Deployment** with a live **exposure meter** +
    capture (token binds purple, repositions to the enemy zone), **Battle** rescue
    (move adjacent + free), and a **Resolution** overlay listing recovered materials.
  - **Tests:** `inventory.test.ts` (slots/cap/provisioning), `deployment.test.ts`
    (safe allowance, overdraw→capture, seed excludes captured + freed-unit rejoins),
    `resolution.test.ts` (win recovers unsprung incl. salvage; loss/consumed → none),
    `combat.test.ts` (+captured = non-active defender), seed-sum updates in `clock.test.ts`.
  - **Playtest adjustments (2026-06-05, → D21):** (1) **Deployment now plays on the
    board** — select a unit, **walk it out (A*) like combat**, and place traps where
    it stands; exposure became **spatial** (a banded safe **depth** from your edge,
    shown as a green zone tint; placing deeper raises the meter), replacing the
    abstract placement counter. (2) **A win auto-rescues captured allies** (control
    the field → your bound people come home); the rescue follow-up quest now applies
    only to non-win/abandon. Recorded as **D21** (refines D7/D9); 04-resolution.md
    updated. 74/74 tests green.
  - **Scoped for this pass:** the milestone's "also lands" extras — full **D9
    Rest-Point recovery / cleric revive** and the **D10 intel system** — are
    **deferred** to keep M5b on its user-testable gate; **D8 morale** is present as
    the passive tiered value/`moraleTier` (no battle modifiers yet). Flagged for a
    follow-up before/with M6.
  - **What landed (M5):** new `core/` modules — `camp.ts` (Meta state: gold,
    storageCap, morale + `moraleTier` banding (D8), a banked `pendingHeal`;
    `applyCampSkill` for Merchant `economy` / Chef `morale` effects;
    `applyCampToParty` lands the Chef heal at battle start). `skills.ts` grew
    non-combat effect kinds (`economy` / `morale` / `placeTrap`) and targets
    (`camp` / `party`); `entities.ts` gained `makeTrap` — the **first real field
    entity (D4)**: a one-shot `onUnitEnterTile` listener that damages an enemy and
    is spent (ignores its owner; forced entry fires it too, D19). `combat.ts`
    factored out `applyDamage` (sourceless damage for traps). `jobs.ts` added the
    three signature jobs — **Survivalist** (deployment: Set Trap), **Chef** (meta:
    Cook Stew → morale + party heal), **Merchant** (meta: Trade → gold + storage)
    — each hooking a *different* phase, proving the D3 seam. Render: `BattleScene`
    is now a **phase-driven mini-loop** (Camp → Deployment → Battle) on the
    `PhasePipeline`, with camp job buttons, click-to-place trap markers (that flash
    when sprung), and the Chef heal applied + animated at battle start.
  - **Tests:** `camp.test.ts` (Merchant economy, Chef morale+bank, `applyCampToParty`
    heals/caps/clears + `unitHealed`, morale bands), `events.test.ts` (+`makeTrap`
    springs once on an enemy / ignores owner), `jobs.test.ts` (+three jobs register
    under meta/deployment/battle). Each job's effect has a green test.
  - **Note (M4 DONE):** the M4 skill-button gate was confirmed in-browser; a follow-up
    fixed the skill-UI layout (hint line moved above the button band + hover-to-read
    descriptions).
  - **What landed (M4):** new `core/` modules — `skills.ts` (skills as data: a
    `SkillDef` declares its `phase`/`target`/`range`/`spend` + a **declarative
    `SkillEffect`** union — `damage` / `status` / `heal` — interpreted by
    `resolveSkill`, plus `isValidSkillTarget`), `phases.ts` (the **D3 pipeline**:
    `PHASES` Meta→Deployment→Battle→Resolution, a `PhasePipeline` cursor, and a
    `PhaseSkillRegistry` that buckets each unit's skills under the phase they
    hook), `jobs.ts` (the **data file**: the `Soldier` job with three Battle-phase
    skills — Power Strike / Hamstring / Second Wind — a `JOBS` registry, `getJob`,
    `unitSkills(unit, phase?)`, and `registerParty`). `Unit` gained an optional
    `jobId` link; `combat.resolveAttack` gained an optional attack-power override
    (for Power Strike); a `unitHealed` bus event was added. `turn.ts` gained
    `Battle.useSkill(caster, skill, target)` — the single entry the render layer
    drives. Render: `BattleScene` now reads `unitSkills(actor, "battle")` and draws
    a **skill button per skill**; self-skills resolve immediately, targeted skills
    arm-then-click-a-target, with damage/heal/status feedback and HP refresh.
  - **Why it's a clean seam:** Hamstring's Immobilized reuses the M3 status layer
    and the AI's `isImmobilized` check (a *visible* battle effect with zero new
    combat branches); the phase registry is the hook the Chef (Meta) / Survivalist
    (Deployment) plug into unchanged in M5.
  - **Tests:** `skills.test.ts` (damage > basic, heal caps at maxHp + `unitHealed`,
    status applies, target validity by side/range/self), `jobs.test.ts` (load
    Soldier by id, skills are data hooking Battle, `unitSkills` by phase, jobless →
    [], `registerParty` buckets 2×3 into Battle), `phases.test.ts` (phase order,
    pipeline advance/clamp/reset, registry buckets by phase), and a `turn.test.ts`
    case (`Battle.useSkill` resolves Power Strike and spends Act CT).
- **(prior) M5 — Signature non-combat jobs. DONE** (2026-06-05): Chef/Survivalist/
  Merchant each hook a different phase; in-browser the cooking buff healed the party
  and a placed trap sprang. Also added `docs/guides/adding-abilities.md`.
- **(prior) M4 — Data-driven jobs & skills + phase pipeline. DONE** (2026-06-05):
  skills as declarative data, the D3 phase pipeline, the Soldier's Battle-phase
  skills surfaced as working in-browser buttons.
- **(prior) M3 — Turn-based battle loop. DONE** (2026-06-05): CT clock + trigger
  bus + all seams; in-browser skirmish reaches Victory on the clock.
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
