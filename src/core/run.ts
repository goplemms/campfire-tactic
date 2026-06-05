/**
 * Run state (M6) — the seeded, permadeath roguelike run.
 *
 * Wraps the existing phase loop in a **run**: a persistent party roster,
 * inventory, gold/morale (camp), a Rest-Point pool, a night counter, the current
 * encounter index, the difficulty id, the **threaded RNG**, and a history of
 * outcomes. The run is the single source of all run-time randomness: each
 * encounter derives its generation stream deterministically from `seed`, so the
 * **same seed reproduces the run exactly**.
 *
 * Permadeath: fallen (per the difficulty {@link "./mortality"} policy) and
 * abandoned-captured units **leave the roster**. The run is over when no roster
 * unit can fight on.
 *
 * Pure logic: no Phaser, no DOM.
 */

import { Rng, streamFor, type RngState } from "./rng";
import type { Unit } from "./units";
import { createInventory, type Inventory } from "./inventory";
import { createCamp, type Camp } from "./camp";
import { getDifficulty, type DifficultyPolicy } from "./mortality";
import { isCombatant } from "./jobs";
import { generateEncounter, type EncounterDef } from "./generation";

/** A recorded encounter outcome, for the run history / run-end screen. */
export interface EncounterRecord {
  index: number;
  type: EncounterDef["type"];
  winner?: "player" | "enemy";
  goldEarned: number;
  fallen: string[];
  night: number;
}

/** The live run state — everything a run needs to advance or be replayed. */
export interface RunState {
  /** The textual/numeric seed (re-enterable to reproduce the run). */
  seed: string | number;
  /** The threaded master RNG (all run-time randomness flows through it). */
  rng: Rng;
  /** The persistent party roster (units leave it on permadeath). */
  party: Unit[];
  inventory: Inventory;
  camp: Camp;
  /** Banked Rest Points (D9 recovery pool). */
  rp: number;
  /** Nights elapsed (the universal time unit, D9). */
  night: number;
  /** The current encounter index (0-based). */
  encounterIndex: number;
  /** Difficulty id → the consequence policy the run consults (D9). */
  difficultyId: string;
  history: EncounterRecord[];
  /** True once the run has ended (a wipe). */
  over: boolean;
}

/** Options for {@link createRun}. */
export interface CreateRunOptions {
  party: Unit[];
  difficultyId?: string;
  gold?: number;
  storageCap?: number;
  morale?: number;
  inventory?: Record<string, number>;
}

/** Create a fresh run from a seed. */
export function createRun(seed: string | number, opts: CreateRunOptions): RunState {
  const storageCap = opts.storageCap ?? 6;
  return {
    seed,
    rng: new Rng(seed),
    party: opts.party,
    inventory: createInventory(storageCap, opts.inventory ?? {}),
    camp: createCamp({ gold: opts.gold ?? 0, storageCap, morale: opts.morale ?? 0 }),
    rp: 0,
    night: 0,
    encounterIndex: 0,
    difficultyId: opts.difficultyId ?? "normal",
    history: [],
    over: false,
  };
}

/** The difficulty policy this run consults (D9). */
export function runDifficulty(run: RunState): DifficultyPolicy {
  return getDifficulty(run.difficultyId);
}

/**
 * Generate the current encounter for a run — deterministically from `seed` +
 * `encounterIndex`, so it's identical on replay regardless of other draws. (The
 * dedicated `streamFor` stream is what makes replay rock-solid.)
 */
export function currentEncounter(run: RunState): EncounterDef {
  return generateEncounter(streamFor(run.seed, `enc:${run.encounterIndex}`), run.encounterIndex);
}

/** Roster units that are alive and not captured (incl. camp-only crew). */
export function activeRoster(run: RunState): Unit[] {
  return run.party.filter((u) => u.alive && !u.captured);
}

/** Active units that can actually take the field (excludes camp-only crew). */
export function combatRoster(run: RunState): Unit[] {
  return activeRoster(run).filter(isCombatant);
}

/**
 * Remove a unit from the roster (permadeath, or an abandoned captive, D9).
 * Returns true if the unit was present.
 */
export function removeFromRoster(run: RunState, unit: Unit): boolean {
  const i = run.party.indexOf(unit);
  if (i < 0) return false;
  run.party.splice(i, 1);
  return true;
}

/**
 * Whether the run is over: no roster unit can fight on. A party of only
 * captured/fallen units is a wipe (captives become rescue follow-ups, but with
 * nobody left to mount the rescue the run ends).
 */
export function isRunOver(run: RunState): boolean {
  return combatRoster(run).length === 0;
}

/**
 * Advance to the next encounter (and the next night). Records the outcome,
 * increments the indices, and re-evaluates whether the run is over. Returns the
 * (possibly final) over state.
 */
export function advanceRun(run: RunState, record: Omit<EncounterRecord, "night">): boolean {
  run.history.push({ ...record, night: run.night });
  run.encounterIndex += 1;
  run.night += 1;
  run.over = isRunOver(run);
  return run.over;
}

/** Serialized run state for save/replay (the seed + cursor + RNG state). */
export interface RunSnapshot {
  seed: string | number;
  rngState: RngState;
  encounterIndex: number;
  night: number;
  difficultyId: string;
}

/** Capture a snapshot sufficient to reproduce the encounter sequence from here. */
export function snapshotRun(run: RunState): RunSnapshot {
  return {
    seed: run.seed,
    rngState: run.rng.state(),
    encounterIndex: run.encounterIndex,
    night: run.night,
    difficultyId: run.difficultyId,
  };
}
