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

## D11 — Deployment exposure: safe period + retreat-gamble (refined)

- **Status:** Decided (details the D7 gamble) · **refined 2026-06-05** per play-trace
- **Context:** D7 set the *experience* (visible safe allowance → escalating risk) but
  not the curve. Player added a spatial dimension, then refined *how* it resolves.
- **Options considered:** (a) smooth accelerating % / (b) **banded risk tiers** /
  (c) deterministic threshold. Resolution: immediate-per-placement *vs.* a positional
  **retreat** at the buzzer.
- **Decision:** **(b), banded + spatial, resolved as a retreat race.**
  - **Stage 1 — safe period:** units range out and place **freely, zero-risk** (its
    length banded by Awareness).
  - **Stage 2 — retreat:** at the buzzer every exposed unit **auto-retreats** to its
    nearest **safe zone**; a **capture roll fires at the end of each step**, odds a
    tug-of-war of **proximity↓** (distance band Safe→Exposed→Hunted→Cornered shrinks
    toward home) and **time↑** ("the enemy is upon you"). Deep units face more steps
    *and* a rising clock → compounding odds; near-home units snap to ~0. The board
    shows each unit's **projected total retreat risk** (transparent; can't un-roll).
    A failed roll → captured, **repositioned into the enemy's safe zone**.
  - **Stats:** **Awareness** = longer safe period + gentler retreat odds; **Speed** =
    range (venture *and get home*) + throughput.
  - Cross-tie: a **Tier-3 intel** read reveals where the gradient bites hardest.
- **Refinement note:** the original "immediate per-placement roll" clause is
  **superseded** by the per-step **auto-retreat** model above (never built; refined
  at design stage from the session play-trace). The banded/transparent/spatial
  *spirit* is unchanged.
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

## D17 — Magic is Vancian; the consumables family

- **Status:** Decided
- **Context:** The play-trace declared "all magic is Vancian." Need a model that fits
  the logistics identity without a heavy spell-management minigame, and that never
  leaves a mage feeling useless.
- **Decision:** **All magic is Vancian** (limited, expended — not at-will), in three
  forms:
  - **Default spell** — every mage has one **free, unlimited, weak** at-will spell so
    a depleted mage always contributes (Fire-Emblem-style floor).
  - **Scribed spells** — each mage scribes **X castings/day**; the player **allocates**
    those X across known spells (re-allocatable up to pre-deployment, then locked),
    refreshed on a **night's rest**. One number per mage — low friction.
  - **Scrolls** — consumable one-shot castings carried as **storage items**.
  - **Runes** are Vancian castings placed in Deployment, paid in **reagent cost** +
    the **deployment peril** (D11); freely placeable within those limits.
  - **Orthogonal to D5:** Vancian = how *many* casts; charge-time = *when* a cast
    resolves.
  - **Consumables family:** scrolls, reagents, and **ammo** share one rule set —
    storage-slotted, expended on use, **partially recovered on a win** (D13). The
    default-spell idea is the template for ammo's empty-feels-bad balance (its own
    discussion).
- **Spec:** [`docs/design/systems/magic.md`](../../docs/design/systems/magic.md).
- **Superseded by:** —

## D18 — Vision & fog of war (the in-battle twin of Intel)

- **Status:** Decided
- **Context:** The play-trace promoted in-combat vision from "future" to load-bearing
  (Rogue hides in fog; Archer fires only at what it "has visual of").
- **Decision:** **Symmetric fog of war** on a **banded information ladder**:
  - **Hidden** (nothing, or a **last-seen ghost**) → **Pinged** (presence/location,
    *no identity*) → **Seen** (full info).
  - **Two senses:** **Sight** = per-unit **radius + line-of-sight** (terrain/elevation
    block) → Seen. **Awareness ping** = a radius that **ignores LoS** → Pinged; this is
    Awareness's **in-combat** role (was deployment-only).
  - **Hides** enemy units + undetected enemy entities; terrain shape always known.
  - **Concealment payoff:** breaking from Hidden = **ambush bonus**; being **Pinged
    partially defuses** it, **Seen** removes it (Awareness = ambush defense).
  - **Targeting:** direct attack/cast needs **Seen**; **AoE** can hit any perceived
    (incl. Pinged) tile.
  - **Intel tie-in:** a **Tier-3** read grants **starting vision** of enemy deployment.
  - **Stat:** adds **sight radius** to the combat block (M3).
  - **Deferred:** stealth as a stat/trait (player to mull).
