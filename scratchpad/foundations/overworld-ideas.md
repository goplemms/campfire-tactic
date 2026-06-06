# Overworld — captured ideas (parking lot)

> **Status: UNSORTED / NOT YET DECIDED.** This is a holding pen for an in-progress
> design discussion about the **overworld / run-frame** (the part that feels less
> ironed-out than the iso combat map). Nothing here is committed. When an item
> firms up it should graduate to a **decision** (`decisions.md`, D25+) and a spec
> under `docs/design/`. Until then: capture, don't build.
>
> Context: M7 shipped the overworld as a seeded Slay-the-Spire-style layered DAG
> (D22–D24) with `combat`/`rest` nodes. The discussion below is about what the
> run-frame should *become*.

---

## North-star framing (emerging)

- **Run model:** a **designed campaign** *and* an **endless mode**. Both ride the
  same `OverworldMap` data model — endless = `generateOverworld(seed)` (what
  exists); campaign = the **same node/edge model, hand-authored**. The machinery
  underneath (combat/rest nodes, the phase loop) doesn't care which way the map
  was born. Open: what each mode's progression + endings *mean*.

- **The core gap M7 left:** the map borrowed STS's *shape* without STS's *engine*.
  In STS the map means something because every fight feeds the deck and **HP is the
  currency you spend to route**. Campfire has no deck — its equivalent of "deck
  getting stronger" is **roster + stores + gear condition** = **logistics**. So the
  overworld's routing currency should be **supply** (rations/gold/upkeep), making
  the map a campaign-scale logistics-planning problem instead of a difficulty menu.
  This is the headline pillar promoted from per-night provisioning to strategy.

- **Symptom the engine fixes:** today rest is near-pure upside and difficulty ramps
  with depth, so the optimal play is "dodge every fight." Giving rest/travel a
  **supply cost** restores the pull of fights and makes branching a real choice.

---

## The three-tier stack (proposed)

A new **guild-hall** tier on top resolves the old camp/rest/start-node muddle by
giving "home" one clear owner.

```
GUILD HALL    ← persistent home, BETWEEN adventures. Roster pool, armory,
   │            caravan assembly, multiple expeditions in flight.  (NEW)
   ▼
OVERWORLD     ← ONE caravan's adventure: route the layered DAG (what M7 built,
   │            now scoped to a caravan). UI idea: render it as a small camp.
   ▼
CAMP / MISSION ← one node: Camp -> Deployment -> Battle -> Resolution (D3).
```

---

## Guild hall + caravans (the strategic logistics engine)

- **Guild hall**: persistent home base; where the player assembles expeditions.
- **Caravan** = the expedition unit: **party slots + supply/storage vessel + locked
  equipment + supplies**. A natural home for the D14 storage cap (small fast caravan
  carries less; big supply train carries more, slower/costlier).
