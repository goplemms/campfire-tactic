# System — Field entities & the trigger bus

> Referenced by: [Deployment](../02-deployment.md), [Combat](../03-combat.md),
> [Resolution](../04-resolution.md). Decision: **D4**.

## Description

Traps, defensive nests, and ritual runes look like three features but are **one
abstraction** (decision D4):

> A **field entity** is a non-unit thing that occupies the map, is **placed during
> [Deployment](../02-deployment.md)**, carries state, and **reacts to battle
> events via a trigger policy**.

Unifying them this way is what keeps the signature prep mechanics cheap to extend:
adding a new placeable is adding **data**, not a new system.

### Anatomy of a field entity

| Field | Meaning |
|---|---|
| `position` | tile(s) it occupies |
| `owner` | which side placed it |
| `state` | armed / sprung / charging / intact, plus charges remaining |
| `trigger` | the **policy** that decides when its effect runs (below) |
| `effect` | what happens when it fires (damage, aura, terrain change…) |
| `durability` | multi-use **charges** (rope snare fires a few times) and whether the material **survives** use (recoverable) or is **consumed** (rune dust) |
| `provenance` | the material it was built from (for recovery in Resolution, **D13**) |

### Trigger policies (the three faces)

- **One-shot on condition** → **Trap.** Listens for `onUnitEnterTile`; fires once
  (damage / status), then is spent.
- **Passive aura** → **Defensive nest.** No event needed; while a unit holds the
  tile it grants cover / range / elevation. Really a **terrain modifier**.
- **Pre-paid charge** → **Ritual rune.** A
  [charged ability](action-economy.md) whose charge was paid in Deployment.
  - **Auto:** resolves when a condition is met (enemy enters AoE).
  - **Manual:** a unit spends its **Act** to detonate now.

### Enemy-owned entities & counterplay (D12)

The `owner` field means entities can belong to the **enemy** too. In **fortified
encounters** (an enemy camp, a defended chokepoint, *any rescue mission* — see
[Deployment](../02-deployment.md)), the enemy pre-places hazards just like you do.
This gives **Intel** and **Awareness** a *defensive* job, not only an offensive one:

- **Detection** — gated by [Intel](intel.md) / Awareness. A **Tier-3** read or high
  Awareness **reveals** enemy entities up front; otherwise they're **hidden until
  sprung** (you find them the hard way).
- **Disarm / avoid** — once seen, a unit may spend an **Act** to **disarm** (the
  Survivalist's defensive mirror of trapping), or simply **route around** it.

**Exemplar enemy entity — the Snare.** Triggers on enter-tile and applies
**Immobilized** for X turns *plus* a **capture countdown** (banded). The countdown
abstracts *enemy reinforcements reaching that spot* — it ticks on its own, no
specific captor modeled. Free the unit (ally **Act** to cut loose, or destroy the
snare) before it expires, or they are **captured** — the *same* captured state as a
Deployment overreach (rescuable sub-objective, [D9](mortality-recovery.md) policy).
This makes **capture a unified mechanic with two entry points**: pre-battle
overreach and in-combat helplessness.

> Implementation note: the snare shows the bus needs to carry **status effects**
> (Immobilized) and tick a **per-unit capture meter** on `onTurnStart` — both cheap
> to account for when M3 builds the bus.

### The trigger bus (the architectural hook)

Combat is built around an **event/trigger bus**. The loop announces moments and
**listeners react**:

- `onTurnStart` / `onTurnEnd`
- `onUnitEnterTile` / `onUnitLeaveTile`
- `onUnitDamaged` / `onUnitDefeated`
- `onChargeResolved`

Field entities are just listeners. So are many other things later (opportunity
attacks, nest auras, Chef buffs applied at battle start). **M3 builds this bus
before any field entity exists** — that's the cheap insurance that stops traps and
runes from becoming bolt-ons. Today the bus may have zero or one listener; the
shape is what matters.

### Lifecycle across phases

```
Deployment: build entity from a provisioned material, place it, register listeners
   Combat:   bus events fire effects; state advances (armed → sprung / detonated)
 Resolution: on a WIN, unsprung+surviving entities (yours AND the enemy's) recovered
```

## Pseudo-example

> **Trap (one-shot on condition).** Bram builds a `trap kit` into a field entity on
> the canyon-mouth tile: `trigger = onUnitEnterTile (enemy)`, `effect = 20 dmg`,
> `state = armed`. In Combat the enemy Vanguard enters that tile → the bus emits
> `onUnitEnterTile` → the trap's listener matches → 20 dmg, `state = sprung`.
>
> **Nest (passive aura).** A Builder raises a nest on a ledge: `trigger = passive`,
> `effect = +2 range, +1 defense while occupied`. No event — when Vale stands on
> it, the aura applies; when she leaves, it lapses. Intact at battle's end → it can
> be recovered.
>
> **Rune (pre-paid charge, manual).** Ember's `fire-rune reagent` becomes an entity
> near the enemy approach: `trigger = manual`, `effect = AoE fire`,
> `state = charging`. It sits idle until, in Combat, freed-Vale spends her **Act**
> to detonate it on the clustered enemies — the charge collapses to zero and fires
> immediately.
>
> **Snare (enemy-owned, in-combat capture).** In a fortified fight, an
> enemy snare sits on a path tile, **undetected** because the party skipped Tier-3
> intel. Rook steps on it → `Immobilized (3)` + a 3-tick **capture countdown**
> starts. Bram spends his next **Act** to cut Rook loose on tick 2 — one turn later
> and Rook would have been **captured**, turning the fight into a rescue.

## Open questions / future scope

- Whether entities can be **stacked/combined** (a rune *inside* a nest?) is a
  tempting depth lever, deferred.
- The first real implementation lands the **bus + registry** in M3 and the first
  data-defined entity (the Survivalist trap) in M4–M5.
