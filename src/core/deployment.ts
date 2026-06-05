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
