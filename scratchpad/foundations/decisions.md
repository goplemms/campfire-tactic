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
