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

### Combat ability economy (gap E) — *2026-06-07*

> **The combat economy is *time*.** No MP, no hoardable pools (D35: cooldowns over
> hoardable pools). Decisions are paid on the CT clock. **Two-lever model**, with
> **charge-time the star** (D5) and a **sparing cooldown** only as a spam-limiter on
> instant utility.

- **Three time-layers, two already built:**
  - **Act-vs-Move spend-down** — any ability use costs the Act (100 CT); a move-only
    turn costs 50. The universal tempo tax. *(built)*
  - **Charge-time (the spine, D5)** — commit on your turn, the effect **resolves N
    ticks later** via the clock's `ScheduledEffect` gauge; the caster is **committed**
    until it lands; Speed governs charge-landing. *(infra built, unused)*
  - **Cooldown** — a *sparing* per-skill re-arm (in CT) on **instant utility**
    (Heal/Cleanse/Guard) so it can't repeat every turn. Not the main cadence. *(new)*
- **Basic attack = the instant floor** (the martial analog of D17's free default
  spell): always available, weak, no charge/cooldown.
- **Instant-default, charged-for-power:** most abilities cast **instant**; **stronger
  variants are charged** (e.g. Quick Shot instant ↔ Aimed Shot charged). Data:
  either two records or one "chargeable" skill with an instant + a charged tier.
- **Charge duration is one data number — arbitrary N.** Tiny ⇒ near-instant; large ⇒
  a **multi-turn charge** for designed missions / special characters (a story-altering
  spell charged over many turns is *just a long charge*, no special-casing). Denominate
  precisely in CT/ticks; **display to the player as approximate turns.**
- **Fizzle/disruption is a data-driven condition set** on the scheduled effect, checked
  before it resolves — deliberately **left open/extensible**: caster-death,
  target-death, target-moved-out-of-range/area, **counter-spell** (an ability that
  targets an *in-flight* effect by its `id`). **Ship caster-death-cancels first;**
  reserve the rest behind the predicate shape.
- **Channeled abilities — the dual of charged.** Where a charge is a *delayed burst*,
  a channel is a *sustained effect that ticks each clock-tick over a duration while the
  caster is **locked/committed*** (regen aura, sustained beam, a held control field),
  ended early by the **same disruption conditions**. Both are "committed-on-the-timeline,
  interruptible" forms; modeled together. **First slice builds ONE martial channel
  as the proof: the Knight's "Hold the Line"** — a sustained taunt + guard aura
  while the Knight is locked in place, broken by the shared fizzle conditions. (This
  doubles as gap C's *active* tank tool — see below.)
- **Cooldown details (default, tunable):** cooldowns appear only on the **2–3
  instant-utility skills** (Heal / Cleanse / Guard-type), ~**150–250 CT** each — not
  on offense, which is paced by charge-time + the Act tax.
- **Charge denomination (default):** fill tied to **elapsed clock time** (so "N turns"
  ≈ N of the caster's turns), denominated in CT/ticks internally, **displayed as
  "~N turns."** Not Speed-scaled unless we revisit.
- **Compounding (no new "combo system"):** charge-time × **flanking** × Speed reinforce
  — a fast unit pins an isolated target, an ally's charged hit lands while it's still
  flanked. Combos fall out of the timing economy (cf. D16's bus-scheduled chains).

### Job model — any job can be primary (settles D32) — *2026-06-07*

> The **combat/non-combat job split dissolves.** Any job (Knight, Chef, Merchant, …)
> can be a unit's **primary**. "Primary" is only a **designation** that affects
> **(a) XP-gain rate** and **(b) class-gated content** (events/recruits/dialogue that
> check whether the party holds a given class). Units can **hold multiple jobs** and
> draw skills from all held jobs — this is the FFT secondary-class direction, so it
> **settles D32** rather than deferring it.

- **Parameters deferred to the leveling discussion** (XP-rate lives there): how many
  jobs a unit may hold; whether non-primary jobs still earn XP (reduced rate); per-job
  vs per-unit levels; the slot model (if any).
- **First-slice impact: container only.** Units still carry **one** job each in the
  first slice, so the *kits* are unchanged; the data shape (`primaryJob` + a held-jobs
  list; `isCombatant` stops gating on a `noncombat` flag) is what changes. The
  Survivalist/Chef/Merchant stay first-class jobs (not absorbed into a combat class).

## Open discussion queue (one at a time)

- **C — taunt extent.** *Largely resolved:* passive formation-protection comes from
  **flanking**; the Knight's *active* aggro tool is the **"Hold the Line" channel**.
  The only residue is **making the AI honor taunt**, which lives in **D**. Confirm
  the exact taunt effect when we spec the Knight's kit.
- **Class kits** *(in progress — one class at a time for identity; Knight first)*.
  The concrete per-class skill list (Knight → Archer → Scout → Medic).
- **Leveling payoff specifics (#2) + job-model parameters.** Stat-growth per class vs
  skill-unlock breakpoints vs both; the growth curve; **plus** the deferred job-model
  parameters (jobs-per-unit, non-primary XP rate, per-job vs per-unit levels, slots).
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
- **2026-06-07** — Locked the combat ability economy (E): economy = time; two-lever,
  charge-time the star (D5) + sparing cooldown on instant utility; basic attack the
  instant floor; instant-default/charged-for-power; arbitrary-N charge duration
  (story spells = long charges); fizzle as an extensible data-driven condition set
  (caster-death first); channeled embraced as the dual of charged (scope open).
- **2026-06-07** — Closed E: build **one** martial channel as the proof — the Knight's
  **"Hold the Line"** (sustained taunt+guard while locked), which doubles as gap C's
  active tank tool. Cooldowns only on instant utility (~150–250 CT); charge fill tied
  to elapsed clock time, displayed as "~N turns." **C largely resolved** (flanking =
  passive, Hold-the-Line = active, AI-honors-taunt folded into D). **Economy fully
  specced.**
- **2026-06-07** — Job model reshape: any job can be **primary** (combat/non-combat
  split dissolves); primary only affects XP-rate + class-gated content; units may hold
  multiple jobs & draw skills from all (settles D32). Parameters → leveling discussion.
  First slice = container change only (one job per unit; kits unchanged). Began the
  kit-by-kit identity pass (Knight first).
