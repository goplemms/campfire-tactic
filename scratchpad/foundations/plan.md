# Plan: foundations

## Goal (north star)

A web-playable isometric roguelike tactics game whose identity is its
**non-combat jobs** — chef, survivalist, merchant — built on a pure-logic core
that can later wrap to Steam and mobile without a rewrite.

## Non-scope

- **No Steam/mobile builds in this phase.** The architecture keeps them possible
  (Tauri/Electron for desktop, Capacitor for mobile); the wrappers are a later
  phase, not this one.
- **No multiplayer.**
- **No final art or audio.** Placeholder / CC0 isometric tiles only; no music or
  sound system yet.
- **Not a content-complete job roster.** Three signature jobs prove the pattern;
  a full roster comes later.
- **No meta-narrative / story mode.** Systems first.

## Milestones

Each milestone is ordered, independently shippable, and carries an inline
USER-TESTABLE GATE. A milestone stays "in progress" until tests are green AND
the gate is met. This is a web game, so every gate is a page or button you can
exercise in the browser.

### M1 — Walking skeleton (Vite + Phaser + TypeScript, core/render split)

- Stand up the project: Vite + TypeScript + Phaser 3, plus Vitest for the core.
- Establish the load-bearing separation: a pure-logic `core/` (no Phaser, no DOM)
  and a `game/` render layer that draws it. This is what keeps Steam/mobile open
  and makes the core headlessly testable.
- **User-testable gate:** `npm run dev` serves a page showing a blank isometric
  scene (a few tiles render); `npm test` runs and a trivial `core` test passes.

### M2 — Isometric grid + a unit that moves

- core: tile-grid model, iso/grid coordinate math, A* pathfinding (pure,
  unit-tested). render: draw the iso grid, place one unit, click-to-move.
- **User-testable gate:** open the page, click a tile, and the unit walks to it
  along a valid path; pathfinding tests are green.

### M3 — Turn-based battle loop (two sides, basic attack)

- core: turn/initiative order, action economy (move + act), attack/damage,
  win/lose detection. render: an End Turn button; a basic enemy AI takes its turn.
- **User-testable gate:** play a tiny skirmish to victory or defeat in the
  browser; turn-order and damage tests are green.

### M4 — Data-driven jobs & skills + the phase pipeline

- core: define jobs and skills as **data** (not hard-coded classes); introduce
  the phase pipeline **Meta → Deployment → Battle → Resolution**. Ship one combat
  job (e.g. Soldier) with a skill that hooks the Battle phase.
- **User-testable gate:** a unit's job/skill is defined purely in a data file and
  visibly affects battle (a skill button appears and works); job-loading tests
  are green.

### M5 — The signature non-combat jobs (the hook)

- Implement the three jobs that make this game itself, each deliberately hooking
  a *different* phase to prove the architecture:
  - **Chef** → Meta/camp phase: party morale + between-battle healing buff.
  - **Survivalist** → Deployment phase: place a trap on the map before battle.
  - **Merchant** → Meta/economy: increase storage size and generate gold.
- **User-testable gate:** in the browser, run a mini-loop — Merchant adds
  gold/storage in camp, the Chef buff is applied to the party, and a
  Survivalist-placed trap triggers during the following battle. Each job's effect
  has a green test.

### M6 — Roguelike run loop (seeded procedural encounters, permadeath, meta)

- core: seeded RNG, procedural encounter/map generation, run state, permadeath,
  a between-battle camp where the non-combat jobs act. render: drive a full run
  Camp → Deployment → Battle → Resolution → next, until death.
- **User-testable gate:** start a seeded run, play several encounters using the
  jobs, die, and see the run end; replaying the same seed reproduces the run;
  generation and run-state tests are green.

## Notes

- Pivot = revise Goal + supersede affected decisions (see decisions.md).
- Adjustment = add a new milestone, leave Goal untouched.
- The Steam/mobile wrappers (Tauri/Electron, Capacitor) are deliberately a
  *post-M6* adjustment: once the core proves portable, wrapping it is additive.
