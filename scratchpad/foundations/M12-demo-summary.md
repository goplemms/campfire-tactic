# M12 Demo — summary & QoL-session kickoff

> A playable slice shipped (PR #15, merged to `main`, gate confirmed 2026-06-08). This
> page is the **reference + backlog** for a QoL pass now that *The Hollow Mill* plays end
> to end. Rules live in `core/` (headless, tested); the demo's feel lives in **one file**,
> `src/game/scenes/DemoScene.ts`.

## What the demo is

*The Hollow Mill* — a standalone, hand-authored 5-beat quest that exercises every M12
system. It bypasses the guild/overworld and reuses the combat pipeline.

**Run it:** `npm run dev` → click **▶ Demo: The Hollow Mill** (or open with `#demo`).

### The play loop (5 beats)

1. **Provision** — load herbs (salve/stimulant/antidote) under the storage cap (a real
   choice — you can't carry everything).
2. **E1 · Skirmish** — open yard, a straggler placed apart → the **flank** moment; a
   bowman that kites → **ranged**.
3. **Rest / Level-up** — full heal, the **job-L2 unlock** (each class's 2nd active), and
   the **deserter choice** (spare = antidote + ambush pre-revealed · press = +gold,
   unscouted).
4. **E2 · Ambush at the chokepoint** — a sluice funnel: **tarpit** the gap (Edrin),
   **cleanse** the snare-trapper's Immobilize with an **antidote**, land the
   Dash→Expose→Mark→Deadeye **combo**, and **scout** the hidden ambush.
5. **E3 · Captain's Holdout** — a **bridge-cut timer** (kill/Immobilize the Sapper to
   stop it): beat the Captain, **or** let the bridge fall and **retreat alive** (graded
   failure ≠ wipe).

### The four classes (kits)

| Class | Passive | Actives (1st · 2nd@L2) |
|---|---|---|
| **Heavy Knight** (Edrin) | Hold the Line (tarpit aura → Slow adjacent foes to speed 1) | Cleave (90° arc) · **Shove** (forced move) |
| **Hunter** (Rook) | Deadeye (+dmg vs debuffed) | Reposition (+move) · **Mark Prey** (channel ramp) |
| **Scout** (Vale) | Flanker (solo-flank, bigger bonus) | Dash (+move) · **Expose** (dmg + Exposed) |
| **Medic** (Sela) | Triage (heal scales with missing HP) | Heal (consumes a herb + rider) · **Mend** (charged) |
| **Chef** (Pip) | — | universal **Defend** (a 5th body) |

### Controls

- **Space / Enter** → the primary button (Advance Clock / Continue / March Out).
- **1–9** → the action-row buttons (kit abilities, Defend, herb picks, provision, the
  spare/press choice). Hotkeys shown on the labels.
- **Mouse** → click the grid to move / attack / pick an ability target.

## Where the code lives

| Concern | File |
|---|---|
| The whole demo scene (render + interaction — **most QoL work lands here**) | `src/game/scenes/DemoScene.ts` |
| Quest content + beat runner | `src/core/demo-quest.ts` |
| Authoring substrate + objective + graded failure | `src/core/authored.ts` |
| Kits / passives / Defend / Snare | `src/core/jobs.ts` |
| Flanking / damage / auras | `src/core/combat.ts` · statuses `status.ts` · clock/economy `clock.ts` |
| Ability resolution (charge/cooldown/channel/herb-heal) | `src/core/skills.ts` · `src/core/turn.ts` |
| Scoring AI | `src/core/ai.ts` |
| Leveling / unlocks | `src/core/leveling.ts` |

All magnitudes are named constants/tables — **balance is a numbers pass, not a reshape**
(`FLANK`, `STATUS_TUNING`, `CHANNEL_TUNING`, `KIT`, `LEVELING`, `AI`, the encounter/objective
data in `demo-quest.ts`).

## QoL backlog (candidates for the session)

Ordered roughly by bang-for-buck. None of these touch the rules — they're feel/clarity.

### High value — readability of a turn
- [ ] **Move/attack range preview** — on a player's turn, tint the reachable tiles (use
  the AI's `reachableTiles` idea) + show attack-range tiles. Today you click blind.
- [ ] **Move-then-act (FFT-style)** — split movement from the action so you can move,
  *see*, then choose attack/ability/Defend, with a cancel. Today move+attack is one click.
- [ ] **Floating combat text** — damage / heal / "FLANK!" / "cleanse" pop-ups; right now
  only the HP number changes + a flash.
- [ ] **HP bars** under tokens (not just `x/y` text); color by fraction.
- [ ] **Active-unit indicator** — a clearer "it's X's turn" marker than the tile outline.

### Status & ability clarity
- [ ] **Per-status badges + hover tooltips** — today it's single letters tinted by the
  *first* status only. The `STATUS_VISUALS` registry already has glyph+tint+label to drive
  this properly.
- [ ] **Mark Prey stacks** + **charge/channel** progress shown on the unit (Mend currently
  only shows an hourglass in the CT panel).
- [ ] **Bridge-cut timer as a bar**, not a `%` string; flash when the Sapper is peeled.
- [ ] **Flank/Deadeye/tarpit cues** — a small visual when a bonus actually fires.

### Targeting / input
- [ ] **Keyboard targeting** — Tab/arrows to cycle valid targets, Enter to confirm, so a
  whole turn is keyboard-only.
- [ ] **Cleave direction picker** — today it auto-aims at the clicked foe; let the player
  choose the arc.
- [ ] **Shove landing preview** — show where the foe ends up before committing.

### Pacing & flow
- [ ] **Enemy-turn pacing / fast-forward toggle** — auto-turns tween at 130ms; a skip or
  speed control helps replays.
- [ ] **Hidden-ambush presentation** — pre-reveal tokens render faintly; either fully hide
  until scouted or make "lying in wait" clearer.
- [ ] **Unit tooltips** — hover a unit for stats / job / passive / level.

### Smaller polish
- [ ] Provision: allow **remove** (un-load a herb), show per-herb slot cost.
- [ ] Rest screen: show **stat deltas** (e.g. `HP 34→38`) not just the new value.
- [ ] A persistent **legend / help** toggle.

## Known thin seams (design-level, not QoL — flag, don't fix here)
- The four kits are **demo-only** — not wired into the main run/guild flow yet.
- **Scout-reveal** of hidden enemies is a render-side approximation (no real intel/fog
  ladder in the demo).
- **Standing orders** (`standingOrder` field exists) — auto-Defend loop not built.
