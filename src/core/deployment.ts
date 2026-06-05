/**
 * Deployment — the per-unit push-your-luck exposure gamble (D7/D11).
 *
 * A unit places field entities during a **safe allowance** of placements at zero
 * risk (sized in bands by Awareness). Each placement **beyond** the allowance is
 * **overdraw**: it adds to a **transparent exposure meter** (no hidden roll — the
 * board shows it). When exposure crosses {@link CAPTURE_THRESHOLD} the unit is
 * **captured** — bound on the map, dropped from the initiative seed, but a
 * rescuable sub-objective in the coming battle.
 *
 * (M5b uses a transparent deterministic meter; the full D11 "auto-retreat with a
 * per-step capture roll" is a later tuning pass over this same seam.)
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit } from "./units";

/** Exposure at which a unit is captured. */
export const CAPTURE_THRESHOLD = 100;

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

/** Free placements before overdraw begins — banded by Awareness (D11). */
export function safeAllowance(unit: Unit): number {
  return 1 + Math.floor(unit.awareness / 3);
}

/** Exposure added per overdraw placement — lower for high-Awareness units. */
export function overdrawCost(unit: Unit): number {
  return Math.max(20, 60 - unit.awareness * 5);
}

/** Exposure the *next* placement would add (0 while within the safe allowance). */
export function nextPlacementCost(state: DeployExposure, unit: Unit): number {
  return state.placements < safeAllowance(unit) ? 0 : overdrawCost(unit);
}

/** Current exposure as a 0..1 fraction, for the board meter. */
export function exposureRisk(state: DeployExposure): number {
  return Math.min(1, state.exposure / CAPTURE_THRESHOLD);
}

/**
 * Record a placement by `unit`: spend its safe allowance first, then accrue
 * overdraw exposure; capture it if exposure crosses the threshold. Returns the
 * exposure added and whether the unit is now captured.
 */
export function recordPlacement(
  state: DeployExposure,
  unit: Unit,
): { exposureAdded: number; captured: boolean } {
  const cost = nextPlacementCost(state, unit);
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