- **Spec:** [`docs/design/systems/vision.md`](../../docs/design/systems/vision.md).
- **Superseded by:** —

## D19 — Forced movement (push / pull)

- **Status:** Decided
- **Context:** The play-trace's Whirlwind shoved enemies into net traps — forced
  movement exists and shines when combined with placed entities.
- **Decision:** Effects can **push** (away) or **pull** (toward) a banded number of
  tiles.
  - **Involuntary:** costs the target no CT, doesn't consume their turn.
  - **Target-agnostic:** usable on enemies (shove into hazards) *and* allies (pull to
    safety — a support tool).
  - **Combo:** a forced move **onto a field-entity tile fires that entity** (push into
    trap/net/snare) via the bus's `onUnitEnterTile` — the unit-driven sibling of D16
    chaining.
  - **Collisions:** stop at a wall/blocker/unit, with **optional collision damage**
    (tuning).
  - **Vision (D18):** AoE push can catch a **Pinged** tile; single-target push needs
    **Seen**.
- **Spec:** [`docs/design/03-combat.md`](../../docs/design/03-combat.md) (Forced
  movement), [`docs/design/systems/field-entities.md`](../../docs/design/systems/field-entities.md).
- **Superseded by:** —

## D20 — Ammo: infinite basics + special-arrow consumables; recovery keywords

- **Status:** Decided (resolves the parked Ammo question; refines D13/D17 recovery)
- **Context:** Ammo risks being trivial at either extreme (perpetually starved or
  permanent surplus). Need scarcity that *matters* without ever making an archer feel
  useless.
- **Decision:** Split ammo into two layers, mirroring [magic](../../docs/design/systems/magic.md):
  - **Basic arrows are infinite** — the at-will floor, the archer-side twin of the
    mage's **default spell**. A ranged unit is **never useless**. (Fallback when out
    of specials = basic shot + the option to close to melee, i.e. C.)
  - **Special arrows are limited consumables** (fire, net/grounding, …) — the scarce
    tactical layer, working like scrolls/traps; storage-slotted, party-wide (D14).
  - Archers and mages thus share **one kit shape**: a free basic + a limited pool of
    specials.
  - **Recovery keyword (generalizes the consumables family):** every consumable
    (special arrows, scrolls, reagents) carries its **own `recovery` keyword** — an
    **N% chance to recover on a win** (net arrow ~50%, fire arrow 0%). This **refines**
    D13/D17's flat "partially recovered" into a per-item roll; the **Survivalist
    perk** boosts it.
- **Spec:** [`docs/design/systems/logistics.md`](../../docs/design/systems/logistics.md)
  (Consumables), [`docs/design/systems/magic.md`](../../docs/design/systems/magic.md).
- **Superseded by:** —

## D21 — Victory auto-rescues captured allies (refines D7/D9)

- **Status:** Decided (M5b implementation refinement)
- **Context:** D7/D9 said an ally **still captured at battle's end** becomes a
  **rescue follow-up quest** rather than dying. In play that felt punishing when you
  had *already won the battle* — you control the field, so why is your bound ally
  still gone?
- **Decision:** **A win auto-rescues every still-captured ally.** Victory = control
  of the field (the same principle as D13 whole-field **material** recovery), so
  captured allies are **freed and returned to the roster** in Resolution at no extra
  cost. The **rescue follow-up quest** (D9) now applies only to **non-win** outcomes
  (flee/lose with a captured unit) or **abandoning** the rescue mid-battle — capture
  is still dramatic (lost tempo, a −1 during the fight, the risk of *not* winning),
  but winning brings your people home.
- **Also (M5b):** **Deployment plays on the board** — units are selected and **walk
  the grid (A*)** like combat, placing entities where they stand; exposure is now
  **spatial** (a banded safe **depth** from your edge; placing deeper raises the
  meter), a closer fit to D11 than an abstract placement counter. The full D11
  auto-retreat-with-per-step-roll remains a later tuning pass over this seam.
- **Spec:** [`docs/design/02-deployment.md`](../../docs/design/02-deployment.md),
  [`docs/design/04-resolution.md`](../../docs/design/04-resolution.md).
- **Superseded by:** —

## D22 — Overworld shape: a seeded, layered node DAG

