# M8 Kickoff — The overworld action economy (camp at every node + cooldown spine + loose fatigue)

> A self-contained implementation brief. Paste/run this to build **M8**. It assumes the
> repo at the end of the post-M7 design pass (decisions **D1–D35**, design docs under
> `docs/design/`, all of M1–M7 shipped and green). Develop on the working branch, follow
> the **memento workflow** (a milestone isn't done until tests are green **and** the
> in-browser gate is met; update `scratchpad/foundations/PROGRESS.md` + the M8 row in
> `plan.md`).

## Where this sits

M7 shipped the overworld as a **frame**: a seeded branching node DAG, combat/rest nodes,
banded intel previews, run-complete/wipe terminals (`overworld.ts`, `run.ts`,
`runloop.ts`, `intel.ts`, `OverworldScene`). The design has since moved well ahead of the
build — **D25–D35** describe a guild tier, caravans, a gold economy, recruitment, and an
**overworld action economy**, none of which is built yet. M8 is the **first** of three
milestones that build that batch:

- **M8 (this brief)** — the overworld action economy (**D29/D35**): the *machinery*.
- **M9** — the guild & caravan tier (**D25–D27/D32**): `run.ts` → a `Guild` of N runs.
- **M10** — the gold economy & recruitment (**D28/D30/D33/D34**).

M8 deliberately needs **none** of M9/M10: it reshapes the *single* run that exists today.

## Sources of truth (read before building)

- Plan/gate: `scratchpad/foundations/plan.md` → **M8**.
- Decisions: `scratchpad/foundations/decisions.md` → **D29** (the overworld as a hook
  surface; the limiter menu), **D35** (camp at every node; cooldown spine; loose fatigue;
  the *cooldowns-encourage / pools-punish* principle), plus context **D3** (the phase
  pipeline whose Meta phase folds in), **D23** (node kinds / rest), **D22/D24** (the map +
  preview this builds on), **D7/D11/D8** (the shallow asymmetric-floor shape fatigue copies).
- Specs: `docs/design/systems/overworld.md` → **"The overworld action economy (D35)"** and
  **"The overworld as a hook surface (D29)"**; `docs/design/systems/stats.md` → **Fatigue**;
  `docs/design/systems/guild.md` → the **"Two clean camp tiers"** note (M8 builds the
  *overworld camp*; the guild hall is M9).

## Goal & user-testable gate

Turn the overworld from a *pick-the-next-node* screen into a **second hook surface**: every
node opens **one unified overworld camp** where you take **overworld actions** gated by a
**per-ability node-step cooldown** (the spine) and a **per-character fatigue** meter (a
loose over-extension guardrail), then **commit** onward. The old separate **Meta phase**
(D3) folds into this camp.

**Gate (must all hold):**
1. `npm run dev` → on a seeded run, **arriving at any node opens the unified camp**.
2. Fire an overworld action and watch it **grey out for N node-steps** (cooldown ticks as
   you advance) and **spend fatigue** on the acting character.
3. Push deep **skipping rest** until **fatigue bites** (the loose floor is crossed); take a
   **rest** node and watch fatigue **restore**.
4. **Commit** at a combat node → the existing Deployment → Battle → Resolution runs and
   returns to the map; a **rest** node recovers (and restores fatigue) with no fight.
5. Replaying the **same seed + same choices** reproduces the same map **and** the same
   action / cooldown / fatigue outcomes.
6. `npm test` green (cooldown-tick, fatigue-curve, unified-camp orchestration); `npm run
   build` clean; `core/` imports **no** Phaser/DOM **and** no `Math.random` (the grep test
   still passes).

## Architectural rules (non-negotiable)

- **Core/render split (D2):** all logic in `src/core/` (plain TS, headlessly testable,
  **no Phaser/DOM**). Phaser only in `src/game/`. Export new modules via `core/index.ts`.
- **Determinism (D22 contract):** cooldowns and fatigue are **deterministic run state** —
  no live RNG. Same seed + same choices ⇒ identical overworld-economy outcomes. The
  `no-Math.random-in-core` grep test must stay green.
