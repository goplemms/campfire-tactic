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
| `provenance` | the material it was built from (for recovery in Resolution) |

### Trigger policies (the three faces)

- **One-shot on condition** → **Trap.** Listens for `onUnitEnterTile`; fires once
  (damage / status), then is spent.
- **Passive aura** → **Defensive nest.** No event needed; while a unit holds the
  tile it grants cover / range / elevation. Really a **terrain modifier**.
- **Pre-paid charge** → **Ritual rune.** A
  [charged ability](action-economy.md) whose charge was paid in Deployment.
  - **Auto:** resolves when a condition is met (enemy enters AoE).
  - **Manual:** a unit spends its **Act** to detonate now.

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
 Resolution: unsprung entities, if the ground was held, are recovered to storage
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

## Open questions / future scope

- Whether entities can be **stacked/combined** (a rune *inside* a nest?) is a
  tempting depth lever, deferred.
- Detection/disarming of **enemy** field entities (symmetry) is noted in
  [Deployment](../02-deployment.md), deferred.
- The first real implementation lands the **bus + registry** in M3 and the first
  data-defined entity (the Survivalist trap) in M4–M5.
