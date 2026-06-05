# Phase 1 — Pre-deployment (Meta / world menu)

> Pipeline position: `[PRE-DEPLOYMENT] → Deployment → Combat → Resolution`
> Related systems: [Logistics & inventory](systems/logistics.md),
> [Stats](systems/stats.md)

## Description

Pre-deployment is the **off-map, interstitial space** — a world/camp menu, *not*
the battlefield. It is where the game's **resource logistics** live. Nothing here
touches the grid; instead, the player decides *what they will be able to do later*
by spending gold, storage, and time on provisioning.

This phase is the **constraint layer**. Everything you can do in Deployment and
Combat is gated by what you provisioned here. It is also where the non-combat jobs
that don't act on the map do their work:

- **Merchant** — buy/sell equipment, generate gold, and (crucially) **set how
  much storage** the party has. Storage is the master cap on everything carried.
- **Chef** — **cook**, converting rations into party **morale** and a banked
  between-battle **heal/buff** that the squad carries into the next fight.
- **Quartermaster role (any unit)** — **load the loadout**: distribute ammo, trap
  kits, rune reagents, and rations into limited storage slots.

The output of this phase is a **locked loadout**: the concrete set of consumables
and equipment the party carries into Deployment. Once you commit and head to the
map, you cannot return to the shop — you fight with what you brought.

Key tensions a crunch player optimizes here:

- **Storage is scarce.** Arrows compete with trap kits compete with rations. The
  Merchant's storage stat is the dial that loosens this.
- **Provisioning is blind-ish.** You commit *before* (or with only partial intel
  of) the battlefield, so you're betting on what you'll need. Awareness/scouting
  can buy you a preview (see [Stats](systems/stats.md)).
- **Spend now vs. bank.** Gold spent on consumables is gold not saved for a key
  piece of equipment later in the run.

## Pseudo-example

> The party returns to camp after a fight with **240 gold** and **8 storage
> slots**. The next encounter is rumored to be a narrow canyon (partial intel
> from Bram's Awareness).
>
> 1. **Merchant.** The player sells salvaged scrap (+60g → 300g) and considers a
>    storage upgrade (+2 slots for 150g) but holds off — too expensive this early.
> 2. **Loadout.** With 8 slots and a canyon ahead, the player loads:
>    - `2 × trap kit` (2 slots) — chokepoints love traps,
>    - `12 × arrow` (2 slots) — Vale's ammo for the fight,
>    - `1 × fire-rune reagent` (1 slot),
>    - `3 × rations` (3 slots).
>    Storage is now **full (8/8)**. The player *wanted* a second rune but has no
>    room — a direct consequence of not buying the storage upgrade.
> 3. **Chef.** Cooks 2 rations into a **hearty stew**: party morale +1 and a
>    banked **squad heal** (small HP restore applied at the start of next battle).
>    One ration is kept in reserve.
> 4. **Commit.** The player locks the loadout and advances to **Deployment**. The
>    canyon map loads; the shop is now closed for this encounter.

## Open questions / future scope

- Exact morale model (what morale *does* mechanically) is TBD.
- Equipment depth (weapon types, slots, upgrades) is deferred — this phase
  establishes the *logistics frame*, not a full RPG inventory yet.
- Whether scouting/intel is a purchasable action here or a passive of Awareness is
  noted in [Stats](systems/stats.md) and not yet decided.