- **Data-driven (D4/D3 ethos):** an overworld ability is **data declaring a phase + a
  cost**, resolved by an interpreter — *not* a hard-coded branch per ability. This mirrors
  how `skills.ts` already models combat/camp skills; reuse that shape rather than inventing
  a parallel one where you can.
- **Two economies stay separate (D29):** fatigue governs the **overworld** clock
  (node-steps) only. It must **never** touch the CT clock (`clock.ts`), initiative, or any
  combat stat. A tired character is **not** combat-penalized.

## In scope — build these

**Core (`src/core/`):**

1. **`fatigue.ts`** — the per-character **loose over-extension guardrail** (D35), pure.
   - A **generous allowance** model with a **shallow asymmetric floor** (copy the shape of
     `morale.ts`/`deployment.ts`: banded, invisible in normal play, bites only past a high
     threshold). Functions like `spendFatigue(level, cost)`, `restoreFatigue(level)` (the
     rest-node restore), and `fatiguePenalty(level)` returning the (small, overworld-only)
     **bite** once over-extended — e.g. raises subsequent action costs and/or locks the
     most-demanding actions. Keep the bite *gentle* (D8's "never kick a player when down").
   - **Where the value lives:** a per-character fatigue level. Recommended: a `fatigue`
     field on `Unit` (overworld-only, ignored by `clock.ts`/combat, like `awareness`/
     `intelligence` already ride along but matter only in their phase). Default to "rested."
   - **Restored at rest nodes** (rest's D35 second job); **never** read by combat code.

2. **`overworld-actions.ts`** — the **action-economy machinery** (D29/D35).
   - An `OverworldAbility` = **data**: `id`, display, the **effect**, and a **cost**:
     `{ cooldown: <node-steps>, fatigue?: <amount>, gold?: <amount> }` (vancian left as a
     future cost key — stub the type, don't wire magic). A small registry + `getAbility`,
     in the `jobs.ts`/`skills.ts` spirit.
   - A **resolver** `takeOverworldAction(run, unit, abilityId)` that: checks the ability is
     **off cooldown** and the unit has **fatigue headroom** (and gold if priced); applies
     the effect; **spends fatigue/gold**; **arms the cooldown**. Returns a result object
     (applied / why-refused) for the render.
   - **Cooldown state** is per-run, per-ability: add an `overworld` sub-state to `RunState`
     (e.g. `{ cooldowns: Record<string, number> }`). **The node-step is the tick** —
     decrement all cooldowns by 1 each time the caravan advances a node (do it in
     `recordNight`/the node-step path in `run.ts`, so combat *and* rest nodes both tick it).
   - **≥2 real abilities** to prove the spine, reusing existing systems:
     - **Scout** — raises a chosen *reachable* node's `previewNode` tier (lean on
       `intel.ts`'s `scout`/`previewNode`/`extraTier`). Cost: a node-step cooldown + fatigue.
     - **Market** — the Merchant's **access** verb reframed as an overworld action (the
       existing camp Merchant effect: gold/provision under the storage cap). Cost: cooldown
       + fatigue. (Full two-pool economy / Banker / Noble are **M10** — keep this to the
       single existing gold + the existing `applyCampSkill` Merchant effect.)

3. **`run.ts` / `runloop.ts` reshape — the unified overworld camp (D35).**
   - Fold the **Meta phase** into the camp shown at **every** node. Today `RunLoop.camp()`
     runs only before a combat node and `restNode()` handles rest; M8 makes **arriving at a
     node** open the camp surface (overworld actions) regardless of kind, then **commit**:
     - **combat node** → the camp actions are "what you do before the fight," then commit
       hands off to the existing `startEncounter()`/`beginBattle()` → Deployment → Battle →
       Resolution (unchanged downstream).
     - **rest node** → themed recovery (existing `restNode()`) **+ fatigue restore**.
   - Keep `reachable()`/`choose()` as the branch step; the camp now lives **between** choose
     and play. Preserve the determinism contract and all existing resolution wiring.

**Render (`src/game/`):** extend `OverworldScene`.
- A **camp panel** shown at every node: **overworld-action buttons** with live **cooldown**
  (e.g. "Scout — ready" / "Scout — 2 nodes") and **fatigue-cost** readouts; disabled when
  on cooldown or out of fatigue, with the refusal reason.
- A **per-character fatigue meter** (banded readout, à la the morale/exposure displays).
- The **commit** control: combat node → hand to `BattleScene` as today; rest node → the
  recovery screen, now also showing fatigue restored.
- **Remove the separate Meta-phase screen** — its actions now live in the node camp.

## Seams to honor now (thin — full behavior is later milestones)

Build the *hook*, exercise it minimally; do **not** build the full system:
- **Cost menu (D29):** the `cost` type carries `cooldown` + `fatigue` + `gold` now and a
  **`vancian?`** key as a *typed stub* (no magic wiring) so M10/magic can fill it without a
  reshape.
- **Two camp tiers (D35):** M8 builds only the **overworld camp**. Leave a clear note (no
  code) that the **guild hall** is the second tier (M9). Don't build a guild hall.
- **Economy verbs (D30/D34):** Market uses the **single existing gold pool** and the
  existing Merchant camp effect. Do **not** build the treasury/purse split, Banker, Noble,
  Influence, or theft — those are **M10**.

## Out of scope — do NOT build in M8

The guild tier / `Guild`-of-N-runs / caravans (M9); the two-pool economy, purse, Banker,
Noble, Influence, theft vector (M10); recruitment / three-tier roster (M9/M10); magic as an
overworld cost (stub only); any combat-side effect of fatigue. Keep M8 to *the unified
overworld camp + a working cooldown spine + a loose fatigue guardrail, proven by ≥2 real
abilities*.

## Tests (Vitest, headless core)

- `fatigue.test.ts` — the asymmetric floor: normal play **never** bites; sustained
  over-extension (repeated spends, no rest) **does**; a rest **restores**; the bite is
  bounded/gentle; fatigue is **untouched by combat** (a battle leaves it unchanged).
- `overworld-actions.test.ts` — an ability **refuses** on cooldown / out of fatigue;
  applying **arms the cooldown** and **spends fatigue/gold**; **cooldowns tick per
  node-step** (advancing a node decrements them; reaching 0 re-enables); Scout raises a
  reachable node's preview tier; Market moves gold/provision under the cap.
- `runloop.test.ts` (extend) — the **unified camp** opens at both a combat and a rest node;
  committing a combat node still runs the full encounter; a rest node restores fatigue;
  `autoTraverse` still walks a whole map to a terminal with the economy ticking.
- `run.test.ts` (extend) — `overworld` cooldown state round-trips through `snapshotRun`;
  **same seed + same choices ⇒ identical** cooldown/fatigue trace (the determinism gate).

## Suggested build order

1. `fatigue.ts` (+ tests) — the pure curve provable headlessly first.
2. `overworld-actions.ts` (+ tests) — the ability model, cost-gating resolver, and the
   node-step cooldown tick; wire Scout + Market against existing `intel.ts`/camp Merchant.
3. `run.ts`/`runloop.ts` reshape (+ extend `runloop`/`run` tests) — fold Meta into the
   per-node camp; tick cooldowns on the node-step; restore fatigue at rest.
4. Render: `OverworldScene` camp panel (action buttons + cooldown/fatigue readouts),
   fatigue meter, commit flow; delete the separate Meta screen.
5. Verify the gate in-browser; update `PROGRESS.md` (M8 → testable → done) and the M8 row
   in `plan.md`; commit/push.

## Done criteria

`npm test` green (incl. the tests above) · `npm run build` clean · `core/` free of
Phaser/DOM **and** `Math.random` · the in-browser gate holds: every node opens the unified
camp, overworld actions are gated by node-step cooldowns + per-character fatigue, rest
restores fatigue, committing a combat node runs the encounter and returns, and replaying a
seed reproduces the same economy outcomes.
