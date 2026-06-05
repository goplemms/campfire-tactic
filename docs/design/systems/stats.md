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

#### Intelligence *(working name)*

- **Intel:** seeds the party's free **[Intel](intel.md) floor** — the baseline tier
  of pre-battle knowledge (types → numbers → positions) the party reads without
  paying. A *different* stat from Awareness, held by *different* archetypes.
- **Naming note:** "Intelligence" may collide with a future magic-power stat; treat
  it as provisional (candidates: Insight, Lore, Cunning). The role is settled.

### The deliberate split

Two prep stats that deliberately don't overlap, plus the clock stat:

| | **Awareness** | **Intelligence** | **Speed** |
|---|---|---|---|
| Deployment | *how safely* you prep | — | *how much* you prep |
| Pre-battle | — | *how much you see* (intel floor) | — |
| Combat | — | — | turn frequency + charge speed |

This gives real archetype spread: a **Survivalist** is high-Awareness (preps
safely) but modest-Intelligence; a **Diplomat / Noble** is high-Intelligence (great
intel) but modest-Awareness; a **fast scout** crams in placements but lives on the
edge of capture.

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
> Bram (Speed 4) and lands charged effects sooner. Meanwhile, back in camp, the
> **Noble** (high Intelligence, low Awareness) contributes nothing to placing traps
> safely but hands the party a free **Tier-2 intel** read on the coming fight.

## Open questions / future scope

- The full combat stat block (HP/attack/defense/range/move) is defined with M3.
- Intel is **resolved** — it is its own stat (Intelligence) feeding the three intel
  lanes; see [intel](intel.md) (D10). The stat *name* remains provisional.
- Stat growth/leveling across a run: deferred to the run-loop milestone (M6).
