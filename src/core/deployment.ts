/**
 * Deployment — the per-unit push-your-luck exposure gamble (D7/D11).
 *
 * Deployment plays out **on the board**, like combat: units walk out and place
 * field entities where they stand. The gamble is **spatial** — a **safe depth**
 * near your edge (banded by Awareness) costs nothing, but each tile **deeper**
 * you commit a placement raises a **transparent exposure meter**. Cross
 * {@link CAPTURE_THRESHOLD} and the unit is **captured** — bound on the map,
 * dropped from the initiative seed, a rescuable sub-objective in the battle.
 *
 * (M5b uses a transparent deterministic meter driven by placement depth; the
 * full D11 "auto-retreat with a per-step roll" is a later tuning pass.)
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit } from "./units";
import type { Rng } from "./rng";
import type { TileGrid } from "./grid";
import type { GridCoord } from "./iso";
import { findPath } from "./pathfinding";
import { occupiedGrid } from "./ai";

/** Exposure at which a unit is captured. */
export const CAPTURE_THRESHOLD = 100;

/** Exposure added per tile of depth **beyond** the safe zone. */
export const EXPOSURE_PER_DEPTH = 25;

/** Per-unit deployment exposure state. */
export interface DeployExposure {
  /** Entities placed so far. */
  placements: number;
  /** Accumulated exposure (>= threshold ⇒ captured). */
  exposure: number;
  captured: boolean;
}

/** Fresh exposure state for a unit that hasn't placed anything yet. */
export function createExposure(): DeployExposure {
  return { placements: 0, exposure: 0, captured: false };
}

/**
 * How deep (in tiles from the party's safe edge) a unit may place at **zero
 * risk** — banded by Awareness (D11). A high-Awareness unit ranges further
 * before the meter moves.
 */
export function safeDepth(unit: Unit, moraleDepthBonus = 0): number {
  return 2 + Math.floor(unit.awareness / 2) + moraleDepthBonus;
}

/**
 * Exposure a placement at the given `depth` (tiles from the safe edge) would
 * add — zero within the safe depth, then {@link EXPOSURE_PER_DEPTH} per tile
 * deeper. Morale (D8) feeds two knobs: a wider `safeDepthBonus` and an
 * `exposureMultiplier` (<1 = confident units expose themselves less).
 */
export function placementCost(
  unit: Unit,
  depth: number,
  morale: { safeDepthBonus?: number; exposureMultiplier?: number } = {},
): number {
  const safe = safeDepth(unit, morale.safeDepthBonus ?? 0);
  const raw = Math.max(0, depth - safe) * EXPOSURE_PER_DEPTH;
  return Math.round(raw * (morale.exposureMultiplier ?? 1));
}

/** Current exposure as a 0..1 fraction, for the board meter. */
export function exposureRisk(state: DeployExposure): number {
  return Math.min(1, state.exposure / CAPTURE_THRESHOLD);
}

/**
 * Record a placement by `unit` at the given `depth`: accrue its exposure cost
 * and capture the unit if exposure crosses the threshold. Returns the exposure
 * added and whether the unit is now captured.
 */
export function recordPlacement(
  state: DeployExposure,
  unit: Unit,
  depth: number,
  morale: { safeDepthBonus?: number; exposureMultiplier?: number } = {},
): { exposureAdded: number; captured: boolean } {
  const cost = placementCost(unit, depth, morale);
  state.placements += 1;
  state.exposure += cost;
  if (!state.captured && state.exposure >= CAPTURE_THRESHOLD) {
    state.captured = true;
    captureUnit(unit);
  }
  return { exposureAdded: cost, captured: state.captured };
}

// --- Capture / rescue (the shared state, D7) -------------------------------

/** Mark a unit captured: bound, cold on the clock (excluded from the seed). */
export function captureUnit(unit: Unit): void {
  unit.captured = true;
  unit.ct = 0;
}

/** Free a captured unit (a rescue): it rejoins the clock cold. */
export function freeCaptive(unit: Unit): void {
  unit.captured = false;
  unit.ct = 0;
}

/** True if the unit is currently captured. */
export function isCaptured(unit: Unit): boolean {
  return unit.captured;
}

// --- D11: the stealth-alert layer (party-wide cumulative awareness) ---------
//
// A second, *probabilistic* deployment model layered on the same spatial depth:
// each forward action raises a **shared camp-awareness meter**; the further past
// safe depth, the more noise. After a noisy action you **roll against the meter**
// — on an alert the spotted unit auto-retreats to safety, and **each tile of that
// retreat is a capture roll** whose odds scale with how deep it was caught. All
// rolls take a seeded {@link Rng}, so a given seed always plays out the same.

/** Camp awareness gained per tile a unit deploys past its safe depth. */
export const NOISE_PER_DEPTH = 12;
/** Awareness ceiling — the alert chance on an action is `meter / ALERT_CAP`. */
export const ALERT_CAP = 100;
/** Per-tile capture chance gained per tile past safe depth, during a retreat. */
export const CAPTURE_PER_DEPTH = 0.15;
/** Cap on the per-tile capture chance, so even a deep retreat isn't a sure loss. */
export const CAPTURE_CHANCE_MAX = 0.6;
/** Fraction the meter settles to after a spotting that ends without a capture. */
export const ALERT_SETTLE = 0.5;