- **Status:** Decided (M7 design pass)
- **Context:** Through M6 a run is a **linear** chain — `run.ts` holds one
  `encounterIndex` and each fight is `streamFor(seed, "enc:N")`. M7 replaces the
  straight line with a navigable **map** the player branches through (the "run
  frame" the notes queued), while keeping determinism, permadeath, and the
  core/render split intact.
- **Options considered:** (a) a **layered node DAG** (Slay-the-Spire-style columns
  of nodes with forward-only edges) / (b) a free-roam node graph (arbitrary
  adjacency, pathfound) / (c) a branching tree (no path re-merges).
- **Decision:** **(a) — a layered node DAG.** It is deterministic, legible,
  trivially seedable and testable, and delivers "branching mission select" without
  a pathfinding overworld. The map is **seed-derived** (`streamFor(seed, "map")`),
  so replaying a seed reproduces the **same layout, node kinds, and edges**.
  - **Shape:** `MAP_GEN.layers` columns (default **7**). **Layer 0** is a single
    **start** node (the camp you begin at, never fought); the **final layer** is a
    single node (the run's last mission); interior layers are **`minWidth..width`**
    nodes wide (default **2..3**). Edges run **forward only** (layer `L → L+1`).
  - **Connectivity invariants (the generator guarantees):** every non-final node
    has **≥1 outgoing** edge and every non-start node has **≥1 incoming** edge, so
    **every node is reachable from the start** (no dead start) and the start can
    always reach the final layer (no dead end). A small extra fan-out
    (`maxFanout`) adds branch choices on top of the spanning edges.
  - **Difficulty ramps with map depth:** a combat node's encounter is
    `generateEncounter(streamFor(seed, "node:<id>"), node.layer)` — the **layer is
    the index**, so deeper missions are harder, reusing `generation.ts` unchanged.
- **Spec:** [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md).
- **Superseded by:** —

## D23 — Node types & the camp relationship (minimal for M7)

- **Status:** Decided (M7 design pass)
- **Context:** A map needs node *kinds*. The full menagerie (shops, recruiters,
  events) is a later batch; M7 only needs enough to prove the frame.
- **Decision:** **Two kinds, both data-driven (D3/D4 ethos), no hard-coded
  branches in the loop:**
  - **`combat`** — a fight. Reuses `generation.ts` and the existing
    **Camp → Deployment → Battle → Resolution** flow unchanged.
  - **`rest`** — a **non-combat** between-battle camp recovery with **no fight**:
    a night of Upkeep plus a recovery bonus (extra Rest Points + auto-triage of the
    wounded + a small morale uptick, D8/D9). The **start** node (layer 0) is a rest
    node thematically (your starting camp), but is the entry position and is never
    *played*.
  - **Camp stays the Meta phase (D3)** that runs *before* a chosen **combat** node
    (upkeep, RP, dying clocks, provisioning, intel). The **overworld is the screen
    you return to between nodes** to choose the next one. A rest node is its own
    lightweight recovery beat, distinct from the pre-combat camp.
  - **Run terminals:** a **wipe** (no combat-capable roster unit) ends the run as
    before (`isRunOver`); clearing a **final-layer** node flags **run-complete** —
    a new terminal the overworld surfaces.
  - **Out of scope (next batch):** shops/merchants-as-nodes, recruitment, event
    nodes, narrative. Kept deliberately minimal.
- **Spec:** [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md).
- **Superseded by:** —

## D24 — Intel pre-selection: a banded node preview (extends D10)

- **Status:** Decided (M7 design pass)
- **Context:** Branching is only a *choice* if it's **informed**. D10 made intel a
  per-encounter, party-wide, banded read; M7 needs to surface a slice of it on the
  **map**, before you commit to a node, so the player picks with intent.
- **Decision:** **`previewNode(run, nodeId)` returns a banded preview** for a
  candidate (reachable) node, wired to `intel.ts`/`readEncounter` and the party's
  `intelFloor` (D10):
  - **Node `kind` is always shown** (combat vs rest), and for a combat node its
    **encounter type** (open-field/fortified) is always shown — you always know
    *what shape* of node you're walking into.
  - **The party's intel floor reveals more** about a combat node's contents, banded
    exactly as D10: **Tier 1** enemy **types** → **Tier 2** the **count** → **Tier
    3** positions/starting vision. A **reward hint** is likewise banded (Tier 0
    hidden → a coarse gold **band** → an approximate figure → exact), so higher
    intel makes the branch choice sharper.
  - **Rest nodes** preview a recovery hint (no enemies to read).
  - **Stable for a seed:** previews derive only from the seed-built map + the
    deterministic per-node encounter + the party's floor, so the **same seed shows
    the same reachable previews** (no live RNG draw).
- **Spec:** [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md),
  [`docs/design/systems/intel.md`](../../docs/design/systems/intel.md).
- **Superseded by:** —

## D25 — The guild/caravan layer: a three-tier strategic stack

- **Status:** Decided (overworld/guild design pass, 2026-06-06)
- **Context:** M7's overworld borrowed Slay-the-Spire's *shape* without its
  *engine* — in STS the map means something because every fight feeds the deck and
  **HP is the currency you spend to route**. Campfire has no deck; its equivalent of
  "the deck getting stronger" is **roster + stores + gear** = **logistics**. The
  run-frame also needs a persistent home so "between adventures" and "between fights"
  stop both fighting for the word *camp*.
- **Decision:** A **three-tier stack** sitting above the phase pipeline (D3):
  - **Guild hall** (NEW, persistent) — home *between* adventures: the roster pool,
    the armory, caravan assembly, several expeditions in flight.
  - **Overworld** — **one caravan's** adventure: the layered DAG of D22, now scoped
    to a single caravan (UI: drawn as a small mobile camp).
  - **Camp / Mission** — one node: Camp → Deployment → Battle → Resolution (D3),
    unchanged.
  - **A caravan is a persistent, typed, upgradeable vessel** bundling **party slots +
    storage (the D14 cap) + loaded supplies + locked equipment**. You own a **stable**
    of them on a size/speed/cost/capacity axis (*scout cart* ↔ *supply train*); pick
    the right vessel per quest. The Merchant raising storage (D14) becomes "upgrade a
    caravan's capacity." The caravan doubles as the **overworld camp** visual.
  - **Slots are UNIFORM** — any character fits any slot — so bringing a baker genuinely
    costs a warrior; caravan *size* is the only dial. (Role-segmented slots rejected:
    they make support picks "free" and kill the tension.)
  - **Three on-theme scarcities** this layer creates: **slots** (baker-vs-warrior),
    **the vessel** (which wagon's capacity), **locked equipment** (gear committed to one
    caravan is unavailable to others — can't field one good sword twice).
- **Spec:** [`docs/design/systems/guild.md`](../../docs/design/systems/guild.md),
  [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md).
- **Superseded by:** —

## D26 — Run model & parallel adventures: one shared guild, two feeds, serial play

- **Status:** Decided (design pass, 2026-06-06)
- **Context:** How do **campaign** and **endless** relate, and how do "multiple
  adventures at once" work atop a synchronous node loop (`run.ts` holds exactly one
  map + position)?
- **Options considered (time model):** A **global guild clock** (interleaved) / B
  **focus-one, background the rest** (auto-resolve) / C **sequential with shared
  standing state**.
- **Decision:**
  - **ONE shared persistent guild** (one roster, one armory, one progression).
    Campaign and Endless are two **content feeds**, not separate saves. Accepted
    tradeoff: story-earned and sandbox-earned progress share a save (revisit cosmetic
    separation only if it feels muddy).
  - **A quest board** makes the two feeds concrete: **main quest** (campaign spine +
    ending) → **authored sidequests** (finite hand-made pool) → **repeating generated
    sidequests** (the infinite "endless" tail). The board is never empty, so idle
    caravans always have somewhere to go. Parallelism is **asymmetric** — one main
    thrust + a renewable side stream (Darkest Dungeon / Three Houses shape), not
    symmetric juggling.
  - **Model C — commitment parallel, play serial.** Commit people + gear across
    several caravans at once (the lock = the portfolio cost), but **play one caravan
    through at a time**; the guild clock advances between dispatches. Every fight stays
    hand-played. **Auto-resolve is rejected** — it dilutes the hand-played tactical
    core (the crown jewel). Clear path to graduate toward an interleaved global clock
    (model A) later.
  - **Dispatched-but-unplayed caravans WAIT** (paused at their node) — they don't tick
    a clock or auto-resolve.
  - **Code shape:** a **`Guild` owns N run states**; today's single map + position
    becomes one of many.
- **Spec:** [`docs/design/systems/guild.md`](../../docs/design/systems/guild.md),
  [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md).
- **Superseded by:** —

## D27 — Stakes via permanent loss: unkillable guild + Fire-Emblem lords

- **Status:** Decided (design pass, 2026-06-06) · resolves the M7-deferred
  terminal-*meaning* design
- **Context:** What does failure mean now there's a persistent guild? The M7 endings
  ship functional, but their *meaning/rewards* were deferred.
- **Decision:**
  - **The guild never hard-fails** — there's always a cheap repeating sidequest to
    rebuild, so stakes come from permanent **losses**, not a fail screen. Two loss
    tiers already exist: **mission loss** per node (D13/D21) and **caravan wipe** =
    lose that caravan's people (permadeath) + its locked gear; the **guild survives**
    (Darkest Dungeon / Battle Brothers stakes).
  - **EXCEPT 2–3 named campaign "lords"** (Fire-Emblem-style): a lord dying *during the
    campaign* is **game-over → reload last save** ⇒ implies a **save system** for the
    campaign. An optional **hardcore/ironman** mode makes even that permanent (no
    reload). A lord in a caravan that wipes = game-over, so risking a lord on a deep
    node is a real gamble.
  - **Endings:** campaign-complete = clear the **main quest** (epilogue + unlocks that
    seed Endless); campaign-defeat = a **lord falls**; **Endless = depth/score, no
    terminal**, no lords.
- **Spec:** [`docs/design/systems/guild.md`](../../docs/design/systems/guild.md),
  [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md) (Run
  terminals).
- **Superseded by:** —

## D28 — Overworld currency is gold; no physical rations (confirms D15)

- **Status:** Decided (design pass, 2026-06-06) · also resolves the parked
  "rations-as-routing-currency" idea
- **Context:** Does travel/rest spend a **physical ration item** or **gold**? The
  parking-lot notes floated rations as the routing currency; this resolves it the
  other way, preserving D15's restraint.
- **Decision:** **Travel and rest are paid in GOLD; D15 stands — no carried larder,
  no spoilage.** Food stays a gold **Upkeep** line. ⇒ **gold is the universal
  solvent**: travel, rest, provisioning, gear, bribes, debt all draw one pool, so the
  overworld is an **economic routing problem** ("can I afford this route + a rest?").
  Caravan **storage still gates gear/ammo/consumables** (D14/D20) — just not food.
  **Consequence:** the faucet/sink balance (D30) matters *more* — a slack economy
  trivializes the map. (Supersedes the note's "rations as routing currency" in favour
  of gold.)
- **Spec:** [`docs/design/systems/logistics.md`](../../docs/design/systems/logistics.md)
  (Upkeep), [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md).
- **Superseded by:** —

## D29 — The overworld is a data-driven hook surface; abilities declare their limiter

- **Status:** Decided (design pass, 2026-06-06) · **provisional** on the limiter menu
- **Context:** Classes want to *act* on the overworld (Merchant hikes to town, mage
  scries for intel). The combat tier is already a hook surface (D3/D4); the overworld
  should be its twin rather than a difficulty menu.
- **Decision:** **The overworld is a second hook surface with its own action economy**
  (denominated in **node-steps / cooldowns**), alongside the combat CT clock (D5). An
  overworld ability is **data declaring a phase + a cost**, drawn from a deliberately
  **short limiter menu** (D15 restraint):
  - **Fatigue / exhaustion (NEW per-character meter)** — a single **shared** stamina
    meter overworld actions spend and **rest restores** (gives rest a second job; fits
    the caravan-as-people fantasy). E.g. the Merchant *can* hike to town, but not night
    after night. Keep it **one meter, not per-ability**.
  - **Vancian charges** — spells with overworld effects (scry for intel, forage) spend
    castings from the D17 pool. Magic unified across tiers.
  - **Node-refresh / gold cost / step-cooldown** — for whatever else fits.
- **Spec:** [`docs/design/systems/stats.md`](../../docs/design/systems/stats.md)
  (Fatigue), [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md),
  [`docs/design/systems/magic.md`](../../docs/design/systems/magic.md).
- **Superseded by:** —

## D30 — The gold economy: one verb per economy class + an active theft vector

- **Status:** Decided (design pass, 2026-06-06)
- **Context:** With gold as the master currency (D28), the economy classes risk being
  three flavours of "gives gold," and faucets without sinks make **Upkeep (D15)**
  toothless.
- **Decision:** **One distinct verb per economy class, balanced by an active sink.**
  - **Merchant = ACCESS** — markets in the field (basic anywhere via the fatigue-gated
    town-trip, premium at town nodes, better prices everywhere). In-field buys use
    **run gold** (a flow), distinct from the **guild armory** (locked stock).
  - **Banker = TIME-SHIFT + SECURE** — buy-on-debt (auto-repaid from future gold),
    passive **financial** interest, and **theft protection**.
  - **Noble = INFLUENCE** — bribe enemies to turncoat / sway-avoid fights (leans on the
    D24 intel preview) **+ *political* income** (patronage, town levies, stipend,
    reputation) — deliberately distinct from the Banker's *financial* interest so the
    two aren't redundant faucets.
  - **Active theft vector (the sink-side partner):** pilfering is a real risk —
    **thief/bandit event nodes** skim gold on the overworld **and** a
    **gold/item-stealing enemy archetype** mid-battle — which is what gives the Banker's
    protect/debt/interest kit teeth (a live faucet↔risk loop). Cost = a thief enemy +
    theft events (fits the next event-node batch, D23).
- **Spec:** [`docs/design/systems/logistics.md`](../../docs/design/systems/logistics.md)
  (Economy), [`docs/design/systems/overworld.md`](../../docs/design/systems/overworld.md).
- **Superseded by:** —

## D31 — Support units on the battle map + the defendable supply wagon

- **Status:** Decided (design pass, 2026-06-06)
- **Context:** Non-combat classes should be physically present as a "resource to
  protect," but classic escort gameplay is famously tedious (the Fire-Emblem "keep the
  green unit alive" groan).
- **Options considered:** opt-in fielding / always on the field / abstracted off-map.
- **Decision:** **Support classes are ALWAYS on the combat map, guarding a defendable
  supply wagon.**
  - The caravan's **supplies are an on-map asset** — a wagon/camp object modeled as a
    **D4 field entity** (position + state) that can be attacked and defended, and it is
    the **in-combat target of the D30 thief archetype**. "Protect your investment"
    becomes a concrete *defend-the-wagon* objective, not a vague escort.
  - **Support units deploy far back near the wagon and are low enemy-targeting priority
    by default** → not a constant babysit; the escort tension only spikes on a real
    threat. **Positional abilities:** strong in their home zone, weak if dragged out
    (e.g. **Chef by the campfire = bonus damage / hot-pan attack**) — the campfire
    literally on the battle map is a title callback and ties to the overworld-camp
    visual.
  - **Rule to pin:** enemy AI **deprioritizes** non-combat units + the wagon **except
    the thief archetype**, which actively seeks the supplies — that exception *is* the
    bodyguard gameplay.
- **Spec:** [`docs/design/systems/field-entities.md`](../../docs/design/systems/field-entities.md)
  (supply wagon), [`docs/design/02-deployment.md`](../../docs/design/02-deployment.md),
  [`docs/design/03-combat.md`](../../docs/design/03-combat.md).
- **Superseded by:** —

## D32 — Secondary classes (FFT-style) & non-combat leveling

- **Status:** Decided (design pass, 2026-06-06)
- **Context:** Characters should gain versatility via a second class, and non-combat
  classes need a way to level without fighting.
- **Options considered:** simultaneous dual-class (both active, growth split) /
  FFT-style primary + slotted secondary subset.
- **Decision:**
  - **FFT job model:** one active **primary** (defines stats/growth) + a **slotted
    subset** of a secondary class's abilities, re-arranged at the guild. More
    balance-controllable than simultaneous dual-class (a weaker slot-saver, accepted) —
    and it ties the secondary into the same slot economy (versatility per slot).
  - **Leveling:** **secondary** abilities level through **use** (slower — the primary is
    mostly active). **Non-combat jobs** level via a **passive trickle WHILE DEPLOYED +
    a bump per successful ability use** (benched = no growth, so the guild isn't free
    training); **combat jobs** level via combat XP as before. ("Level the secondary by
    using it" and "non-combat use-bonus" are one mechanism.)
- **Spec:** [`docs/design/systems/stats.md`](../../docs/design/systems/stats.md)
  (leveling), [`docs/design/systems/guild.md`](../../docs/design/systems/guild.md).
- **Superseded by:** —
