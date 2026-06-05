# Phase 2 — Deployment ("earlier that day", on-map)

> Pipeline position: `Pre-deployment → [DEPLOYMENT] → Combat → Resolution`
> Related systems: [Field entities & the trigger bus](systems/field-entities.md),
> [Stats](systems/stats.md), [Action economy](systems/action-economy.md)

## Description

Deployment is the **on-map "earlier that day"** phase: the party arrives at the
battlefield ahead of the enemy and sets up. This is **spatial logistics** — using
the materials provisioned in [Pre-deployment](01-pre-deployment.md) to place
**field entities** (traps, defensive nests, ritual runes — see
[field-entities](systems/field-entities.md)) against the real terrain.

It is **not** a free setup phase. It is a **per-unit push-your-luck time gamble.**
The enemy has advance scouts; the longer a unit lingers preparing, the greater the
chance it is caught out of position.

### The exposure model (transparent, not a hidden roll)

Each unit that *participates* in prep has a visible **exposure meter**:

- A **safe allowance** — placements inside it carry **no risk**.
- An **overdraw zone** — each placement past the allowance adds a **shown,
  escalating capture risk**.

The point of the gamble is that the danger is *legible*: the player sees "place a
3rd trap → 35% capture" and chooses to push or not. No surprise coin-flips.

Two stats drive the gamble (see [Stats](systems/stats.md)):

| Stat | Role in Deployment |
|---|---|
| **Awareness** | **Safety.** Bigger safe allowance; lower exposure added per overdraw placement. (You spot the scouts coming.) |
| **Speed** | **Throughput.** More placements fit in the window before it closes. (Also the unit's Combat CT stat.) |

High party **morale** can nudge the safe allowance upward (confident troops set up
bolder) — see [morale](systems/morale.md).

A unit may instead **hold position**: place nothing, take **zero risk**, and be
**ready** (well-positioned, full kit) when Combat starts. Deployment is therefore
opt-in per unit: *prep (more setup, more risk)* vs. *hold (safe, no setup)*.

### Capture — the cost of overreach

If an overdraw gamble fails, the unit is **captured**. A captured unit:

- still **appears on the battlefield**, but **bound/guarded** under enemy control;
- does **not** count toward your **active fielded count** (effective **−1**);
- is **removed from your side's initiative seed** (see below), so the enemy gets
  earlier turns;
- may be **out of position / underequipped** from whatever it half-finished.

Capture is **recoverable**: a captured unit is a **rescue sub-objective** on the
map. Reaching and freeing them mid-Combat turns the **−1 back into +1**. A unit
**still captured when the battle ends** is *not* instantly lost — it becomes a
**rescue follow-up quest** whose harshness scales with difficulty (see
[mortality-recovery](systems/mortality-recovery.md), D9). This keeps the gamble
dramatic without being a blind death roll, and only *abandoning* the rescue
ultimately loses the unit.

> **Scenario modifier — ambush in reverse.** A rescue mission is a *disadvantaged*
> battle: the enemy knows you're coming, so the rescuing party fights with
> **reduced Deployment**. This "reduced-Deployment" modifier is reusable for any
> encounter where you're the one caught out.

> Emergent payoff: your *own* greedy prep authors the battle's objectives. A
> captured ally is a fight you created by overreaching.

### Initiative seeding (link to the CT clock)

Combat uses a per-unit [CT clock](systems/action-economy.md), but each **side**
gets a **starting CT seed** computed from its **deployed, non-captured** units'
Speed. Two consequences:

- Heavy, greedy prep that gets a unit captured **lowers your seed** → the enemy
  acts first. This is the **"prep vs. readiness"** dial in concrete form.
- A side that mostly **held position** starts the clock **warmer**.

### Output of the phase

Deployment hands Combat: the set of **placed field entities**, each unit's
**starting tile**, any **captured** units (and their guards), and the **initiative
seed** for both sides.

## Pseudo-example

> The canyon map from Pre-deployment loads. The party has `2 × trap kit`,
> `1 × fire-rune reagent`, and Vale's arrows already on her.
>
> 1. **Bram** (Survivalist, **high Awareness**) has a generous safe allowance. He
>    plants **both trap kits** on the two canyon-mouth tiles — both **inside his
>    safe zone**, exposure stays at 0%. No risk taken, two traps armed.
> 2. **Vale** (Scout, **high Speed**, modest Awareness) wants to pre-place the
>    **fire rune** deep near the enemy approach *and* move to a ledge. Her first
>    placement is safe; the **rune** pushes her into **overdraw**: the meter shows
>    **35% capture**. The player gambles for the value. ✗ — Vale is **captured**.
>    - She starts Combat **bound on a ledge tile**, guarded by 2 enemies.
>    - The side is now **3 active + 1 captured**.
>    - Vale's Speed is dropped from the **initiative seed** → the **enemy side
>      will act first**.
> 3. **Rook** (Soldier) and **Ember** (Mage) **hold position** — safe, ready,
>    well-placed behind the trap line.
> 4. **Commit.** Deployment resolves: 2 traps armed at the canyon mouth, 1 fire
>    rune live near the enemy approach, Vale captured on the ledge, enemy holds
>    the initiative. On to **Combat**.

## Open questions / future scope

- Exact exposure curve (linear? accelerating?) and how Awareness scales it: TBD.
- Whether enemies also pre-place hazards (symmetry) and whether Awareness lets you
  **detect** them during your own Deployment: noted, deferred.
- Guard composition for captured units (how hard a rescue is) is encounter-driven;
  generation rules come with the run loop (M6).
