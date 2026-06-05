# System — Vision & fog of war

> Referenced by: [Combat](../03-combat.md) (targeting), [Deployment](../02-deployment.md)
> (concealed/infiltration deploys), [Intel](intel.md) (pre-battle twin),
> [Stats](stats.md). Decision: **D18**.

## Description

Combat has **symmetric fog of war** — each side sees only what its units perceive.
It's the **in-battle twin of [Intel](intel.md)**: same "lift the fog" fantasy, at
combat timescale. Terrain shape is always known; what fog hides is **enemy units and
undetected enemy [field entities](field-entities.md)** (D12).

### The information ladder (banded)

| State | You know | How |
|---|---|---|
| **Hidden** | nothing (or a **last-seen ghost** if previously spotted) | out of all perception |
| **Pinged** | a presence is **there** — location, *not* identity | **Awareness** sense: a radius that **ignores line-of-sight** (you feel them through a wall) |
| **Seen** | full info (who, stats, facing) | **sight radius + line-of-sight** (terrain/elevation block it) |

**Ghost markers:** spot an enemy, then lose them, and you keep a *last-seen* marker —
ducking into fog is a feint, not teleportation.

### Two senses

- **Sight** — per-unit **radius + LoS**; blocked by terrain/elevation. Grants **Seen**
  (full identification). Elevation now buys vision on top of combat.
- **Awareness ping** — a sense radius that **ignores LoS** and grants **Pinged**
  (presence/location, no identity). This is Awareness's **in-combat** role (it was
  deployment-only); a high-Awareness party is simply *harder to sneak up on*.

### Interactions

- **Concealment payoff:** a unit that breaks from **Hidden** lands an **ambush bonus**
  (first strike from concealment hits harder) — what makes infiltration worth the
  risk. Being **Pinged** *partially defuses* the ambush (they knew you were there);
  being **Seen** removes it.
- **Targeting:** direct attacks/casts require **Seen**. **AoE** can hit any tile you
  perceive — including a **Pinged** blip (lob it at the presence, hope for the best) —
  but you can't cleanly *direct-target* an unidentified thing.
- **Intel tie-in:** a **Tier-3 intel** read (enemy positions) grants **starting
  vision** of the enemy's deployment — pre-battle investment buys an early sight edge
  you then have to maintain.

### M3 implication

Adds a **visibility layer** over the grid, recomputed per side each turn (Hidden /
Pinged / Seen + ghosts), which the trigger bus consults for **targeting** legality.
Worth building into M3's foundations, not retrofitting.

## Pseudo-example

> - **Rogue** infiltration-deploys into fog and stays **Hidden**; when she strikes,
>   it's an **ambush** (bonus damage).
> - **Archer** has a flier in **sight + LoS** → **Seen** → fires a clean shot.
> - A high-**Awareness** scout **pings** a blip *behind a wall* — knows *something's*
>   there but not what; the mage **AoEs the tile** on spec rather than direct-casting.
> - An enemy ducks around a corner → drops from **Seen** to a **ghost marker** at its
>   last tile; the party plays around where it *probably* went.

## Open questions / future scope

- Exact **sight** and **ping** radii (banded), and elevation's vision rules: tuning.
- **Stealth as a stat/trait** (some units harder to spot / better sight): **deferred**
  — the player wants to think it over.
- Whether a **Pinged** contact upgrades to **Seen** by closing distance / gaining LoS
  (assumed yes): confirm at implementation.
