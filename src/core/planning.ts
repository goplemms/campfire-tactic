import type { Unit } from "./units";
import type { GridCoord } from "./iso";
import type { TileGrid } from "./grid";
import { occupiedGrid } from "./ai";
import { findPath } from "./pathfinding";
import { inAttackRange, effectiveMove, manhattan } from "./combat";

/** A planned player action: a path to walk and, optionally, a foe to strike on arrival. */
export interface MovePlan {
  /** Tiles to step through after the start tile (may be empty — strike in place). */
  path: GridCoord[];
  /** The foe to attack on arrival, or `null` for a pure move. */
  attackTarget: Unit | null;
}

/**
 * Plan a player **move** to `tile`: the walkable path (excluding the start tile),
 * clamped to the unit's effective move this turn. Returns `null` when the tile is
 * unreachable. Pure — the scene commits the result; this is the planning half the
 * demo and mission scenes share.
 */
export function planMove(actor: Unit, tile: GridCoord, units: readonly Unit[], grid: TileGrid): GridCoord[] | null {
  const nav = occupiedGrid(grid, units, [actor]);
  const path = findPath(nav, actor.pos, tile);
  if (!path || path.length < 2) return null;
  return path.slice(1).slice(0, effectiveMove(actor));
}

/**
 * Plan a player **attack** on `foe`: if already in attack range, strike in place;
 * otherwise close along the path — stopping one tile short of the foe, clamped to
 * the move budget — and strike iff the destination lands within attack range.
 * Returns `null` when there's no path to the foe.
 */
export function planAttack(actor: Unit, foe: Unit, units: readonly Unit[], grid: TileGrid): MovePlan | null {
  if (inAttackRange(actor, foe)) return { path: [], attackTarget: foe };
  const nav = occupiedGrid(grid, units, [actor, foe]);
  const path = findPath(nav, actor.pos, foe.pos);
  if (!path || path.length < 2) return null;
  const approach = path.slice(1, -1).slice(0, effectiveMove(actor));
  const dest = approach.length > 0 ? approach[approach.length - 1] : actor.pos;
  return { path: approach, attackTarget: manhattan(dest, foe.pos) <= actor.attackRange ? foe : null };
}
