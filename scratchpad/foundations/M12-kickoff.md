# M12 Kickoff (WORKING DRAFT) — Combat depth & the class slice

> **Status: in discussion.** This is a living working document for the current
> session. We are settling design points **one at a time**; each locked decision
> moves from *Open discussion queue* → *Locked decisions* with a date. When the
> queue is empty this graduates into a final kickoff brief + a `plan.md` row +
> `decisions.md` entries, matching the M3/M8/M9 kickoff convention.

Develop on branch `claude/testability-gaps-eval-YO0Kv`. Assumes the repo at the
end of M11 (D1–D35, all of M1–M11 shipped & green, 269 tests).

## Why this milestone (the "baseline fun" evaluation)

Through M11 the project is **systems-wide, content-thin**. The hard machinery
(CT clock, trigger bus, overworld DAG, guild/caravan tier, three-pool economy,
theft, recruitment, events, intel/vision/morale/mortality/fatigue) is built. What
is missing is the stuff that makes a tactics game *fun to play*: distinct classes,
growth payoff, and combat depth that rewards positioning. M12 is the first slice
aimed squarely at **fun**, using a small class roster as the vehicle that forces
the surrounding combat depth into existence.

## Gaps found in the evaluation

Grounded in the code (`combat.ts`, `clock.ts`, `ai.ts`, `jobs.ts`, `skills.ts`,
`leveling.ts`):

- **#1 — One combat class.** `jobs.ts` has only the Soldier as a fighting kit; the
  whole starting party is reskinned Soldiers with the same 3 skills.
- **#2 — Leveling has no payoff.** `grantXp` bumps `unit.level`/`xp`, but nothing in
  combat/clock/skills reads `level`. You gain levels and never get stronger.
- **#3 — Magic designed, unbuilt.** `systems/magic.md`/D17 describe Vancian as a
  pillar; `SkillEffect` has no spell kind. **DEFERRED** (own later milestone).
- **B — Flat damage, no positioning.** `computeDamage` = `max(1, atk−def)`; no
  flank, no facing, no height. An "isometric" game where position barely matters.
- **C — No tanking primitive.** AI attacks *nearest*; no taunt / zone-of-control /
  guard. A tank cannot protect anyone in the open.
- **D — AI is melee-only "walk to nearest."** No range use, no skill use, no fog
  use (`ai.ts` never consults `canSee`). A player Archer would be broken-strong.
- **E — No combat ability economy.** Combat skills only cost the Act — no
  cooldown/charge/uses. Best-button spam (infinite Medic heal, Power Strike always
  beats a basic). The clock's `ScheduledEffect` (charged abilities) is the intended
  lever and sits **unused**.
- **F — Statuses are cosmetic.** Only Immobilized is honored by the AI. Taunt /
  Slow / Expose / Guard can be *applied* but nothing reads them.
- **G — Single-target only.** No AoE/line/cleave in the effect model.

## Scope decisions (locked)

- **Magic (#3): deferred** to its own later milestone — build Vancian as itself, not
  squeezed in. First slice is **martial-only**. *(2026-06-07)*
- **First-slice contents:** 4 combat classes (#1) + leveling payoff (#2) + combat
  depth **B + C + D + E**. *(2026-06-07)*
- **G (AoE/multi-target): deferred** — all first-slice kits are single-target.
  *(2026-06-07)*
- **B height/elevation: deferred** — `TileGrid` has no elevation data; needs render
  work. Ship **flanking** as B's first half. *(2026-06-07)*

## Locked decisions

### Flanking (gap B, first half) — *2026-06-07*

> A **melee** attacker gets **+4 attack** (feeds `max(1, atk−def)`; the number is
> tunable) against target **T** when **≥2 of the attacker's side are adjacent to T**
> (the attacker + at least one other) **AND no unit on T's side is adjacent to T**.

- **Melee-only.** Ranged attacks never flank (ranged already has a DPS/safety edge;
  revisit only if ranged falls behind — it's one constant).
- **Symmetric.** Applies to both sides identically.
- **Binary.** One flank tier for now (a full-encirclement second tier is a possible
  later knob).
- **Adjacency = orthogonal** (4-connected, matches `isAdjacent`/movement).
- **Body-counting:** an **Immobilized** unit still counts as a body (it pincers /
  it shelters); a **captured or downed** unit does not (not an active threat).
- **Mental model:** *gang an isolated target with two blades; stay in formation and
  you're safe.*
- **Emergent consequence (intended):** clause 2 means a backline unit standing next
  to the Knight **cannot be flanked** — formation matters on its own, partly
  delivering C through positioning. The AI must learn both halves
  (split-and-gang / keep-formation); **flank-aware AI is folded into D.**

## Open discussion queue (one at a time)

- **C — taunt extent.** Given flanking already shelters formation, does the Knight
  still get an *active* Taunt (force aggro), or does positioning + AI target logic
  carry C entirely? (Decide with the Knight's kit.)
- **E — ability economy shape.** Cooldown (in CT/turns) vs charge (the clock's
  `ScheduledEffect` gauge) vs uses-per-battle — which levers, and which skills use
  which.
- **Class kits.** The concrete skill list per class (Knight / Archer / Scout /
  Medic), each exercising the depth levers.
- **Leveling payoff specifics (#2).** Stat-growth per class vs skill-unlock
  breakpoints vs both; the growth curve.
- **D — AI scope.** How far the AI upgrade goes (range use, skill use, flank
  exploit/avoid, fog use) for the first slice vs deferred.

## Draft class roster (NOT locked — refine in "Class kits")

| Class | Draft kit (single-target) | Exercises |
|---|---|---|
| **Knight** | Guard (def + taunt?, cd) · Power Strike (cd) · Shield Bash (dmg + Immobilize, cd) | C, E |
| **Archer** | Aimed Shot (ranged, charged) · Quick Shot (ranged, cd) · Pin (ranged, Slow) | D, E, F |
| **Scout** | Backstab (melee, leans on flanking) · Dash (reposition) · Expose (status) | B, F |
| **Medic** | Heal (cd) · Cleanse (strip status) · Stim (buff) | E, F |

## Architectural rules (non-negotiable, unchanged)

- Core/render split (D2): logic in `src/core/` (headless, no Phaser/DOM); export via
  `core/index.ts`. Phaser only in `src/game/`.
- Determinism (D22): no live RNG in core; no `Math.random` (grep test enforces).
- Data-driven (D4): classes/skills/statuses are data records, not branches.
- A milestone isn't done until tests are green AND the in-browser gate is met;
  update `PROGRESS.md` + the `plan.md` row.

## Decisions log

- **2026-06-07** — Opened M12 as the "baseline fun" combat-depth + class milestone.
  Magic deferred. First slice = 4 classes + leveling payoff + B/C/D/E. G + height
  deferred. Flanking fully specced (support/pincer, melee-only, symmetric, binary
  +4, immobilized-counts/captured-doesn't).
