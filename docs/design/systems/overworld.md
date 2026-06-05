# System — The overworld (seeded branching run map)

> Referenced by: [Design Overview](../README.md) (the loop), [Pre-deployment](../01-pre-deployment.md)
> (camp), [Intel](intel.md), [Mortality, recovery & difficulty](mortality-recovery.md).
> Decisions: **D22** (shape), **D23** (node kinds & camp), **D24** (intel preview).

## Description

A **run** is no longer a straight line of fights — it is a **map** the player
**branches through**. The overworld is the screen between missions: it shows a
seeded graph of nodes, highlights the ones you can reach next, previews each with
banded intel, and lets you commit to a route. You advance node by node until you
**clear the final mission** (run complete) or **wipe** (run over).

This is the **run frame** — it does not change combat, camp, logistics, or
mortality; it only chooses *which encounter to play next*. The
[phase pipeline](../README.md) (Camp → Deployment → Battle → Resolution) runs
**inside** a combat node, exactly as before.

### Shape — a layered node DAG (D22)

The map is a **Slay-the-Spire-style layered DAG**: columns ("layers") of nodes
with **forward-only** edges from one layer to the next.

```
  layer:  0        1        2        3        4   …   N
          start ─┬─ n1-0 ─┬─ n2-0 ─── n3-0 ─┬─ …  ─── final
                 │        ╲        ╱        │
                 └─ n1-1 ──┴─ n2-1 ─────────┘
```

- **Layer 0** is a single **start** node — your opening camp. It is the entry
  position; you never *fight* it, you choose forward from it.
- **Interior layers** are `minWidth..width` nodes wide (default **2..3**).
- **The final layer** is a single node — the run's last mission. Clearing it is
  **run-complete**.

The whole map is **seed-derived** — generated from `streamFor(seed, "map")` — so
**replaying a seed reproduces the same layout, the same node kinds, and the same
edges**, and therefore the same set of choices. Each node's *contents* are equally
deterministic (below), so a replayed run with the same choices is identical.

#### Connectivity invariants

The generator guarantees a **legible, never-stuck** graph:

- Every **non-final** node has **≥1 outgoing** edge → no dead ends.
- Every **non-start** node has **≥1 incoming** edge → no orphan nodes.
- Therefore **every node is reachable from the start**, and from any node you can
  always walk forward to the final layer.

On top of those spanning edges, a bounded extra **fan-out** adds real branch
choices (a node may lead to more than one node in the next layer; two nodes may
re-merge on a shared successor).

### Node kinds (D23)

M7 keeps the menagerie minimal — **two kinds**, both data, no special-casing in
the loop:

| Kind | What happens |
|---|---|
| **combat** | A fight. Reuses `generation.ts` for the encounter and runs the full **Camp → Deployment → Battle → Resolution** flow. Difficulty scales with **map depth** (the node's layer is the encounter index). |
| **rest** | **No fight.** A night of [Upkeep](logistics.md) plus a recovery bonus: extra [Rest Points](mortality-recovery.md), auto-triage of the most-wounded, and a small [morale](morale.md) uptick. The between-battle camp beat as a *node*. |

**Camp stays the Meta phase (D3)** that runs *before* a chosen **combat** node
(pay upkeep, bank RP, tick dying clocks, provision, read intel). The **rest node**
is a distinct, lighter recovery beat. The **overworld** is simply the screen you
return to between nodes to pick the next one.

A combat node's encounter is derived as:

```
nodeEncounter(seed, node) = generateEncounter(streamFor(seed, "node:" + node.id), node.layer)
```

— the **layer is the difficulty index**, so deeper missions ramp up, and the
per-node `streamFor` label keeps each node's content reproducible regardless of
what the player chooses or how many other draws the run makes.

### Choosing a node — the banded intel preview (D24)

A branch is only a *choice* if it is **informed**. Before committing, each
reachable node shows a **preview** (`previewNode`), wired to the
[intel](intel.md) system:

- The node's **kind** is always shown, and for a combat node its **encounter
  type** (open-field / fortified) — you always know the *shape* of what you're
  walking into.
- The party's **intel floor** (D10) reveals more about a combat node, banded
  identically: **Tier 1** enemy **types** → **Tier 2** the **count** → **Tier 3**
  positions (and starting vision). A **reward hint** is banded the same way
  (hidden → coarse gold band → approximate → exact).
- **Rest** nodes preview a recovery hint instead.

Previews are a **pure projection** of the seed-built map and the deterministic
per-node encounter, so the **same seed surfaces the same reachable previews** — no
live RNG, fully replayable.

### Run terminals

- **Wipe** — no combat-capable roster unit remains (`isRunOver`, unchanged). The
  run ends; the run-end screen shows the **seed** for replay.
- **Run complete** — a **final-layer** node is cleared. A new terminal the
  overworld surfaces, distinct from a wipe.

## Pseudo-example

> A fresh run loads from seed `emberfall`. The overworld draws **7 layers**. The
> party stands at the **start** camp (layer 0).
>
> 1. **Layer 1 offers two nodes.** `previewNode` shows the top one is a
>    **fortified combat** node; the party's Tier-1 intel floor reveals *goblins +
>    a brute*, reward hint "modest". The bottom node is a **rest**. The player is
>    nearly full HP, so they take the **fight**.
> 2. **Combat node.** The usual Camp → Deployment → Battle → Resolution runs; they
>    win, bank gold, recover an unsprung trap kit, and return to the **map**.
> 3. **Layer 2 branches three ways.** A Tier-2 read (the Seer divined) now shows
>    **counts**: one node is *five wargs* (rich reward), another *two goblins*
>    (modest), the third a **rest**. Hurt from the last fight, the player takes the
>    **rest** node — a quiet night: upkeep paid, +RP, the wounded auto-triaged,
>    morale ticks up. No battle.
> 4. **They press deeper.** Each layer the encounters ramp (layer = difficulty), so
>    by layer 5 the warbands are bigger than the squad can safely clear. The player
>    threads rest nodes between fights to stay alive…
> 5. **…and reaches the final node.** Clearing it ends the run **complete**. (Had
>    the squad wiped first, the run-end screen would show the **seed** to replay the
>    exact same map and choices.)

## Open questions / future scope (the **next** batch, out of M7 scope)

- **Route endings (deferred at the M7 gate).** M7 ships **functional** terminals —
  a *run-complete* screen on clearing the final node and a *run-over* screen on a
  wipe, both surfacing the replay seed — but *what an ending should **mean*** is an
  open design question: end-of-run **rewards**, any **meta-progression** carried
  between runs, and the **framing** of victory vs. defeat. The complete-vs-wipe
  *mechanics* are settled (and tested); their content/payoff is the next pass.
- **More node kinds:** shops/merchants-as-nodes, **recruitment** of new party
  members, **event** nodes (random encounters with choices), narrative beats.
- **Map shape tuning:** layer count / width / fan-out / rest frequency as a
  difficulty or biome dial; elite/boss nodes and their tuning.
- **Pathing texture:** one-way shortcuts, locked nodes, intel that reveals deeper
  layers than the immediate next one.
- **Persistence:** on-disk save slots (M7 is in-memory + the re-enterable seed).
