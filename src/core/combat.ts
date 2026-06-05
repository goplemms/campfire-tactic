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
  const damage = computeDamage(attacker, defender, attackPower);
  defender.hp = Math.max(0, defender.hp - damage);
  bus?.emit("unitDamaged", { unit: defender, amount: damage, source: attacker });
  if (defender.hp <= 0 && defender.alive) {
    defender.alive = false;
    bus?.emit("unitDefeated", { unit: defender, source: attacker });
  }
  return damage;
}

/** The result of a win/lose check. */
export interface BattleOutcome {
  over: boolean;
  /** The surviving side, or undefined for a mutual wipe / not-over. */
  winner?: Side;
}

/**
 * Win/lose detection: a side wins when the other has no living units. If both
 * sides are wiped it's over with no winner; otherwise the battle continues.
 */
export function battleOutcome(units: readonly Unit[]): BattleOutcome {
  const playersAlive = units.some((u) => u.alive && u.side === "player");
  const enemiesAlive = units.some((u) => u.alive && u.side === "enemy");
  if (playersAlive && enemiesAlive) return { over: false };
  if (playersAlive) return { over: true, winner: "player" };
  if (enemiesAlive) return { over: true, winner: "enemy" };
  return { over: true };
}