- **Multiple adventures at once**: spread a *finite* roster + armory across parallel
  risks — a risk-portfolio game ("don't put all your best people/gear in one
  caravan").
- **Three scarcities, all on-theme:**
  - **Slots** — the baker-vs-warrior tension; gives every non-combat job a real
    opportunity cost (today you'd always bring the Chef).
  - **The caravan vessel** — carries the storage cap; "which wagon did I bring."
  - **Locked equipment** — gear lives at the guild, is committed to a caravan, and is
    unavailable until it returns. Can't put your one good sword in two parties.
- **Reframes terminals (answers the deferred "what does a wipe mean"):** a wipe =
  lose *that caravan* (its people + locked gear), **not** game-over. The guild
  persists (Darkest Dungeon / Battle Brothers stakes). Game-over becomes a
  guild-level state (broke / no people).

### Biggest open fork — time model for parallel adventures
The M7 overworld is a **synchronous** node-by-node loop; "multiple at once" forces a
time model. (`run.ts` currently holds exactly one map+position; parallel needs a
`Guild` owning N run states.)
1. **Global guild clock (interleaved)** — advance the guild a "week"; each active
   caravan takes one step; bounce between them. Most strategic, most state/UI work.
2. **Focus one, background the rest** — play one run through; others auto-resolve /
   progress abstractly. Lighter, leans idle/management-sim.
3. **Sequential w/ shared standing state** — "at once" = committed simultaneously
   (people/gear locked across all), but played one at a time before time advances.
   Simplest on top of what exists.

---

## The overworld-economy tier of the class system

**Throughline:** each class earns its caravan slot by acting on a *different tier*.
D3 already does this by mission *phase* (Chef=camp, Survivalist=deployment, ...). The
new frontier is the **overworld tier**, and these class ideas all operate on one
currency — **gold/economy**. So: combat = where tactical class abilities live; the
overworld = where economic class abilities live. Both are hook surfaces.

**New architectural concept to eventually pin as a decision:** the **overworld is a
hook surface with its own action economy, denominated in node-steps (cooldowns).**
This is a *second* action economy alongside the combat CT clock.

### One distinct verb per class (cut redundant gold-givers)
- **Merchant = access** — buy gear in the field; basic anywhere on a cooldown,
  premium/special in towns; better prices in any town. (In-field buys use *run
  gold* — a flow — distinct from the *guild armory* — the locked stock. Keep
  separate.)
- **Banker = leverage** — passive interest, **buy-on-debt** (auto-paid from next
  gold), and **theft protection** (vs. pilfer events/enemies).
- **Noble = influence** — **bribe enemies to turncoat** (a gold *sink* + tactical
  lever; leans on the intel preview to know whom to bribe). NOTE: the proposed
  passive "gold in town" overlaps Merchant/Banker as yet-another-faucet — candidate
  to **cut/shrink** so bribe/diplomacy is the Noble's whole identity.

### Economy discipline — pair every faucet with a sink (else gold goes slack)
Three ideas above are gold **faucets** (Noble income, Banker interest, Merchant
discounts). Too many faucets and gold stops being scarce → **Upkeep (D15), the
central pressure, stops mattering.** Pair them:
- Banker interest (faucet) <-> buy-on-debt interest (sink) + **a thief/pilfer threat
  vector** the Banker defends against. **TO ADD:** that pilfer threat — without it,
  "protects your gold" guards against nothing.
- Noble income (faucet) <-> bribe-to-turncoat (sink).

### Support classes as units on the combat map
Field non-combat jobs as **fragile bodies** — possible backup, but more likely **a
resource to protect**. Makes the baker-vs-warrior choice bite twice (a caravan slot
**and** a liability on the field) and creates protect-your-investment play.
- **Trap to dodge:** escort gameplay is famously tedious (the FE "keep the green unit
  alive" groan).
- **Mitigation:** support units deploy at the **back edge, low-risk unless the line
  breaks**; fielding them is **opt-in** (bring them for the ability + accept the
  burden, or leave them safe in the caravan and forgo it). Their death = losing the
  guild-level investment (person + locked gear) = the intended stakes.

---

## Brain-dump items (2026-06-06) — captured, not yet sorted

- **Secondary classes** — a character can take a 2nd class; **levels slower** (split
  XP) as the cost of versatility. Plugs into the slot economy: a 2-class character is
  more flexible per slot.
- **Non-combat classes level passively**, with boosts for *successful* ability uses.
  Answers "how does a baker level without fighting." *Watch:* gate growth to being
  **on an adventure**, not sitting in the guild, so benching isn't free training.
- **Rest-in-place for longer recovery, costing rations.** The **opportunity cost of
  rest** — likely **load-bearing**, not a nice-to-have: makes recovery a *spend* (no
  full heal between every fight) and confirms **rations/supply as the routing
  currency**.
- **Overworld rendered as a small interactable camp** (talk to party members). Hits
  the literal title — *Campfire* Tactics; the campfire between battles *is* the
  overworld. *Watch:* keep it visually distinct from the **guild hall** (two camps,
  two meanings).
- **Overworld ability bars** to take overworld skill actions. The concrete UI for the
  overworld-as-hook-surface + step-cooldown model above.

**Convergence note:** the dump keeps reinforcing the same two pillars — **supply/
rations as the strategic currency** and **the overworld as its own action tier** —
rather than scattering.

---

## Suggested next threads to harden (when ready)
1. **Time model for parallel adventures** (the fork that reshapes existing code).
2. **The gold faucet/sink economy** as explicit loops (so Banker/Noble/thief get
   teeth) — incl. adding the pilfer threat vector.
3. **The overworld hook + step-cooldown action economy** (the spine the ability bars
   plug into).
4. **Supply/rations as routing currency** (rest cost, travel cost) — the engine that
   makes branching a real choice.
