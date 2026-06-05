# System — Action economy (the CT clock)

> Referenced by: [Combat](../03-combat.md), [Deployment](../02-deployment.md)
> (initiative seed). Decision: **D5**.

## Description

Combat runs on an **FFT-style continuous Charge-Time (CT) clock**, not discrete
rounds. This is the deliberate choice (decision D5) that makes prepared,
**charged** effects — especially ritual runes — first-class.

### The clock

- Every unit has a **Speed** stat and a hidden **CT** gauge.
- The clock advances in **ticks**. On each tick, every unit's `CT += Speed`.
- When a unit reaches **`CT ≥ 100`**, the clock pauses and that unit takes an
  **active turn**: it may **Move** and **Act** (in either order).
- After the turn, CT is **spent down** — **acting costs more than only moving** —
  and the clock resumes.

Consequence: Speed isn't merely "go first"; it's **how often you act** and **how
fast your charged effects land**.

### Charged vs. instant abilities

- **Instant** abilities resolve on the unit's turn (a basic attack, a step).
- **Charged** abilities do **not** resolve on the caster's turn. Casting only
  **schedules** the effect on the timeline with its own charge gauge; the clock
  keeps ticking, other units act, and the effect **resolves later** when its gauge
  fills. Powerful effects are therefore **committed in advance and can be played
  around** (the target may move out of the AoE before it lands).

### Tie-in: runes are pre-paid charges

A ritual rune (see [field-entities](../systems/field-entities.md)) is exactly a
**charged ability whose charge was paid during [Deployment](../02-deployment.md)**
instead of as a battle turn. It is already on the field at `t=0`:

- **Auto-trigger** = resolves on a *condition* (enemy enters its AoE).
- **Manual-trigger** = a unit spends its **Act** to collapse the charge and
  detonate **now**.

### Initiative seed

Each **side** starts Combat with a **CT seed** derived from its **deployed,
non-captured** units' Speed (set in [Deployment](../02-deployment.md)). Losing a
unit to capture lowers the seed, handing the enemy earlier turns — the concrete
"prep vs. readiness" tension.

> All numbers in these docs are **illustrative**; exact tick rates, CT spend-down
> costs, and per-ability charge times are tuning values, not commitments.

## Pseudo-example

> Speeds — Rook 10, Vale 9, Ember 7. All CT start at 0.
>
> | Clock | Rook | Vale | Ember | What happens |
> |------:|:---:|:---:|:---:|---|
> | t=10 | **100** | 90 | 70 | Rook → **turn** (move + attack). CT spent → 0 |
> | t=12 | 20 | **108** | 84 | Vale → **turn**, fires a shot (instant). CT spent → 8 |
> | t=15 | 50 | 35 | **105** | Ember → **turn**, casts *Fireball* on tile X. **Doesn't fire** — a charge is scheduled (~3 ticks). Ember → 0 |
> | t=17 | 70 | 53 | 14 | clock ticks… the enemy on tile X **walks off it** |
> | t=18 | 80 | 62 | 21 | *Fireball* gauge fills → **resolves on tile X**, now empty. **Whiff.** |
>
> The last row is the personality of the system: slow, strong effects are
> telegraphed and counter-playable. A **rune** sidesteps the whiff risk for
> *manual* detonation (resolve exactly when you choose) at the cost of having been
> provisioned and placed ahead of time.
