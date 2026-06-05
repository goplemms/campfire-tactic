/**
 * Statuses + per-unit counters (D12 seam).
 *
 * A thin, data-driven status layer: apply a status to a unit, tick it on the
 * unit's turn start, and let it expire. Plus a generic per-unit counter — the
 * shape the capture meter will later use. M3 ships only the hook and one sample
 * status (`Immobilized`); the full system is later milestones.
 */

import type { Unit } from "./units";

/** A status applied to a unit. Data, not a subclass. */
export interface StatusInstance {
  /** Stable kind id, e.g. `"immobilized"`. */
  id: string;
  /** Display name. */
  name: string;
  /**
   * Turns remaining before expiry, decremented on the unit's turn start. Use
   * `Infinity` for a status that never expires on its own.
   */
  duration: number;
  /** Optional arbitrary payload for richer statuses later. */
  data?: Record<string, unknown>;
}

/** Apply (or refresh) a status on a unit. A same-id status is replaced. */
export function applyStatus(unit: Unit, status: StatusInstance): void {
  removeStatus(unit, status.id);
  unit.statuses.push(status);
}

/** True if the unit currently carries a status of the given id. */
export function hasStatus(unit: Unit, id: string): boolean {
  return unit.statuses.some((s) => s.id === id);
}

/** Remove a status by id; returns true if one was present. */
export function removeStatus(unit: Unit, id: string): boolean {
  const before = unit.statuses.length;
  unit.statuses = unit.statuses.filter((s) => s.id !== id);
  return unit.statuses.length !== before;
}

/**
 * Tick every status on a unit (call on its turn start): decrement `duration`
 * and drop any that hit zero. Returns the statuses that expired this tick.
 */
export function tickStatuses(unit: Unit): StatusInstance[] {
  const expired: StatusInstance[] = [];
  for (const s of unit.statuses) {
    if (s.duration !== Infinity) {
      s.duration -= 1;
      if (s.duration <= 0) expired.push(s);
    }
  }
  if (expired.length > 0) {
    unit.statuses = unit.statuses.filter((s) => !expired.includes(s));
  }
  return expired;
}

// --- The Immobilized sample status (the snare's effect, D12) ----------------

/** Id of the sample Immobilized status. */
export const IMMOBILIZED = "immobilized";

/** Build an Immobilized status lasting `duration` of the unit's turns. */
export function immobilized(duration: number): StatusInstance {
  return { id: IMMOBILIZED, name: "Immobilized", duration };
}

/** True if the unit cannot move this turn. */
export function isImmobilized(unit: Unit): boolean {
  return hasStatus(unit, IMMOBILIZED);
}

// --- Generic per-unit counters (the capture-meter shape, D12) ---------------

/** Read a per-unit counter (0 if unset). */
export function getCounter(unit: Unit, key: string): number {
  return unit.counters[key] ?? 0;
}

/** Add `by` (default 1) to a per-unit counter; returns the new value. */
export function incrementCounter(unit: Unit, key: string, by = 1): number {
  return (unit.counters[key] = getCounter(unit, key) + by);
}

/** Set a per-unit counter to an exact value. */
export function setCounter(unit: Unit, key: string, value: number): void {
  unit.counters[key] = value;
}

/** Remove a per-unit counter. */
export function clearCounter(unit: Unit, key: string): void {
  delete unit.counters[key];
}
