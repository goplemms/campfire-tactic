# Decisions: foundations

OPT-IN ledger for contested or multi-track work. Skip this file for simple,
single-track features. Before editing an entry, CLASSIFY the change and confirm
with the user: is this a **pivot** (supersede + re-open) or an **adjustment**
(new milestone)?

Statuses: `Open` · `Decided` · `Superseded` · `Deferred` · `Blocked`

Superseded entries are NEVER deleted — they keep a "Superseded by" link so the
trail of reasoning stays intact.

---

## D1 — Engine & platform strategy

- **Status:** Decided
- **Context:** First-time game developer, most comfortable on the web, but wants
  to keep the door open to ship on Steam and as a mobile app later.
- **Options considered:** Godot 4 / Unity / Web (TypeScript + Phaser 3) / Bevy (Rust)
- **Decision:** **Web-first — TypeScript + Phaser 3 + Vite.** Steam/desktop later
  via a Tauri or Electron wrapper; mobile later via Capacitor. These are additive
  wrappers around the same web build, not a port, so "web now" does not forfeit
  Steam/mobile.
- **Superseded by:** —

## D2 — Core/render separation (the rule that makes D1 safe)

- **Status:** Decided
- **Context:** A web game can bleed engine/DOM assumptions into game logic, which
  is exactly what makes later platform moves a rewrite.
- **Options considered:** (a) Phaser-coupled game objects throughout /
  (b) pure-logic `core` package + thin `game` render layer + future platform shells
