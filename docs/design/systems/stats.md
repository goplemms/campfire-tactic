# System — Stats

> Referenced by: [Deployment](../02-deployment.md), [Combat](../03-combat.md),
> [Action economy](action-economy.md).

## Description

This doc tracks the stats the design has **committed** so far. The full combat
stat block (HP, attack, defense, range, move…) is intentionally **not** nailed
down here — it lands alongside the M3 battle-loop implementation. What's recorded
now are the two stats that the *signature* mechanics depend on, deliberately split
so they don't overlap.

### Committed stats

#### Speed

- **Combat:** drives the [CT clock](action-economy.md). Higher Speed → `CT` fills
  faster → more frequent turns and faster-landing charged effects.
- **Deployment:** **throughput** — how many placements a unit can fit in the setup
  window before it closes.
- **Initiative seed:** a side's starting CT seed is computed from its **deployed,
  non-captured** units' Speed.

#### Awareness

- **Deployment:** **safety** — a bigger **safe allowance** (placements with zero
  risk) and **less exposure added** per overdraw placement. The high-Awareness unit
  is the one who can prep heavily without getting captured.
- **(Candidate) Intel:** Awareness may also buy a **pre-battle preview** of terrain
  / enemy placement, feeding smarter provisioning in
  [Pre-deployment](../01-pre-deployment.md). Whether this is passive or a
  purchasable scouting action is **open**.

### The deliberate split

| | **Awareness** | **Speed** |
|---|---|---|
| Deployment | *how safely* you can prep | *how much* you can prep |
| Combat | (intel, TBD) | turn frequency + charge speed |

This gives real archetype spread: a **slow, sharp** trapper places few things very
safely; a **fast, less-aware** scout crams in a lot while living on the edge of
capture.

## Pseudo-example

> Two units approach the same Deployment window:
>
> - **Bram** — **Awareness 8 / Speed 4.** Large safe allowance: he plants **2
>   traps** with the meter still at **0%**. But low throughput means he can't fit a
>   3rd placement before the window closes. *Few, but safe.*
> - **Vale** — **Awareness 3 / Speed 9.** High throughput: she could attempt **3–4**
>   placements — but her small safe allowance means the **2nd** already pushes her
>   into overdraw (**35%** and climbing). *Many, but risky.*
>
> In Combat the same split persists: Vale (Speed 9) takes turns far more often than
> Bram (Speed 4) and lands charged effects sooner.

## Open questions / future scope

- The full combat stat block (HP/attack/defense/range/move) is defined with M3.
- Whether Awareness's intel role is passive or an action: open.
- Stat growth/leveling across a run: deferred to the run-loop milestone (M6).
