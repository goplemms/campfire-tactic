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
  interruptible" forms; modeled together. **Two channel flavors** (revised
  2026-06-07): **(a) maintained-stance** — sustained self-buff while a condition holds,
  the **caster keeps moving/acting** (the Hunter's *Mark Prey* ramp); **(b)
  locked-emanation** — caster locked in place, effect ticks outward (a bard's
  morale-tune, a regen aura). **Build (a) in the first slice** (Mark Prey); **defer (b)**
  to magic / support casters. Both reuse the same sustained/interruptible machinery, so
  the data shape covers both now.
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

- ✅ **C — taunt extent.** *Resolved:* no hard taunt — flanking (passive formation
  protection) + the Heavy Knight's **tarpit** (tempo denial) carry C. Taunt status
  reserved. AI-honors-debuffs lives in D.
- ✅ **Class kits.** Roster complete & locked (Heavy Knight · Hunter · Scout · Medic).
- ✅ **Status set (gap F).** Locked — Slowed / Exposed / Immobilized / Hastened, with
  the visual-tracker requirement + authoring pattern.
- **Leveling payoff specifics (#2) + job-model parameters** *(NEXT)*. Stat-growth vs
  skill-unlock breakpoints vs both; **ability scaling by level** (per the locked
  principle); the growth curve; **plus** the deferred job-model parameters
  (jobs-per-unit, non-primary XP rate, per-job vs per-unit levels, slots).
- **D — AI scope.** How far the AI upgrade goes (range use, ability use, flank
  exploit/avoid, honor-debuffs, fog use) for the first slice vs deferred.

## Class kits

**Ability-slot standard (locked 2026-06-07):** every class has **2 active abilities +
1 passive** (plus the universal instant **basic attack**). The **passive is the
identity anchor**; actives are the verbs. Caps button-bloat; keeps each class legible.

**Directional AoE (locked 2026-06-07):** multi-target patterns (e.g. Cleave) take a
**direction chosen at cast time** — no persistent unit facing is tracked. This is the
*only* re-opening of gap G: a fixed cleave pattern, not full AoE templating.

**Design principle — synergy-first (locked 2026-06-07):** the four classes are
designed to **interlock**, so combat *rewards a well-composed team* rather than four
self-sufficient soloists. This is deliberate: it makes the **provisioning / logistics**
layer matter to combat (you assemble a *combo*, not just a roster) — the game's
identity. Emergent chains already fall out of the locked kits: Heavy Knight tarpit
(Slowed) → Scout isolates + Exposes → Hunter's Deadeye punishes the afflicted prey.

**Design principle — scale by level/resource, not small-vs-big (locked 2026-06-07):**
a class's two actives must differ in **kind**, never be a "small version / big version"
of the same effect. Abilities grow via **character level and/or resource commitment**.
(Direct input to the leveling discussion: leveling makes abilities *grow*, not only
stats.)

**Design principle — combat↔logistics bridge (locked 2026-06-07):** combat abilities
may **consume logistical resources** (consumables), with **modular riders chosen by
resource type** — so provisioning has a combat voice (the game's identity). Extends the
consumables family (D17/D20: ammo/scrolls/reagents). **First expression: the Medic's
Heal.** Scope: additive, reuses `inventory.ts`/`MATERIALS`; ship a **minimal** version
first (one consumable per use, ~2–3 herb types), deepen the resource-scaling axis later.

### Heavy Knight — LOCKED *(2026-06-07)*

Space-control bruiser / anchor. `sp12 hp34 atk11 def4 mv4`. Renamed from "Knight" to
signal the heavy/control subtype. *Texture: warp the geometry, tax proximity.*

| Slot | Skill | Effect |
|---|---|---|
| **Passive** | **Hold the Line** | Enemies within **range 1** of the Heavy Knight are set to **speed 1** (a tarpit — applied as a Slowed status while inside the ring, cleared on leaving). Even *avoiding* the ring costs the enemy significant movement. **Numbers (speed floor, radius) tunable** — speed 1 / range 1 for now. Delivers C via tempo-denial; no hard taunt. |
| **Active** | **Shove** | Quick forced-movement utility (**D19**): push an adjacent enemy 1 tile (stop at blockers; forced entry onto an entity tile fires it). Low/no cooldown. Manufactures isolation, peels off the backline, shoves into traps. |
| **Active** | **Cleave** | Melee AoE: hit enemies in a **chosen-at-cast direction** (the up-to-3 tiles in that 90° arc). Punishes clumping. |

*(+ basic attack.)* No charged/channeled ability; C delivered without taunt.

### Hunter — LOCKED *(2026-06-07)*

Ranged prey-hunter / kiting skirmisher (renamed from "Archer"). `sp10 hp20 atk9 def1
mv4`, **attackRange 3** (ranged basic). *Texture: keep spacing, lock prey, ramp it down.*
Its **trap-layer half is NOT in the kit** — it comes from a **secondary class**
(Survivalist), the two synergizing (the first real payoff of the multi-job model).

| Slot | Skill | Effect |
|---|---|---|
| **Passive** | **Deadeye** *(name TBD)* | Bonus damage vs. **debuffed/afflicted** targets (Slowed / Pinned / Immobilized / Exposed…). Exact triggers finalize with the **WIP status set**. Threads into the Heavy Knight's tarpit (Slowed) + team setups. |
| **Active** | **Mark Prey** *(channel — maintained-stance)* | Lock onto a target; **consecutive attacks on it ramp damage** (+X/stack, capped). Resets on target-switch; ends on disrupt / prey death. The Hunter **keeps moving & acting** while focused. The slice's channel proof. |
| **Active** | **Reposition** | Move extra tiles (kite / hold spacing / stay on prey). Doesn't break Mark. |

*(+ ranged basic attack.)* **`attackRange` becomes a unit stat** (default 1; Hunter 3)
— infra also needed for D (enemy archers can finally shoot).

### Scout — LOCKED *(2026-06-07)*

Playmaker / flank engine. `sp14 hp24 atk9 def2 mv5` (fastest, most mobile). *Texture:
manufacture isolation, mark the kill, let the team eat.* Chosen **playmaker** over
solo-assassin to set the team-play baseline.

| Slot | Skill | Effect |
|---|---|---|
| **Passive** | **Flanker** | The Scout **flanks an isolated (unsupported) target *solo*** (it doesn't need a second blade) **and** gets a **larger** flank bonus than the baseline. The team's flank specialist; punishes stragglers even alone. Counterplay = stay in formation. |
| **Active** | **Dash** | Mobility: reposition / engage to manufacture isolation, reach a flank tile, or dive a line. |
| **Active** | **Expose** | A melee **strike that marks**: deals damage **and** applies **Exposed** (target takes +damage). One action = payoff + team-setup; feeds the Hunter's Deadeye and amplifies the party's focus. Amplified by Flanker when flanking. |

*(+ melee basic attack.)* Damage = basics + Flanker bonus + its own Exposed mark — no
separate burst button needed. **Exposed status finds its home here.**

### Medic — LOCKED *(2026-06-07)*

Sustain backbone & clock-manager. `sp9 hp20 atk4 def2 mv3` — slow, fragile, near-zero
offense; its game is **timing**. Slowness is intentional: it must **anticipate**, not
just react (which is why a *charged* heal fits). The two actives differ in **kind**
(modular item-heal vs. charged level-heal), per the scale-by-level/resource principle.

| Slot | Skill | Effect |
|---|---|---|
| **Passive** | **Triage** | Healing is **stronger the more wounded** the target is (scales with missing HP); can **stabilize a downed unit** (D9 tie-in). Rewards brinkmanship — exactly what an aggressive synergy comp creates. |
| **Active** | **Heal** *(instant, consumes a resource)* | Consumes a **medical consumable**; heals + a **rider by resource type**: salve → +healing; stimulant → +speed a turn; **antidote → cleanse a debuff** (counterplay = *provisioned*, not free). Scales with resource commitment. |
| **Active** | **Mend** *(charged)* | Committed timing-heal, **scales with level**. The big save + the slice's **charge demonstration**. |

*(+ weak melee basic.)* **Cleanse folds into the antidote rider** (logistics = the
debuff answer). **Charge is demonstrated here** (Mend) — so no shoehorned charged
offense; that waits for a future heavy/caster.

> **ROSTER COMPLETE** — Heavy Knight (control) · Hunter (ranged prey) · Scout
> (playmaker) · Medic (sustain). Next: re-derive the **status set**, then **leveling
> payoff + job-model parameters**, then **D (AI scope)**.

### Status set (gap F) — LOCKED *(2026-06-07)*

Derived from the kits; deliberately tight. A status has **teeth** only when a consuming
system reads it (see the authoring pattern below). The existing `status.ts`
(`StatusInstance` + apply/has/remove/tick) is the substrate; today only **Immobilized**
has teeth — the rest is what M12 adds.

| Status | Type | Teeth (the reader) | Applied by | Decay |
|---|---|---|---|---|
| **Slowed** | debuff | CT gain reduced — `clock` (`effectiveSpeed`); the tarpit is the extreme (speed → 1). Punished by Hunter **Deadeye**. | Heavy Knight tarpit | **aura-maintained** |
| **Exposed** | debuff | takes **+damage** — `combat.computeDamage`. Punished by **Deadeye**. | Scout Expose | duration |
| **Immobilized** | debuff | **can't move** — AI/turn (`isImmobilized`); also the flank body-count. Punished by **Deadeye**. | enemies/AI, snares (*exists*) | duration |
| **Hastened** | buff | CT gain **boosted** ~1 turn — `clock`. | Medic stimulant rider | duration |

- **Cleanse** (Medic antidote) removes any one **debuff**. **Deadeye** (Hunter) punishes
  a target carrying any **debuff**. Both read the **`kind` classifier**, not an id list.
- **Reserved (not built):** Taunt, Guarded. **Deferred (demo may add):** Poison/DoT.

**Render requirement — visual trackers (locked):** every status needs an **at-a-glance
indicator** on the unit token (a small **icon/badge + a tint**, with a tooltip on hover)
so the player reads the board without clicking. Driven by a **status→visual registry**
(data) in `BattleScene` — a new status gets a tracker by adding one registry entry, not
bespoke draw code.

**Authoring pattern** *(graduates to `docs/guides/adding-statuses.md` on M12 ship,
mirroring `adding-abilities.md`).* A status with teeth = up to 4 small parts:

1. **Data** — an id constant + builder in `status.ts` (cf. `IMMOBILIZED`/`immobilized()`),
   a **`kind: "debuff" | "buff"`** classifier, optional `data` magnitude, and a
   `hasStatus`-based read predicate (cf. `isImmobilized`).
2. **Teeth** — exactly **one** consuming system reads it: CT → `clock.ts`
   (`effectiveSpeed`); damage → `combat.ts` (`computeDamage`); targeting → `ai.ts`;
   turn-start/DoT → `tickStatuses`. **Don't scatter reads.**
3. **Cross-cutting hooks pick it up *by classifier***, not by id list — cleanse ("remove
   a debuff"), Deadeye ("is debuffed"), and the tracker tint all read `kind`. So adding
   **Poison** later = one record + a turn-start read-hook; cleanse/Deadeye/tracker need
   **zero** edits. (This is the maintenance win the classifier buys.)
4. **Aura vs duration** — duration statuses decay via `tickStatuses`; aura-maintained
   ones (the tarpit) are re-applied/cleared each tick by the emitting system.
5. **Test** — `status.test.ts`: apply → the reader changes a decision → cleanse removes.

> **Status set — re-derive after the roster is complete.** Likely survivors:
> **Immobilized, Slowed, Exposed**. **Taunt** drops (reserve for later — C is now
> flanking + tarpit). **Guarded** lost its Heavy-Knight home — find one (Medic?) or drop.

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
- **2026-06-07** — Ability-slot standard: **2 active + 1 passive** per class (passive =
  identity anchor) — re-derives all kits. Directional AoE chosen at cast time (no
  facing tracked) = the only G re-opening (fixed cleave pattern). **Channel build
  deferred** to magic/support casters (shape kept). **Heavy Knight LOCKED**: passive
  Hold the Line (adjacent enemies → speed 1 tarpit, range 1, tunable; C via tempo-denial,
  no hard taunt) + Shove (D19 forced movement) + Cleave (directional AoE). Taunt status
  drops; Guarded needs a new home; status set re-derived after the roster.
- **2026-06-07** — **Hunter LOCKED** (renamed from Archer): ranged prey-hunter; passive
  Deadeye (bonus dmg vs debuffed targets, keyed to the WIP status set) + Mark Prey
  (maintained-stance **channel** — ramp dmg on consecutive same-target hits; Hunter
  keeps acting) + Reposition (extra move). `attackRange` becomes a unit stat (Hunter 3;
  needed for D). Trap-laying comes via **secondary class** (Survivalist), not the kit —
  first payoff of the multi-job model. Channel build **back in** via the maintained-stance
  flavor (Mark Prey); locked-emanation (bard) still deferred. Charged *offense* now an
  **open lever** (identity-first; no forced home).
- **2026-06-07** — **Scout LOCKED** as the **playmaker** (over solo-assassin, to set a
  team-play baseline that makes logistics matter to combat): passive **Flanker**
  (solo-flanks isolated targets + bigger flank bonus) + **Dash** (mobility to
  manufacture isolation) + **Expose** (a strike that marks → Exposed status, feeding the
  Hunter's Deadeye). Recorded the **synergy-first** design principle. **Exposed** status
  home = Scout. **Charged offense deferred to a future heavy/caster** (no forced home);
  charged still demonstrated via the Medic's Mend.
- **2026-06-07** — **Medic LOCKED** → **ROSTER COMPLETE**. Triage passive (heals scale
  with missing HP, stabilize the dying) + Heal (instant, **consumes a medical
  consumable**, rider by resource: salve/+heal · stimulant/+speed · antidote/cleanse) +
  Mend (charged, level-scaling — the charge demo). Recorded two roster-wide principles:
  **scale by level/resource not small-vs-big**, and the **combat↔logistics bridge**
  (abilities may consume consumables; first expression = Medic Heal; ship minimal).
  Cleanse folds into the antidote rider. Guarded status dropped/reserved (like Taunt).
- **2026-06-07** — **Status set LOCKED** (gap F): tight set of **Slowed / Exposed /
  Immobilized / Hastened** (3 debuffs + 1 buff), each with a single read-hook (clock /
  computeDamage / AI). Cross-cutting consumers (cleanse, Deadeye, tracker tint) key off
  a **`kind: debuff|buff` classifier**, not id lists — so adding e.g. Poison later is
  one record + one read-hook. Added a **visual-tracker render requirement** (icon/badge
  + tint + tooltip via a status→visual registry) and a **status authoring pattern**
  (graduates to `docs/guides/adding-statuses.md` on ship). Taunt/Guarded reserved;
  Poison/DoT deferred to the demo quest.