- **Decision:** **(b).** `core/` is plain TypeScript with no Phaser and no DOM —
  stats, grid, pathfinding, jobs, skills, turn rules, run state. `game/` renders
  it with Phaser. Benefits: the core is headlessly unit-testable (which is what
  the kit's "tests green" milestone gates check), and it travels unchanged into
  any platform shell.
- **Superseded by:** —

## D3 — Phase pipeline: Meta → Deployment → Battle → Resolution

- **Status:** Decided
- **Context:** The signature non-combat jobs do NOT all act in the same place:
  Chef acts between battles (camp), Survivalist acts before a battle starts
  (deployment), Merchant acts in the economy/meta layer. Bolting these onto a
  single battle loop later would fight the architecture.
- **Options considered:** (a) one monolithic battle state / (b) explicit ordered
  phases with jobs/skills hooking specific phases
- **Decision:** **(b).** Model the game as ordered phases and treat jobs/skills as
  data that register effects into a phase. This makes the unique hook cheap to
  extend and is set up in M4, exercised in M5–M6.
- **Superseded by:** —

## D4 — Field entities + a battle trigger/event bus

- **Status:** Decided
- **Context:** Traps (Survivalist), defensive nests (Builder), and ritual runes
  (Mage) look like three features but share one shape: a non-unit thing placed
  during Deployment that reacts to events during Battle. Modeling them separately
  would make each a bolt-on.
- **Options considered:** (a) hard-code each placeable as its own special case in
  the battle loop / (b) one **field-entity** abstraction (position, owner, state,
  trigger policy, effect) whose instances are **listeners on a battle
  trigger/event bus** (`onUnitEnterTile`, `onTurnStart`, `onUnitDamaged`, …).
- **Decision:** **(b).** Trap = one-shot listener; nest = passive aura/terrain
  modifier; rune = pre-paid charge (auto or manual trigger). Crucially, **M3
  builds the trigger bus + field-entity registry before any entity exists**, so
  later placeables are data + a listener, not new systems. Full spec:
  [`docs/design/systems/field-entities.md`](../../docs/design/systems/field-entities.md).
- **Superseded by:** —

## D5 — Combat action economy: FFT-style CT clock + charged abilities

- **Status:** Decided
- **Context:** The signature prep mechanics (especially auto/manual-triggered
  runes) want a notion of effects committed in advance and resolving later. The
  action economy must accommodate that.
- **Options considered:** (a) Fire-Emblem-style one move + one action per discrete
  round / (b) FFT-style **continuous Charge-Time (CT) clock** (per-unit CT rises by
  Speed each tick; turn at CT≥100; Move + Act) **with charged abilities** that
  schedule on the timeline and resolve later.
- **Decision:** **(b).** Speed governs turn frequency *and* charge-landing speed.
  Ritual runes are modeled as **pre-paid charged abilities** placed in Deployment.
  Each side starts Battle with a **CT seed** from its deployed, non-captured units'
  Speed. **Accepted cost:** AI on a continuous clock is meaningfully harder than
  round-based — opted in with eyes open. Spec:
  [`docs/design/systems/action-economy.md`](../../docs/design/systems/action-economy.md).
- **Superseded by:** —

## D6 — Two-tier prep; logistics as a first-class pillar

- **Status:** Decided
- **Context:** Prep splits cleanly into off-map resource management (buy gear, load
  ammo/materials, cook) and on-map placement. The player wants logistics to be a
  *headline pillar* aimed at crunch players, not garnish.
- **Options considered:** (a) a single lumped "setup" step / (b) **two tiers**:
  **Meta/Pre-deployment** (off-map resource logistics) feeds **Deployment** (on-map
  spatial logistics), linked by a **provisioning constraint** (you can only place
  what you carried; you can only carry what storage allows).
- **Decision:** **(b), with logistics elevated to a pillar.** Storage (Merchant) is
  the master cap; materials/ammo/rations are consumed in Battle and recovered in
  Resolution. This warrants a dedicated logistics milestone (an *adjustment*, not a
  pivot — north star unchanged). Spec:
  [`docs/design/systems/logistics.md`](../../docs/design/systems/logistics.md).
- **Superseded by:** —

## D7 — Deployment as a per-unit push-your-luck time gamble

- **Status:** Decided
- **Context:** On-map setup should carry risk, not be pure upside, and the risk
  should reward fast/perceptive characters while punishing greed.
- **Options considered:** (a) a hard deployment-point budget / (b) a **soft**
  budget with a **transparent exposure model**: a safe allowance, then an
  **overdraw zone** with *shown, escalating* capture risk. **Awareness** governs
  safety (bigger safe allowance, less exposure per overdraw); **Speed** governs
  throughput. Overreach → the unit is **captured**: it starts Battle bound on the
  map (effective −1, removed from the initiative seed) but is a **rescuable**
  sub-objective; only a unit still captured at battle's end is lost (permadeath).
- **Decision:** **(b).** Transparent meter (no hidden roll), rescuable capture,
  Awareness=safety / Speed=throughput. Units may instead **hold position** (no
  prep, no risk, ready). Spec:
  [`docs/design/02-deployment.md`](../../docs/design/02-deployment.md).
- **Superseded by:** —

## D8 — Morale: passive, tiered, asymmetric modifier bundle

- **Status:** Decided
- **Context:** The Chef produces morale and Resolution nudges it, but morale had
  no mechanical meaning. The player wants it to *avoid* being another active meter
  to manage, and to never "kick a player while they're down."
- **Options considered:** (a) per-unit combat stat with routing/fleeing at low
  morale / (b) **passive, tiered party-wide bundle of minor modifiers** / (c) a
  spendable resource pool.
- **Decision:** **(b).** Morale is **passive** (always-on, nothing to spend) and
  applies a **bundle of small modifiers by tier**. Deliberately **asymmetric**:
  Neutral is baseline, High tiers *add* modest bonuses, the Low tier applies only
  *marginal* penalties (mostly the absence of bonuses) — so the floor is shallow.
  The specific effect list is an **open menu** (deployment safe allowance,
  initiative seed, capture exposure, crit, slight HP, accuracy/evasion, loot/gold
  find), biased toward effects that reinforce existing systems. **Speed is a
  caution** — it compounds in the CT clock, so any morale→speed effect must be the
  smallest of the bundle or omitted. Spec:
  [`docs/design/systems/morale.md`](../../docs/design/systems/morale.md).
- **Superseded by:** —

## D9 — Mortality, recovery & difficulty consequence policy

- **Status:** Decided
- **Context:** A roguelike needs stakes, but the player's philosophy is **punish
  choices, not execution**. Units leave the run via two vectors — falling in combat
  (HP→0) and being captured-and-unrescued — and how harsh each is should be a
  *difficulty* dial, not a fixed rule.
- **Decision:** A **data-driven consequence policy, one per difficulty**, the core
  consults when resolving a downed or captured unit (swappable, headlessly
  testable). The universal time unit is **a night**.
  - **Combat down (HP→0):** Easy = full heal on rest; Normal = redeploy at ½ HP, no
    permadeath; Hard = "dying," pay a **local cleric** (gold, an economy sink)
    within N nights or permadeath; Hardest = permadeath at 0, flat.
  - **Captured & unrescued:** resolves into a **rescue follow-up quest**, not flat
    death. Easy = guaranteed, no timer; Normal = must be earned, no timer; Hard =
    narrow night-window + **reduced Deployment** (enemy is ready — an "ambush-in-
    reverse" scenario modifier); Hardest = tight window + heavily reduced
    Deployment. Abandoning the quest past its window loses the unit (option **b**
    from the discussion: a grace window to grind resources, then real loss).
  - **Recovery (between nights):** a **Rest-Point (RP)** meter. Support roles
    (Chef/Medic/Bard/…) add RP per night (data-driven). RP converts to healing at
    **`RP_PER_CHUNK` → one chunk of `CHUNK_FRACTION` of max HP** (default `1/8`,
    every constant configurable). **Difficulty scales `RP_PER_CHUNK` only** (one
    dial for the whole gradient). RP is spent by **triage** — allocated to chosen
    units each night — which gives the Hard-mode dying clock real teeth.
- **Open sub-points (tuning):** exact tier/threshold numbers; whether difficulty
  scales anything *beyond* mortality (scoped **out** for this pass). Spec:
  [`docs/design/systems/mortality-recovery.md`](../../docs/design/systems/mortality-recovery.md).
- **Superseded by:** —

## D10 — Intel system, the Intelligence stat, and banding as a convention

- **Status:** Decided
- **Context:** Provisioning is deliberately "blind-ish"; *intel* lifts that fog. Two
  questions were open: is intel a passive of a stat or a purchased action, and does
  it share the Awareness stat (which already governs Deployment safety)?
- **Decision:**
  - **Intel is per-encounter, party-wide, and banded** into tiers separated by
    **breakpoints**: **types → numbers → positions**.
  - **Three lanes** to climb the tiers (C+D from the discussion, plus a specialist):
    (1) **passive** via a new **Intelligence** stat (a free floor); (2) **scouting**
    — gold/ration, or **send a unit** who then starts the battle out of position
    (risk, à la D7); (3) **divination** via the **Seer** — spend a reagent to jump a
    breakpoint, or at master rank read free with a chance to jump *multiple*.
  - **Awareness and Intelligence are distinct personal stats.** Awareness = how
    *safely* a unit preps (Deployment exposure); Intelligence = how much the party
    *sees* (intel floor). Different archetypes: Survivalist high-Awareness, Diplomat/
    Noble high-Intelligence. The **Seer** raises the shared **Intel level**, not the
    Awareness stat. ("Intelligence" name is **provisional** — may collide with a
    future magic stat.)
  - **Banding is adopted as a general convention** (intel, morale, Awareness
    allowance, …): discrete, player-legible, individually tunable knobs.
- **Spec:** [`docs/design/systems/intel.md`](../../docs/design/systems/intel.md),
  [`docs/design/systems/stats.md`](../../docs/design/systems/stats.md).
- **Superseded by:** —

## D11 — Deployment exposure: two-stage spatial danger gradient

- **Status:** Decided (details the D7 gamble)
- **Context:** D7 set the *experience* (visible safe allowance → escalating risk) but
  not the curve. Player added a spatial dimension: danger should also depend on
  *where* you place, not just how many.
- **Options considered:** (a) smooth accelerating % per overdraw placement /
  (b) **banded risk tiers** / (c) deterministic threshold (no roll).
- **Decision:** **(b), made spatial and two-stage.**
  - **Stage 1 — safe period:** the first placements (safe allowance, banded by
    Awareness) are zero-risk anywhere on your side.
  - **Stage 2 — danger gradient:** once safe ends, every tile shows a **banded**
    danger reading (Safe → Exposed → Hunted → Cornered) that grows with **distance
    from camp**; a placement's risk = its tile's band. **Shown on the board**,
    resolved **immediately per placement** (no end-of-phase save-scum).
  - Axes unify: **how many** ends the safe period (Speed = throughput); **where**
    sets the risk (distance bands). **Awareness does both** — longer safe period
    *and* pushes the gradient farther out.
  - Cross-tie: a **Tier-3 intel** read (enemy positions) reveals where the gradient
    bites hardest, making placement safer/smarter.
- **Spec:** [`docs/design/02-deployment.md`](../../docs/design/02-deployment.md).
- **Superseded by:** —

## D12 — Enemy-prep symmetry + unified in-combat capture

- **Status:** Decided
- **Context:** Deployment prep was player-only. Should the enemy play the same game,
  and how do you deal with *their* hazards?
- **Options considered:** A1 asymmetric (player-only) / A2 fully symmetric / A3
  **fortified-encounter type** (only some encounters are prepped).
- **Decision:** **A3.** Enemy hazards appear in **fortified encounters** (enemy
  camps, defended chokepoints, *every rescue mission* — reusing the
  reduced-Deployment scenario), not in open scraps/ambushes — so symmetry is a
  *flavor*, not a tax, and the workload scales to encounters that want it.
  - **Detection** of enemy entities is gated by **Intel/Awareness** (Tier-3 or high
    Awareness reveals; else hidden until sprung). **Disarm** costs an **Act** (the
    Survivalist's defensive mirror); or **route around**.
  - **The Snare** is the exemplar enemy entity: **Immobilized X turns + a banded
    capture countdown** (abstracting enemy reinforcements reaching the spot — option
    **a**, timer-alone; adjacency-accelerator is a noted future upgrade). Expire
    while held → **captured**. This makes **capture one mechanic with two entry
    points** — pre-battle overreach (D11) and in-combat helplessness — both feeding
    the D9 captured state/rescue/policy.
  - Implementation: the M3 trigger bus must carry **status effects** (Immobilized)
    and tick a **per-unit capture meter** on `onTurnStart`.
- **Spec:** [`docs/design/systems/field-entities.md`](../../docs/design/systems/field-entities.md),
  [`docs/design/02-deployment.md`](../../docs/design/02-deployment.md),
  [`docs/design/03-combat.md`](../../docs/design/03-combat.md).
- **Superseded by:** —

## D13 — Material recovery + entity durability

- **Status:** Decided
- **Context:** What happens to placed-but-unused field entities after a battle —
  all-or-nothing, per-tile partial, or per-entity?
- **Decision:** **Outcome-gated, whole-field.** A **win** = control of the entire
  battlefield = recover **every** unsprung, intact entity left standing, **including
  the enemy's** (salvage into storage); **flee/lose → nothing.** (Mechanically the
  clean binary, framed as "control"; the earlier per-tile partial idea is dropped.)
  - Each entity carries **durability**: multi-use **charges** (a rope snare fires a
    few times before breaking) and whether its **material survives** use
    (recoverable) or is **consumed** (rune dust "wiped away," gone even on a win). So
    "recoverable on a win" = unsprung **and** intact **and** surviving-material.
- **Deferred (own follow-up):** **Ammo** handling — spent ammo should matter without
  making empty ranged units feel useless (per-unit vs. shared pool + the balance);
  and a **conditional Survivalist salvage perk** (higher % return) *if* we adopt
  spent-ammo/quantity pickups.
- **Spec:** [`docs/design/04-resolution.md`](../../docs/design/04-resolution.md),
  [`docs/design/systems/logistics.md`](../../docs/design/systems/logistics.md).
- **Superseded by:** —

## D14 — Inventory: party-wide slotted stacks; "wide logistics, micro at the unit"

- **Status:** Decided
- **Context:** How storage is measured shapes every provisioning decision; and where
  the game asks for player micro-management needed articulating.
- **Options considered:** (a) uniform slots / (b) **slotted stacks** / (c)
  weight/volume.
- **Decision:** **(b) slotted stacks, party-wide.** Storage is **one shared stash**
  of discrete **slots**, sized by the Merchant in bands (`+2 slots`). Each material
  has a `stackSize` (ammo stacks) and a `slotCost` (most 1; bulky items 2+). Honors
  both crunch (packing decisions, bulky items) and the banding convention (legible,
  Merchant-tunable). Per-unit carry is **not** used.
- **Principle adopted:** **wide logistics, micro at the unit** — logistics is
  party/macro (shared pools, provisioning); micro-management is unit-level
  (positioning, action economy, placement, triage). This is *why* storage is shared,
  and it pre-answers many "shared vs. per-unit" forks (e.g. it leans the parked ammo
  question toward a shared pool).
- **Spec:** [`docs/design/systems/logistics.md`](../../docs/design/systems/logistics.md),
  [`docs/design/README.md`](../../docs/design/README.md) (Conventions).
- **Superseded by:** —

## D15 — Upkeep: gold as the common denominator for maintenance

- **Status:** Decided (also resolves the Q8 "material spoilage" question)
- **Context:** Risk of *too many parallel meters*. Need a way to keep the logistics
  fantasy without burying the player in upkeep systems.
- **Decision:** **Collapse maintenance into a single gold Upkeep figure.** Dividing
  test: **interesting in-the-moment choice → its own system; necessary chore → a gold
  cost.** Bespoke (kept): CT clock, Deployment gamble, intel tiers, capture/rescue,
  RP triage, entity durability. Collapsed to gold: feeding, repairs, restock,
  emergency revive (the cleric, already gold).
  - **Upkeep = Σ per-job budget lines**, shown as one camp-menu number; adding a
    maintenance job adds a *line*, not a meter. Pay the total (chore) or **underfund a
    line** when broke (the *choice*).
  - **Categories (banded):** **Food** (Chef-owned, 1-night grace, **high** morale hit
    on breach) and **Repairs** (Blacksmith-owned, ~3-night grace, **moderate** morale
    hit + **gear condition** drop: −defense, −crit). Extensible.
  - **Gear condition replaces per-item equipment durability** — one funded/unfunded
    state + grace, then blanket penalties (no per-weapon meter).
  - **Debt = morale (option A):** unpaid Upkeep hits morale (D8); sustained **Low**
    morale night-over-night risks **desertion**. No new meter.
  - **Q8 resolved:** per-item **spoilage is dropped**; food is Upkeep gold (off the
    storage slots), so hoarding pressure is the steady gold drain instead of item rot.
- **Spec:** [`docs/design/systems/logistics.md`](../../docs/design/systems/logistics.md)
  (Upkeep), [`docs/design/systems/morale.md`](../../docs/design/systems/morale.md),
  [`docs/design/01-pre-deployment.md`](../../docs/design/01-pre-deployment.md).
- **Superseded by:** —

## D16 — Entity combos: chaining via the bus + CT-scheduled reactions

- **Status:** Decided (**provisional** — lowest-confidence call; revisit at M3/M4)
- **Context:** Should placed entities combine (rune-in-a-nest, trap-into-snare)?
- **Options considered:** (a) no stacking / (b) **chaining via the trigger bus** /
  (c) true fusion into compound entities.
- **Decision:** **(b).** Entities don't merge — on firing, an entity inspects its
  **own tile + 4-adjacent neighbors** for entities to set off and **schedules the
  reaction onto the CT clock with a `speed`** (`instant` → fires now; lower → a
  disruptable timer). This reuses the D5 charged-ability machinery wholesale, so
  combos get timing texture and counterplay with **zero new systems**. Rejected (c)
  as an authoring/balance burden that fights D15's restraint.
- **Spec:** [`docs/design/systems/field-entities.md`](../../docs/design/systems/field-entities.md)
  (Chaining), [`docs/design/systems/action-economy.md`](../../docs/design/systems/action-economy.md).
- **Superseded by:** —
