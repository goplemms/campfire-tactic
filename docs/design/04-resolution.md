# Phase 4 — Resolution

> Pipeline position: `Pre-deployment → Deployment → Combat → [RESOLUTION] ↺`
> Related systems: [Logistics & inventory](systems/logistics.md)

## Description

Resolution closes a battle and **feeds the next** [Pre-deployment](01-pre-deployment.md).
It is short but it is where the **logistics loop completes** — the consequences of
provisioning and prep are tallied and folded back into the run.

It resolves four things:

1. **Material recovery.** If the party **held the ground**, **unsprung** field
   entities (traps not triggered, runes not detonated, nests intact) are
   **recovered** to storage for reuse. Lose/retreat and they're forfeit. This makes
   over-provisioning recoverable but holding the field rewarding — see
   [logistics](systems/logistics.md).
2. **Capture outcomes.** Allies **rescued** during Combat return to the roster
   normally. An ally **still captured at battle's end is lost** (permadeath). This
   is the final settling of the Deployment gamble.
3. **Rewards.** Loot, gold (boosted by the **Merchant**), and any encounter-specific
   spoils. Consumables actually spent (arrows fired, traps sprung) are deducted —
   the fight's true logistics cost is realized here.
4. **Morale & state.** Outcomes adjust party **morale** (a clean rescue lifts it; a
   lost unit drops it), and the **Chef's** banked buffs are reconciled. Run state
   (survivors, inventory, gold, seed position) advances.

The output is an updated **run state** that becomes the starting condition for the
next Meta/Pre-deployment phase, until the run ends in victory or death.

## Pseudo-example

> Continuing from Combat: the party won the canyon fight and **held the ground**.
>
> 1. **Material recovery.** Both traps **sprung** (gone). The fire rune was
>    **detonated** (gone). But `1 × ration` was never eaten and **1 spare trap kit**
>    was never deployed — both **recovered** to storage.
> 2. **Captures.** Vale was **rescued** mid-fight → she returns to the roster
>    unharmed (if she'd been left bound at battle's end, she'd be **dead**).
> 3. **Rewards.** Loot + **180 gold** (Merchant bonus applied). Spent consumables
>    (`12 arrows`, `2 trap kits`, `1 rune reagent`) are deducted from the ledger.
> 4. **Morale & state.** The rescue lifts party **morale +1**; the Chef's banked
>    stew heal was consumed at battle start, so it clears. Run state updates: 4
>    survivors, storage now holding the recovered ration + trap kit, 180g added.
>
> Control returns to **Pre-deployment** for the next encounter — now with a little
> more gold and a recovered trap kit to re-provision around.

## Open questions / future scope

- Whether recovery is all-or-nothing on "held the ground" or partial/percentage:
  TBD.
- How morale concretely feeds back (buffs? unit availability? shop prices?) is
  tied to the morale model, still open.
- Full run-state persistence, seeding, and the death screen come with the
  roguelike run loop (milestone M6).
