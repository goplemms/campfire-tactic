/**
 * Attack/damage resolution and win/lose detection.
 *
 * Pure logic: no Phaser, no DOM. Damage is the classic `max(1, atk - def)`; a
 * defeated unit flips `alive = false`. When a {@link EventBus} is passed,
 * `onUnitDamaged` / `onUnitDefeated` fire so listeners (and the render layer)
 * can react — the same bus a trap or aura would hang off.
 */

import type { Unit, Side } from "./units";
import type { GridCoord } from "./iso";
import type { EventBus } from "./events";

/** Manhattan distance — matches the grid's 4-connected movement. */
export function manhattan(a: GridCoord, b: GridCoord): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/** True if two tiles are orthogonally adjacent (melee range). */
export function isAdjacent(a: GridCoord, b: GridCoord): boolean {
  return manhattan(a, b) === 1;
}

/** Damage a basic attack would deal: attack minus defense, floored at 1. */
export function computeDamage(
  attacker: Unit,
  defender: Unit,
  attackPower: number = attacker.attack,
): number {
  return Math.max(1, attackPower - defender.defense);
}

/**
 * Apply raw damage to a unit, emitting `onUnitDamaged` and (on a kill)
 * `onUnitDefeated`. `source` is the attacker if any — a trap or rune passes
 * none. Returns the damage applied. This is the single mutation point so
 * unit attacks and field-entity effects defeat units identically.
 */
export function applyDamage(
  target: Unit,
  amount: number,
  bus?: EventBus,
  source?: Unit,
): number {
  const damage = Math.max(0, Math.floor(amount));
  target.hp = Math.max(0, target.hp - damage);
  bus?.emit("unitDamaged", { unit: target, amount: damage, source });
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    bus?.emit("unitDefeated", { unit: target, source });
  }
  return damage;
}

/**
 * Resolve a basic attack: apply damage, emit `onUnitDamaged`, and on a kill flip
 * `alive` and emit `onUnitDefeated`. Returns the damage dealt. `attackPower`
 * overrides the attacker's base attack (used by skills like Power Strike).
 */
export function resolveAttack(
  attacker: Unit,
  defender: Unit,
  bus?: EventBus,
  attackPower: number = attacker.attack,
): number {
  return applyDamage(defender, computeDamage(attacker, defender, attackPower), bus, attacker);
}

/** The result of a win/lose check. */
export interface BattleOutcome {
  over: boolean;
  /** The surviving side, or undefined for a mutual wipe / not-over. */
  winner?: Side;
}

/**
 * Win/lose detection: a side wins when the other has no **active** units. A
 * captured unit (D7) is bound and doesn't count as an active defender — a side
 * with only captured/fallen units is eliminated (the captured one becomes a
 * rescue follow-up, not an instant loss). If both sides lack active units it's
 * over with no winner; otherwise the battle continues.
 */
export function battleOutcome(units: readonly Unit[]): BattleOutcome {
  const playersActive = units.some((u) => u.alive && !u.captured && u.side === "player");
  const enemiesActive = units.some((u) => u.alive && !u.captured && u.side === "enemy");
  if (playersActive && enemiesActive) return { over: false };
  if (playersActive) return { over: true, winner: "player" };
  if (enemiesActive) return { over: true, winner: "enemy" };
  return { over: true };
}
