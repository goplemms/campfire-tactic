# System — Logistics & inventory

> Referenced by: [Pre-deployment](../01-pre-deployment.md),
> [Deployment](../02-deployment.md), [Resolution](../04-resolution.md).
> Decision: **D6**. This is the game's **headline pillar**.

## Description

Most tactics games treat what you bring to a fight as an afterthought. Here it is
the **point**. Logistics is the connective tissue that makes the signature jobs
matter and gives the crunch player a deep optimization loop that spans the whole
run, not just the grid.

> **Design principle — wide logistics, micro at the unit.** Logistics lives at the
> **party/macro** level: broad, shared pools and provisioning decisions. The
> fine-grained, turn-to-turn micro-management lives at **unit control** (positioning,
> action economy, deployment placement, recovery triage). This split is *why*
> storage is one shared stash rather than per-unit bags, and it pre-answers many
> "shared vs. per-unit" forks.

### Two tiers of logistics

| Tier | Phase | Nature |
|---|---|---|
| **Resource logistics** | [Pre-deployment](../01-pre-deployment.md) (off-map) | What you *own and carry*: buy/sell, load ammo & materials, cook rations. |
| **Spatial logistics** | [Deployment](../02-deployment.md) (on-map) | Where you *commit* it: place materials as field entities against terrain, under a risk gamble. |

The link between them is the **provisioning constraint**: you cannot place in
Deployment what you did not carry from Pre-deployment, and you cannot carry more
than **storage** allows. Resource logistics gates spatial logistics gates Combat.

### Core nouns

- **Storage** — the master cap on everything carried: **one party-wide shared
  stash** of discrete **slots**, sized by the **Merchant** in clean bands (`+2
  slots`). Items pack by **slotted stacks (D14)**: each material defines a
  `stackSize` (arrows stack, e.g. 6/slot) and a `slotCost` (most items 1 slot; bulky
  ones like nest lumber may cost 2). Scarce by design; the central tension is *what
  competes for slots*.
- **Materials** — the build inputs for [field entities](field-entities.md):
  `trap kit`, `rune reagent`, nest lumber, etc. Each has **durability**: multi-use
  **charges** (a rope snare fires a few times) and whether its material **survives**
  use (recoverable) or is **consumed** (rune dust, gone). **Recovery (D13)** is
  outcome-gated and whole-field: **win** → reclaim every unsprung, intact, surviving
  entity — *including the enemy's* (salvage); **flee/lose** → nothing. See
  [Resolution](../04-resolution.md).
- **Ammo** — consumed by ranged units/abilities in Combat. **(Open — dedicated
  follow-up.)** The design tension: spent ammo should matter, but a ranged unit that
  feels *useless* once empty is bad. Per-unit vs. shared pool, and the empty-feels-bad
  balance, are deferred to their own discussion; a possible **Survivalist salvage
  perk** (retrieve a higher % of spent ammo) rides on whatever we choose.
- **Rations** — the **Chef's** input; cooked into morale and banked heals.
- **Gold** — earned in Resolution (Merchant bonus), spent in Pre-deployment.

### The loop (why it's a pillar, not a chore)

```
Pre-deployment: spend gold + storage to provision (blind-ish to the fight)
   Deployment:  commit materials spatially, gambling time/exposure
     Combat:    consume ammo, spring traps, detonate runes
   Resolution:  win → recover unsprung (incl. enemy salvage); earn gold; deduct spend
        ↺       re-provision smarter next time
```

Every arrow fired and every unsprung trap recovered is a number the optimizer can
chase. The Merchant's storage stat is the master dial that loosens the whole
system.

## Pseudo-example

> **8 storage slots.** Heading into a canyon, the player loads `2 × trap kit`,
> `12 × arrow`, `1 × rune reagent`, `3 × rations` → **8/8 full**. They *wanted* a
> second rune but had no room — a direct cost of skipping the Merchant's storage
> upgrade.
>
> - **Deployment:** both trap kits placed; rune placed (Vale captured doing it).
> - **Combat:** Vale fires 12 arrows (now **0 ammo** — she finishes the fight in
>   melee); both traps spring; the rune is detonated.
> - **Resolution:** party held the ground → the **1 unused trap kit** and **1
>   uneaten ration** are **recovered**; `12 arrows / 1 trap kit / 1 rune reagent`
>   are deducted; **+180 gold**.
>
> Next Pre-deployment, the player can finally afford the **+2 storage upgrade** —
> and now there's room for that second rune.

## Open questions / future scope

- Slot model is **resolved** (D14): party-wide shared stash of slotted stacks
  (`slotCost` + `stackSize`), Merchant sizes it in bands.
- **Ammo** (per-unit vs. shared pool + the "empty ranged feels bad" balance) is
  parked for a **dedicated follow-up** (the wide-logistics principle leans it toward
  a shared pool, but the balance question stays open).
- Whether materials degrade/spoil over a run (a logistics-pressure lever) is an
  attractive option — **Q8, up next.**
- First real implementation: the inventory/materials model is its own milestone
  (see the build plan), targeted around M5.