/** Party-wide deployment awareness (D11): one shared meter the camp accrues. */
export interface DeployAlert {
  meter: number;
}

/** A fresh (silent) alert meter for the start of a deployment. */
export function createAlert(): DeployAlert {
  return { meter: 0 };
}

/** Awareness a unit raises by deploying to `depth` — zero within its safe depth. */
export function deployNoise(unit: Unit, depth: number, moraleDepthBonus = 0): number {
  return Math.max(0, depth - safeDepth(unit, moraleDepthBonus)) * NOISE_PER_DEPTH;
}

/** Add a unit's deploy noise to the shared meter (clamped to the cap); returns it. */
export function addNoise(alert: DeployAlert, unit: Unit, depth: number, moraleDepthBonus = 0): number {
  alert.meter = Math.min(ALERT_CAP, alert.meter + deployNoise(unit, depth, moraleDepthBonus));
  return alert.meter;
}

/** Roll whether the camp spots a forward action, weighted by the current meter. */
export function rollAlerted(alert: DeployAlert, rng: Rng): boolean {
  return rng.chance(alert.meter / ALERT_CAP);
}

/**
 * The per-tile capture chance for a unit caught at `depth`, scaling with how far
 * past its safe depth it ranged — so a deep push is a long, dangerous walk home
 * and a shallow one usually slips back.
 */
export function captureChance(unit: Unit, depth: number, moraleDepthBonus = 0): number {
  return Math.min(CAPTURE_CHANCE_MAX, Math.max(0, depth - safeDepth(unit, moraleDepthBonus)) * CAPTURE_PER_DEPTH);
}

/** Settle the meter after a survived spotting — the patrol checked and relaxed. */
export function settleAlert(alert: DeployAlert): void {
  alert.meter = Math.round(alert.meter * ALERT_SETTLE);
}

/**
 * The resolved outcome of one noisy deploy action: whether the camp spotted it,
 * and if so the spotted unit's retreat path to cover and where (if anywhere) it
 * gets netted. The scene just *plays* this plan — all the rolls happened here.
 */
export interface DeployOutcome {
  spotted: boolean;
  /** Tiles the spotted unit retreats along toward cover (empty if not spotted). */
  retreatPath: GridCoord[];
  /** Index into retreatPath where the unit is netted, or -1 if it reaches cover. */
  capturedAt: number;
}

/**
 * The closest reachable, unoccupied tile inside `unit`'s safe depth — returned as
 * the retreat path (origin tile dropped), or `[]` if there's nowhere to fall back.
 */
export function nearestSafePath(grid: TileGrid, units: readonly Unit[], unit: Unit, moraleDepthBonus = 0): GridCoord[] {
  const safe = Math.min(safeDepth(unit, moraleDepthBonus), grid.cols - 1);
  const nav = occupiedGrid(grid, units, [unit]);
  let best: GridCoord[] | null = null;
  for (let col = safe; col >= 0; col--) {
    for (let row = 0; row < grid.rows; row++) {
      const t = { col, row };
      if (!grid.isWalkable(t)) continue;
      if (units.some((u) => u !== unit && u.alive && u.pos.col === col && u.pos.row === row)) continue;
      const p = findPath(nav, unit.pos, t);
      if (p && (!best || p.length < best.length)) best = p;
    }
  }
  return best ? best.slice(1) : [];
}

/**
 * Resolve a noisy deployment action end to end (the D11 stealth gamble), the one
 * model both the demo and the full game run on: add the unit's depth noise to the
 * shared meter, roll whether the camp spots it, and if so plan the retreat to
 * cover and roll capture per tile — the party's last un-captured fighter is never
 * netted. A silent action (within safe depth) is a no-op. Every roll takes the
 * seeded `rng`, so the whole outcome is reproducible.
 */
export function resolveDeployAction(
  alert: DeployAlert,
  unit: Unit,
  grid: TileGrid,
  units: readonly Unit[],
  rng: Rng,
  moraleDepthBonus = 0,
): DeployOutcome {
  const quiet: DeployOutcome = { spotted: false, retreatPath: [], capturedAt: -1 };
  if (deployNoise(unit, unit.pos.col, moraleDepthBonus) === 0) return quiet; // within cover — silent
  addNoise(alert, unit, unit.pos.col, moraleDepthBonus);
  if (!rollAlerted(alert, rng)) return quiet;

  const retreatPath = nearestSafePath(grid, units, unit, moraleDepthBonus);
  const protectedLast = units.filter((u) => u.side === unit.side && !u.captured).length <= 1;
  let capturedAt = -1;
  if (!protectedLast) {
    for (let i = 0; i < retreatPath.length; i++) {
      if (rng.chance(captureChance(unit, retreatPath[i].col, moraleDepthBonus))) {
        capturedAt = i;
        break;
      }
    }
  }
  if (capturedAt === -1) settleAlert(alert); // got away — the patrol relaxes
  return { spotted: true, retreatPath, capturedAt };
}
