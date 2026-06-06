# M9 Kickoff — The guild & caravan tier (run.ts → a Guild of N runs)

A self-contained implementation brief. It assumes the repo at the end of M8
(decisions D1–D35, design docs under `docs/design/`, all of M1–M8 shipped and
green). Develop on the working branch, follow the memento workflow (a milestone
isn't done until tests are green and the in-browser gate is met; update
`scratchpad/foundations/PROGRESS.md` + the M9 row in `plan.md`).

## Where this sits

M7 shipped the overworld as a frame; M8 turned it into a second hook surface (the
unified overworld camp + cooldown spine + loose fatigue). Both operate on the
single run that exists today (`run.ts` holds exactly one map + position). The
design (D25–D27) puts a persistent guild tier on top: the run becomes one
caravan's adventure, and the guild owns several.

- M8 (done) — the overworld action economy (D29/D35): the machinery.
- **M9 (this brief) — the guild & caravan tier (D25–D27, D32 seam): `run.ts` → a
  Guild of N runs.**
- M10 — the gold economy & recruitment (D28/D30/D33/D34).

M9 reshapes the container around the run; it leaves M7/M8's per-run machinery
(overworld DAG, camp, cooldowns, fatigue, the phase pipeline) untouched.

## Goal & user-testable gate

Lift the run into a persistent guild: a shared roster + armory + treasury + a
never-empty quest board, from which you assemble caravans (typed vessels bundling
slots + storage + locked gear + loaded supplies + a purse), commit
people/gear/gold across several at once, then play them one at a time (model C). A
caravan wipe permanently costs that caravan's people + locked gear while the guild
survives; a caravan that returns flows its survivors, gear, and surviving purse
back. `run.ts` becomes one of N runs the guild owns.

**Gate (must all hold):**

- `npm run dev` → opens the guild hall (not straight into a run): a shared roster,
  an armory of gear, a treasury, and a quest board (a main quest + ≥1 repeating
  generated sidequest, never empty).
- Assemble ≥2 caravans for different quests. Uniform slots (D25): bringing the Chef
  genuinely consumes a slot a fighter could have taken. Committing people + a piece
  of gear + a chosen purse locks them — the same gear/person can't be loaded into a
  second caravan.
- Dispatch both; play one through its overworld to a terminal (the M7/M8 flow runs
  unchanged); the other waits paused (no auto-resolve, no clock tick — D26).
- A caravan wipe removes that caravan's people from the roster (permadeath) and
  loses its locked gear; the guild persists and you can rebuild via a cheap
  repeating sidequest (hire a mercenary). A caravan return (clears its quest)
  rejoins its survivors to the pool, unlocks its gear, and flows its surviving
  purse back to the treasury.
- Determinism: each caravan's run keeps its own seed; same guild seed + same
  dispatch choices ⇒ identical maps + per-caravan outcomes.
- `npm test` green (caravan, guild-dispatch, serial-play, wipe/return resolution,
  determinism); `npm run build` clean; `core/` imports no Phaser/DOM and no
  `Math.random` (the grep test still passes).

## Architectural rules (non-negotiable)

- Core/render split (D2): all logic in `src/core/` (plain TS, headless). Phaser
  only in `src/game/`. Export new modules via `core/index.ts`.
- Determinism (D22): the guild and every caravan run are deterministic from seeds —
  no live RNG in core.
- Don't disturb the run. M7/M8 per-run code is untouched. M9 wraps it: a Guild owns
  N RunStates; `createRun` learns to build a run from a caravan.
- Data-driven (D4): a caravan vessel is data; the quest board is data.
- Model C, not A (D26): commitment is parallel, play is serial. No background clock,
  no auto-resolve.

## In scope

- Core: `caravan.ts` (vessel + lock ledger), `guild.ts` (the guild owning N runs;
  dispatch / resolveReturn / the rebuild valve), `run.ts`/`runloop.ts` thin reshape
  (`createRunFromCaravan`).
- Render: a new `GuildScene` (the hall, the app's new entry point); `OverworldScene`
  re-pointed to dispatch-in / return-to-hall; wipe/return surfaced at the hall.

## Seams to honor now (thin)

- Lords + save system (D27): a typed loss-tier seam (a caravan-wipe terminal can
  carry a "lord lost" flag) but no save/reload or game-over path.
- Two-pool economy (D34/D30): only the treasury↔purse plumbing dispatch needs.
- Recruitment (D33): only the minimal mercenary hire-to-rebuild valve.
- Leveling (D32): a thin seam only — a per-character level/XP field and the rule
  "deployed grows, benched doesn't."

## Out of scope

The gold-economy verbs / theft / Banker / Noble / Influence (M10); companion & lord
recruitment and the authored-cast data shape (M10/deferred); the save system + lord
game-over/ironman (D27 later); the interleaved global guild clock (model A — D26);
auto-resolve of waiting caravans (rejected); the full secondary-class slotting UI
(D32 later).

## Sources of truth

- Plan/gate: `scratchpad/foundations/plan.md` → M9.
- Decisions: `decisions.md` → D25, D26, D27, plus context D34, D32, D33.
- Spec: `docs/design/systems/guild.md`, `docs/design/systems/overworld.md`.
- Code seams: `src/core/run.ts`, `src/core/runloop.ts`,
  `src/game/scenes/OverworldScene.ts`.
