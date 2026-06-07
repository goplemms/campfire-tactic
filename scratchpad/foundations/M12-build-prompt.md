# M12 Build Kickoff — Combat depth, the class slice & the demo-quest proof

A self-contained brief to **begin implementing M12**. The design is **finalized** — do
not re-litigate it; build it. Read these first, in order:

1. [`M12-kickoff.md`](M12-kickoff.md) — the full design (every section is a spec).
2. [`decisions.md`](decisions.md) → **D36–D44** (the architectural calls) + their
   referenced predecessors (D5 CT/charge, D9 mortality, D18 vision, D19 forced movement).
3. [`plan.md`](plan.md) → the **M12** row (goal + the user-testable gate).
4. [`docs/guides/adding-abilities.md`](../../docs/guides/adding-abilities.md) — the
   existing data-driven ability pattern these kits extend.

Develop on branch `claude/testability-gaps-eval-YO0Kv`. Repo is at end-of-M11 (M1–M11
shipped & green; 269 tests).

## Goal

The first slice aimed at **fun**: four interlocking martial classes + the combat depth
they force into existence, **proven** by playing the authored demo quest *The Hollow
Mill* end to end. The gate is the **M12** row in `plan.md` — that is the definition of
done; build toward it.

## Architectural rules (non-negotiable)

- **Core/render split (D2):** all logic in `src/core/` (plain TS, headless, no Phaser/DOM);
  Phaser only in `src/game/`. Export new modules via `core/index.ts`.
- **Determinism (D22):** no live RNG in core — the `core/`-has-no-`Math.random` grep test
  must stay green. Use the seeded `rng.ts`.
- **Data, not branches (D4):** classes, skills, statuses, authored encounters are **records**.
- **Test-first discipline:** every core module ships with a `*.test.ts`; a phase isn't done
  until `npm test` + `npm run build` are green.
- **Tune via data:** every magnitude (flank +4, cooldown CTs, charge fills, growth weights,
  herb riders) is a named constant/table — balance is a later numbers pass, not a reshape.

## Build order (dependency-phased; each phase lands green)

> The demo quest is the *proof on top* — build the combat slice first, then author the
> content that exercises it. Render is interleaved per phase (core first, then its UI).

