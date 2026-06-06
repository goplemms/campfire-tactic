# Overworld — captured ideas (parking lot)

> **Status: GRADUATED (2026-06-06).** The "Resolved" Q1–Q10 below have been promoted
> to formal decisions **D25–D32** in [`decisions.md`](decisions.md) and written up in
> the specs (new [`guild.md`](../../docs/design/systems/guild.md); extended
> [`overworld.md`](../../docs/design/systems/overworld.md),
> [`logistics.md`](../../docs/design/systems/logistics.md),
> [`stats.md`](../../docs/design/systems/stats.md),
> [`field-entities.md`](../../docs/design/systems/field-entities.md)). This file is
> kept as the **reasoning trail / parking lot** for the not-yet-decided remainder
> (the round-2 threads at the bottom). Capture here; the decisions are the record.
>
> Context: M7 shipped the overworld as a seeded Slay-the-Spire-style layered DAG
> (D22–D24) with `combat`/`rest` nodes. The discussion below is about what the
> run-frame should *become*.

---

## Resolved (design session, 2026-06-06)

> Working through the open questions one-by-one (same style as the D8–D16 pass).
> These are **agreed in discussion**; they graduate to `decisions.md` (D25+) +
> `docs/design/` when we do a write-up pass.

- **Q1 — Mode × guild: ONE SHARED persistent guild.** Campaign and Endless are two
  *content feeds* into a single guild (one roster, one armory, one progression).
  Max reuse; accepted tradeoff = story-earned and sandbox-earned progress share a
  save (revisit cosmetic separation only if it feels muddy).
- **Q2 — Parallel adventures: model C (sequential play, shared standing state)** +
  a renewable quest board + dispatched caravans **wait**.
  - **Commitment is parallel, play is serial:** commit people + gear across several
    caravans at once (the lock = the portfolio cost), but play one caravan through at
    a time; the guild clock advances between dispatches. Every fight stays
    hand-played. Clear path to graduate toward an interleaved clock (model A) later.
  - **Quest board (the "one shared guild, two feeds" made concrete):** **main quest**
    (campaign spine, arc + ending) → **authored sidequests** (finite hand-made pool)
    → **repeating generated sidequests** (the infinite tail = "endless," integrated).
    The board is never empty, so idle caravans always have somewhere to go.
  - **Parallelism is asymmetric:** one main thrust + a renewable side-content stream
    (Darkest Dungeon / Three Houses shape), not symmetric juggling.
  - **Dispatched-but-unplayed caravans WAIT** (paused at their node) rather than
    ticking a clock or auto-resolving (auto-resolve is rejected — it dilutes the
    hand-played tactical core, the crown jewel).
