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
| M5b — Logistics pillar & Deployment gamble (D6/D7) | done (gate; D9-RP/D10-intel deferred) |
| M6 — Roguelike run loop (seeded, permadeath, meta) | done (in-browser gate confirmed 2026-06-05) |
| M7 — The overworld (seeded branching run map) | testable (147 tests green, build clean; awaiting in-browser gate) |

States: `todo` → `in-progress` → `testable` → `done`
(`testable` = code complete, awaiting user-testable gate confirmation.)

## Current block

- **Milestone:** M7 — The overworld (seeded branching run map). **TESTABLE**
  (2026-06-05): `npm test` **147/147 green**, `npm run build` clean, `core/` free of
  Phaser/DOM **and** `Math.random` (grep test still enforces it), and the dev server
  boots + transforms every module without error. **Awaiting the in-browser gate
  confirmation** (start a seeded run → pick reachable nodes with intel previews →
  play a combat node to resolution → return to map → take a rest node → reach a
  final node *or* die → re-enter the seed to reproduce the map). **Why:** through M6
  a run was a *linear* chain (`encounterIndex` + `streamFor(seed,"enc:N")`); M7 wraps
  it in a **seeded branching map** the player navigates — choosing the next mission,
  informed by intel — keeping permadeath, determinism, and the core/render split
  intact. Recruitment / shops / event nodes are a **later** batch (out of scope).
  - **What landed (M7 core, all pure/headless):**
    - `overworld.ts` — pure, **seed-driven** map generation (`streamFor(seed,
      "map")`): an `OverworldMap` of `MapNode`s (`id`, `layer`, `index`, `kind:
      "combat" | "rest"`, forward `edges`) shaped per **D22** (`MAP_GEN`: 7 layers,
      single start (layer 0, rest) + single final, interior width 2–3, banded rest
      chance, bounded fan-out). Guarantees the **connectivity invariants** (every
      non-final node has ≥1 outgoing, every non-start ≥1 incoming ⇒ every node
      reachable from the start, no dead ends). Helpers: `getNode`, `reachableFrom`,
      `isFinalNode`, and `nodeEncounter(seed, node)` =
      `generateEncounter(streamFor(seed,"node:<id>"), node.layer)` — **layer is the
      difficulty index**, reusing `generation.ts` unchanged.
    - `run.ts` (reframed) — dropped the linear `encounterIndex` for **map position**:
      `map` (the seed-built `OverworldMap`), `mapNodeId` (current), `path` (route),
      and a new `complete` terminal. Added `currentNode`, `isFinalRunNode`,
      `reachableNodes`, `chooseNode` (validates a forward choice), `isRunComplete`,
      and `recordNight` (replaces `advanceRun`: pushes a node-tagged
      `EncounterRecord`, ticks the night, flags **complete** on clearing the final
      node). `currentEncounter` now resolves from the current node. Permadeath / RNG
      / camp / inventory unchanged. `snapshotRun` now captures `mapNodeId` + `path`.
    - `runloop.ts` (extended) — `resolve()` records via `recordNight` + the complete
      check; added `reachable`/`choose` (overworld step), `restNode()` (a **no-battle**
      recovery night: Upkeep + nightly RP + a **chunk-denominated** rest bonus +
      **auto-triage** of the wounded + a morale uptick + dying-clock tick, D8/D9/D23),
      `playCurrentNode()` (combat *or* rest), `autoTraverse()` (**pick-first-reachable**
      to a terminal), and `isComplete`/`isTerminal`. `REST` is the tuning data.
    - `intel.ts` (extended, **D24**) — `previewNode(run, nodeId, extraTier?)` →
      `NodePreview`: node **kind** always shown, combat **encounter type** always
      shown, then the party's `intelFloor` reveals types→count→positions (banded as
      `readEncounter`) plus a banded `rewardHint` (`rewardBand`: hidden → band →
      `~Ng` → exact). A pure projection — **stable for a seed**.
  - **Render (`game/`):** split into two scenes. **`OverworldScene`** (boots first)
    owns the run + `RunLoop`, draws the **layered node DAG** (layers L→R, forward
    edges, kind glyphs ⚔/❄/★), highlights **reachable** nodes, shows each candidate's
    `previewNode` on hover, and commits a choice: a **combat** node hands off to
    **`BattleScene`** (now receives the run+loop via `init`, plays **one** chosen
    node's Camp → Deployment → Battle → Resolution, then **returns to the overworld**),
    a **rest** node recovers in-place with a recovery screen. The overworld owns the
    terminals — the M6-style **run-end** (seed for replay) and a new **run-complete**
    screen — and the seed bar / New Run reset stay as in M6.
  - **Tests (new/extended):** `overworld.test.ts` (same-seed identical map; seeds
    diverge; per-node deterministic encounter; start/final single; **every node
    reachable**; `reachableFrom` forward-only; no dead ends; any node reaches the
    final layer; widths in band), `run.test.ts` (map position, `chooseNode`
    advance/reject, `currentEncounter` follows the node, **complete vs wipe**
    terminals, `autoTraverse` integration, **permadeath through the map**, mid-map
    wipe, **same-seed+same-choices replay**, snapshot/route), `runloop.test.ts`
    (**rest recovers with no battle**, never stages a fight, autoTraverse
    determinism + valid forward walk), `intel.test.ts` (`previewNode` banding by
    floor, bump above the floor, **stable for a seed**, reward bands).
  - **Determinism contract:** the map derives from `streamFor(seed, "map")`; every
    combat node's content from `streamFor(seed, "node:<id>")` with **layer as the
    difficulty index** — never off a live-mutated draw order — so replay is exact
    regardless of player choices. `generation.ts`, the camp/deploy/battle/resolution
    flow, mortality/upkeep/intel/morale all stay; M7 only adds the *frame*.
  - **Next:** confirm the in-browser gate, then PROGRESS M7 → done + the M7 row in
    plan.md (testable → done); (on go-ahead) open + merge the PR.

- **Milestone:** M6 — Roguelike run loop (seeded, permadeath, the full phase loop).
  **DONE (gate)** (2026-06-05): `npm test` **121/121 green**, `npm run build` clean,
  `core/` free of Phaser/DOM **and of `Math.random`** (a grep test enforces it), and
  the **in-browser gate is confirmed** — started a seeded run, played encounters
  through to a total-party loss / run-end screen, and the re-enterable seed
  reproduces the run. (A follow-up pinned the seed bar at the top of the page so
  it stays visible above the canvas.)
  - **What landed (M6 core, all pure/headless):**
    - `rng.ts` — deterministic **mulberry32** PRNG seeded from a string/number:
      `int`/`range`/`float`/`chance`/`pick`/`pickWeighted`/`shuffle`, `fork()`
      sub-streams, serialize/restore (`state`/`fromState`), and `streamFor(seed,
      label)` for reproducible labelled streams. **The one source of randomness in
      `core/`** — a grep test asserts no `Math.random`.
    - `generation.ts` — pure, **seed-driven** encounter generation: a `TileGrid`
      (8×6 + scattered blocked tiles), an **enemy roster** (data-driven
      `ENEMY_TEMPLATES`, count/stats ramp with index), encounter **type**
      (open-field/fortified, D12), and **rewards** (gold + `REWARD_TABLE` drops).
      Same seed+index ⇒ identical encounter.
    - `run.ts` — the **run state**: party roster, inventory, camp (gold/morale),
      RP pool, night counter, encounter index, difficulty id, threaded RNG,
      history; `combatRoster`/`activeRoster`, **permadeath** (`removeFromRoster`),
      `isRunOver` (wipe = no combat-capable units), `advanceRun`, `snapshotRun`,
      and deterministic `currentEncounter` (via `streamFor`).
    - `mortality.ts` — the **data-driven difficulty consequence policy** (D9), one
      per difficulty (Easy/Normal/Hard/Hardest): `resolveDowned` (full-heal /
      ½-redeploy / dying-timer / permadeath), the dying-clock (`tickDyingClocks`),
      and `resolveCaptured` → a rescue follow-up quest (window + reduced
      Deployment); `rpPerChunk` is the single recovery dial.
    - `upkeep.ts` — **Upkeep** (D15: one gold figure = Σ Food + Repairs; underfund
      a line → morale hit + worn gear) and **RP recovery** (D9: `rpPerNight` from
      data-driven role `restPoints`, `triageHeal` chunks at `RP_PER_CHUNK` →
      `CHUNK_FRACTION` max HP, `clericRevive` as a gold sink for a dying unit).
    - `intel.ts` — **banded intel** (D10): `intelFloor` from the new **Intelligence**
      stat, `scout`/`seerDivine` lanes, `readEncounter` revealing types→numbers→
      positions by tier, Tier-3 ⇒ `grantsVision` (the D18 bridge).
    - `morale.ts` — D8 **passive tiered modifiers** finally with teeth, wired into
      real systems: `safeDepth`/`placementCost` (deployment), the clock's
      `seedInitiative` bonus, gold-find — asymmetric (shallow Low floor, Speed knob
      smallest).
    - `runloop.ts` — the **orchestrator** the render drives: `camp()` (upkeep + RP
      + dying), `intel()`, `startEncounter()` (generate + build battle + place the
      combat roster on the home edge, with the rescue deployment penalty),
      `beginBattle()` (Chef heal + morale-warmed seed), `resolve()` (rewards +
      recovery D13 + auto-rescue D21 + mortality D9 + permadeath + advance; a lost
      battle ends the run), and `autoBattle()` for headless fast-forward.
  - **Render (`game/`):** `BattleScene` is now a **run driver** — reads a
    re-enterable **seed** field (index.html run-bar), walks Camp (Upkeep result +
    intel read + provision/cook/trade/triage) → on-board Deployment (morale-modified
    safe depth) → Battle → Resolution (rewards/recovery/mortality overlay) →
    **Next Encounter**, rebuilding the board from each generated encounter, until a
    wipe shows a **run-end screen with the seed** for replay. Camp-only Chef/Merchant
    (job `noncombat`) act in Meta without taking the field.
  - **Tests (new):** `rng.test.ts` (same-seed sequences, fork independence,
    serialize→restore, **no-Math.random grep**), `generation.test.ts` (same
    seed+index identical; divergence; ramp), `mortality.test.ts` (each difficulty's
    downed/captured resolution + dying clock), `upkeep.test.ts` (Upkeep total /
    underfund→morale / RP triage / cleric), `intel.test.ts` (three lanes, banded
    reveals, Tier-3 vision), `run.test.ts` (state/permadeath, **full loop to a
    wipe**, **replay reproduces the sequence**, Hardest permadeath through resolve).
  - **Next:** confirm the in-browser gate, then PROGRESS M6 → done + the M6 row in
    plan.md; commit/push; (on go-ahead) open + merge the PR.

- **(prior) Milestone:** M5b — Logistics pillar & the Deployment gamble. **DONE (gate)**
  (2026-06-05): `npm test` **74/74 green**, `npm run build` clean, `core/` free of
  Phaser/DOM, and the **in-browser gate is confirmed** — provisioned under a storage
  cap → walked a unit out in on-board Deployment and over-ranged into capture →
  brought her home (manual rescue and/or auto-rescue on victory) → recovered unsprung
  traps in Resolution. The D9-RP-recovery and D10-intel extras remain **deferred**
  (see plan.md). **Next up: M6** (seeded run loop) — pull the deferred D8-morale
  effects / D9-RP / D10-intel in alongside it.
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