**Phase 1 — combat-depth substrate (core levers).** *(D36, D37, D41, ranged)*
- **Flanking** (D36): `computeDamage` gains the support/pincer bonus (helpers to count a
  target's adjacent allies/enemies); melee-only, symmetric, binary.
- **Statuses with teeth** (D41): add Slowed/Exposed/Hastened/Guarded + a `kind:
  "debuff"|"buff"` classifier to `status.ts`; read-hooks in `clock.ts` (`effectiveSpeed`
  for Slowed/Hastened) and `combat.computeDamage` (Exposed/Guarded). Immobilized exists.
- **Ability economy** (D37): extend `SkillDef` with a cost (charge / cooldown); wire
  charge via the clock's `ScheduledEffect`, cooldowns in CT, the maintained-stance channel
  shape, and caster-death fizzle. Basic attack stays the instant floor.
- **Ranged**: `attackRange` as a `Unit` stat (default 1); ranged attack resolution.
- *Tests:* flank tiers; each status changes a decision + cleanse; cooldown blocks reuse;
  a charge lands later; a channel ramps/breaks; ranged attack at range.

**Phase 2 — the four classes + Defend.** *(D40, D41, D19, combat↔logistics)*
- `jobs.ts`: **Heavy Knight / Hunter / Scout / Medic** as data (2 active + 1 passive each),
  each passive wired to its hook (tarpit aura applying Slowed; Deadeye damage-vs-debuffed;
  Flanker solo-flank; Triage missing-HP scaling). New primitives: **Shove** (D19 forced
  movement — push/stop-at-blockers/forced-entry fires entities), **directional Cleave**
  (fixed cast-time arc), **Mark Prey** (channel), **Mend** (charged).
- **Combat↔logistics bridge:** medical consumables (salve/stimulant/antidote) in
  `inventory.ts`/`MATERIALS`; the Medic's **Heal** consumes one with a rider by resource.
- **Universal Defend** action (instant Act → self-Guarded) + a reserved `standingOrder`
  field (auto-execute built later).
- *Tests:* each kit loads + its signature behavior; Shove displacement; Cleave pattern;
  Heal consumes + rider; Defend → Guarded.

**Phase 3 — job model + hybrid leveling.** *(D38, D39 — fixes gap #2)*
- `units.ts`: `primaryJob`, held-jobs, `jobLevels` map, `loadoutSlots`; baseline +
  accrued-stat computation. `isCombatant` stops reading `noncombat`.
- `leveling.ts`: character axis (HP + boon thresholds) + **per-job cumulative stat gains**
  (+1-all + job-weight via a **growth table keyed by stat**), ability scaling reads, the
  2nd-active unlock breakpoint, XP routing (character + primary full, secondaries trickle).
- *Tests:* a level-up grows stats *and* a stat read changes combat; the unlock gates the
  2nd active; generalist vs specialist diverge; secondaries trickle.

**Phase 4 — the scoring AI + enemy archetypes.** *(D42)*
- `ai.ts`: rewrite `planTurn` into a **scoring** model (enumerate reachable
  `(destination, action)` plans, score, pick). Must-haves: ranged, flank exploit+avoid,
  tarpit-cost pathing, target priority. Optional-IN: enemy ability use, charge-interrupt,
  **fog-respecting** (read `canSee` + an unseen-enemy advance/search fallback).
- `generation.ts`: the bandit archetypes the demo needs (thug · bowman[ranged] ·
  snare-trapper[Immobilize debuffer] · sapper · captain).
- *Tests:* a ranged enemy attacks without closing; AI flanks an isolated unit + avoids
  isolation; routes around a tarpit; targets the squishy; cleanses-worthy debuff applied;
  acts only on seen units.

**Phase 5 — authoring substrate + The Hollow Mill + graded failure.** *(D44, D43)*
- `AuthoredEncounter` (fixed map + enemy roster/placements + rewards) and `AuthoredQuest`
  (ordered beats + starting party + inventory) data types + a **demo runner** that walks
  the beats (reuses the camp→deploy→battle→resolution pipeline).
- **The Hollow Mill** content: the 5 beats exactly as specced (Provision → Skirmish →
  Rest/Level-up + deserter choice → Ambush at the chokepoint → Captain's Holdout with the
  **bridge-cut N-turn timer** as a scheduled-effect objective).
- **Graded failure** (D43): an `objective-failure` resolution distinct from win/wipe —
  survivable (downed per D9, party retreats).
- *Tests:* an authored encounter builds deterministically; the quest walks its beats; the
  bridge-cut timer fizzles on Sapper death; objective-failure ≠ wipe.

**Phase 6 — render + the in-browser gate.**
- `BattleScene`: kits as data-driven buttons with **charge/channel/cooldown readouts**;
  **status visual trackers** (icon/badge + tint + tooltip via a status→visual registry);
  Defend; the bridge-cut timer; the level-up/unlock surfacing.
- A **standalone demo-mode** entry point + the beat runner (bypasses guild/overworld).
- Confirm the **M12 user-testable gate** in-browser, then PROGRESS M12 → done + flip the
  plan.md row; (on go-ahead) open the PR.

## Done-When

`npm test` green (flanking, ability economy, statuses, leveling, scoring AI, authored
encounters); `npm run build` clean; `core/` free of Phaser/DOM **and** `Math.random`; and
the **M12 gate** (play *The Hollow Mill* end to end, including a survivable objective
failure) confirmed in-browser. Graduate the **status authoring pattern** into
`docs/guides/adding-statuses.md` as part of Phase 1/2.