- **Q3 — A caravan = persistent, typed, upgradeable vessel + uniform slots.**
  - You **own/acquire a stable of caravans** (need ≥2 for multiple-at-once), each a
    persistent upgradeable asset on a tradeoff axis: *small/fast/cheap/low-capacity*
    (scout cart, short sidequests) ↔ *large/slow/costly/high-capacity* (supply train,
    deep main-quest hauls). Pick the right vessel per quest. The Merchant raising
    storage (D14) becomes "upgrade a caravan's capacity."
  - A caravan bundles: **party slots + storage (D14 cap) + loaded supplies + locked
    equipment** (unavailable to other caravans until it returns). Thematically it
    doubles as the **overworld camp** (the mobile campfire the overworld is drawn as).
  - **Slots are UNIFORM** (any character fits any slot) so bringing a baker genuinely
    costs a warrior — caravan *size* is the only dial. (Role-segmented slots rejected:
    they'd make support picks "free" and kill the tension.)
- **Q4 — Unkillable guild + Fire-Emblem "lords."**
  - The guild **never hard-fails**: there's always a cheap repeating sidequest to
    rebuild, so stakes come from permanent **losses**, not a fail screen. (Two loss
    tiers already exist: *mission loss* per node (D13/D21) and *caravan wipe* =
    lose that caravan's people (permadeath) + its locked gear, guild survives.)
  - **EXCEPT 2–3 named campaign "lords"** (à la Fire Emblem): if a lord dies during
    the campaign it's **game-over → reload last save**. An optional **hardcore/ironman**
    mode makes even that permanent. ⇒ implies a **save system** for the campaign
    (ironman = no reload).
  - **Tension this buys:** a lord in a caravan that wipes = game-over, so risking a
    lord on a deep node is a real gamble.
  - **Endings (answers the M7-deferred terminal-design):** campaign-complete = clear
    the **main quest** (epilogue + unlocks that seed Endless); campaign-defeat = a
    **lord falls**; **Endless = depth/score, no terminal**, no lords.
- **Q5 — Travel/rest paid in GOLD; D15 stands (no physical rations).** Food stays a
  gold Upkeep line; no carried larder, no spoilage. ⇒ **gold = universal solvent**:
  travel, rest, provisioning, gear, bribes, debt all draw one pool, so the map is an
  **economic** routing problem ("can I afford this route + a rest?"). Caravan storage
  still gates **gear/ammo/consumables** (D14/D20), just not food. **Consequence:** the
  faucet/sink balance (Q7) matters *more* — a slack economy trivializes the map.
- **Q6 — Overworld is a data-driven hook surface (extends D3); abilities declare
  their own limiter from a small menu.** "Ability" is general — different overworld
  abilities use different costs:
  - **Fatigue / exhaustion (NEW, per-character)** — e.g. the Merchant *can* hike to
    town but not night-over-night; a single **shared per-character** stamina meter that
    overworld actions spend and **rest restores** (gives rest a 2nd job; fits the
    caravan-as-people fantasy). Keep it one meter, not per-ability.
  - **Vancian charges** — **spells with overworld effects** (scry for intel, travel/
    forage) spend castings from the D17 pool. Magic unified across tiers.
  - **Node-refresh / gold cost / step-cooldown** — for whatever fits.
  - Principle: ability = data declaring **phase + cost** (D3/D4). Keep the limiter
    menu short (D15 "low meter count" restraint).
- **Q7 — Active theft vector (the sink-side partner to the gold faucets).** Pilfering
  is a real risk: **thief/bandit event nodes** skim gold on the overworld AND a
  **gold/item-stealing enemy archetype** mid-battle. Makes the **Banker** a real pick
  (protect/debt/interest in a live faucet↔risk loop). Cost = thief enemy + theft
  events to build (fits the planned event-node batch).
- **Q8 — One distinct verb per economy class; Noble income = POLITICAL.**
  - **Merchant = ACCESS** (markets in the field: basic anywhere via the fatigue-gated
    town-trip, premium at town nodes, better prices everywhere).
  - **Banker = TIME-SHIFT + SECURE** (buy-on-debt auto-repaid from future gold,
    passive *financial* interest, theft protection).
  - **Noble = INFLUENCE** (bribe enemies to turncoat / sway-avoid fights, leaning on
    the intel preview) **+ *political* income** (patronage, town levies, stipend,
    reputation) — deliberately distinct from Banker's *financial* interest so the two
    aren't redundant faucets.
- **Q9 — Support classes: ALWAYS on the combat map + a defendable supply wagon.**
  - The caravan's **supplies are an on-map asset** (wagon/camp object = a **D4 field
    entity** with position/state) that can be attacked and defended — and it's the
    **in-combat target of the Q7 thief archetype** ("protect your investment" becomes
    a concrete *defend-the-wagon* objective, not a vague escort).
  - **Support units deploy far back near the wagon, low enemy-targeting priority by
    default** → not a constant babysit; the escort tension only spikes on a real
    threat. **Positional abilities:** strong in their home zone, weak if dragged out
    (e.g. **Chef by the campfire = bonus damage / hot-pan attack**). Campfire literally
    on the battle map = title callback + ties to the overworld-camp visual.
  - **Rule to pin:** enemy AI **deprioritizes** non-combat units + the wagon **except
    the thief archetype**, which actively seeks the supplies — that exception *is* the
    bodyguard gameplay.
- **Q10 — Secondary classes = FFT-style; non-combat levels passively+on-use.**
  - **FFT job model:** one active **primary** (defines stats/growth) + a **slotted
    subset** of a secondary class's abilities, re-arranged at the guild. More
    balance-controllable than simultaneous dual-class (a weaker slot-saver, accepted).
  - **Leveling:** secondary abilities level through **use** (slower — primary is mostly
    active). **Non-combat jobs** level via a **passive trickle WHILE DEPLOYED + a bump
    per successful ability use** (benched = no growth); combat jobs via combat XP.
    ("Level the secondary by using it" and "non-combat use-bonus" are one mechanism.)

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
