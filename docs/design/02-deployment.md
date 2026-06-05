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

### The exposure model — two-stage and spatial (D11)

Risk has **two axes — *how many* you place and *where* you place them** — unified
into a two-stage model. It is fully **banded and shown on the board** (no hidden
rolls):

**Stage 1 — the safe period.** Your first placements (the **safe allowance**, sized
in bands by Awareness) carry **zero risk**, anywhere on your side. The enemy's
scouts haven't arrived yet.

**Stage 2 — the danger gradient.** Once the safe period ends, every tile shows a
**banded danger reading** that grows with **distance from camp**:

```
   CAMP ░░░░  Safe       (near home — still ~0%)
        ▒▒▒▒  Exposed    (low %)
        ▓▓▓▓  Hunted     (medium %)
   ENEMY████  Cornered   (high % — out by the enemy approach)
```

A placement's capture risk = the **band of the tile it sits on**, read right off the
grid before you commit. So a trap by your own line stays nearly free even late,
while a trap at the enemy's mouth is a real gamble. Resolution is **immediate, per
placement**: put a kit on a *Hunted* tile and the roll happens then and there
(clean feedback, no end-of-phase save-scum).

This unifies the two axes cleanly: **how many** you place spends the window and ends
the safe period (**Speed** = throughput), and **where** you place sets the risk once
you're past safe (**distance bands**).

Two stats drive the gamble (see [Stats](systems/stats.md)):

| Stat | Role in Deployment |
|---|---|
| **Awareness** | **Safety, two ways:** a longer **safe period** *and* it pushes the danger gradient **farther out** (gentler bands for that unit). You spot the scouts coming. |
| **Speed** | **Throughput.** More placements / more range before the window closes. (Also the unit's Combat CT stat.) |

High party **morale** can nudge the safe period longer (confident troops set up
bolder) — see [morale](systems/morale.md). And a **Tier-3 [intel](systems/intel.md)**
read (enemy *positions*) reveals where the gradient bites hardest — so investing in
intel makes placement safer and smarter, a deliberate cross-reinforcement of the
prep systems.

A unit may instead **hold position**: place nothing, take **zero risk**, and be
**ready** (well-positioned, full kit) when Combat starts. Deployment is therefore
opt-in per unit: *prep (more setup, more risk)* vs. *hold (safe, no setup)*.

### Capture — the cost of overreach

If a Stage-2 placement gamble fails, the unit is **captured**. A captured unit:

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

### Enemy prep — fortified encounters (D12)

Prep isn't only yours. **Fortified encounters** (an enemy camp, a defended
chokepoint, *every rescue mission*) have the enemy pre-place hazards too — while
open-field scraps and ambushes don't. This makes enemy prep a *flavor of encounter*
rather than a universal tax, and it gives your **Intel/Awareness** a defensive job:

- **Detection** of enemy entities is gated by [Intel](systems/intel.md) / Awareness
  (Tier-3 or high Awareness reveals them; otherwise hidden until sprung).
- **Disarm** costs an **Act** (the Survivalist's defensive side) — or just route
  around what you've spotted.
- The exemplar enemy entity is the **Snare**, which can drag a unit into **capture
  mid-battle** — see [field-entities](systems/field-entities.md).

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
> 1. **Bram** (Survivalist, **high Awareness**) has a **long safe period** and his
>    Awareness pushes the gradient outward. He plants **both trap kits** on the two
>    chokepoint tiles while still in his safe period — both read **Safe (~0%)**. No
>    risk taken, two traps armed.
> 2. **Vale** (Scout, **high Speed**, modest Awareness) wants to pre-place the
>    **fire rune** deep near the enemy approach *and* move to a ledge. Her short
>    safe period ends after the move; the **rune** would sit on a **Hunted** tile
>    reading **35% capture**. The player gambles for the value. ✗ — Vale is
>    **captured**.
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

- Exposure model is **resolved** (D11): two-stage (safe period → distance-from-camp
  danger gradient), banded, shown on the board, immediate per-placement resolution;
  Awareness lengthens the safe period *and* pushes the gradient out. Only exact band
  %s and distances are tuning.
- Enemy-prep symmetry is **resolved** (D12): A3 fortified-encounter type;
  Intel/Awareness-gated detection; Act-cost disarm or route-around; the Snare drags
  units into in-combat capture. See [field-entities](systems/field-entities.md).
- Guard composition for captured units (how hard a rescue is) is encounter-driven;
  generation rules come with the run loop (M6).
