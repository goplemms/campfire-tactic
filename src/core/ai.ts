/**
 * Basic enemy AI (M3): on its turn, move toward (A*) and attack the nearest
 * reachable enemy.
 *
 * Pure logic: no Phaser, no DOM. {@link planEnemyTurn} returns a *plan* — the
 * tiles to walk and whether an attack lands — without mutating anything; the
 * {@link Battle} orchestrator (or a test) executes it. This keeps the AI
 * headlessly assertable.
 */

import type { Unit } from "./units";
import type { GridCoord } from "./iso";
import { TileGrid } from "./grid";
import { findPath } from "./pathfinding";
import { manhattan, isAdjacent } from "./combat";
import { isImmobilized } from "./status";

/** A turn the AI intends to take. */
export interface AIPlan {
  unit: Unit;
  /** Tiles to step through this turn (excludes the start tile). May be empty. */
  path: GridCoord[];
  /** Where the unit ends up (its current tile if it doesn't move). */
  destination: GridCoord;
  /** The enemy to attack from the destination, or null if none in reach. */
  target: Unit | null;
}

/**
 * A copy of `grid` with every unit's tile blocked, except those in `allow`.
 * Lets A* route between units without walking through them, while still letting
 * a chaser path *to* its target's tile (pass the target in `allow`).
 */
export function occupiedGrid(
  grid: TileGrid,
  units: readonly Unit[],
  allow: readonly Unit[] = [],
): TileGrid {
  const blocked: GridCoord[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (!grid.isWalkable({ col, row })) blocked.push({ col, row });
    }
  }
  for (const u of units) {
    if (u.alive && !allow.includes(u)) blocked.push({ col: u.pos.col, row: u.pos.row });
  }
  return new TileGrid(grid.cols, grid.rows, blocked);
}

/**
 * Plan a turn for `unit`: pick the nearest enemy it can path to, walk up to
 * `moveRange` tiles toward an adjacent tile, and attack if it ends up adjacent.
 * Immobilized units don't move but may still attack an adjacent enemy.
 */
export function planEnemyTurn(
  unit: Unit,
  units: readonly Unit[],
  grid: TileGrid,
): AIPlan {
  const stay: AIPlan = { unit, path: [], destination: unit.pos, target: null };

  // Captured (bound) units are guarded, not a threat — the AI ignores them so a
  // captured ally survives to be rescued (D7).
  const enemies = units
    .filter((u) => u.alive && !u.captured && u.side !== unit.side)
    .sort((a, b) => manhattan(unit.pos, a.pos) - manhattan(unit.pos, b.pos));
  if (enemies.length === 0) return stay;

  // Already adjacent to someone? Attack without moving (also the immobilized case).
  const adjacent = enemies.find((e) => isAdjacent(unit.pos, e.pos));
  if (adjacent) return { unit, path: [], destination: unit.pos, target: adjacent };

  if (isImmobilized(unit)) return stay;

  // Find the nearest enemy we can actually path next to. The target's own tile
  // is allowed as a path endpoint so we can stop on the tile just before it.
  for (const enemy of enemies) {
    const navGrid = occupiedGrid(grid, units, [unit, enemy]);
    const path = findPath(navGrid, unit.pos, enemy.pos);
    if (!path || path.length < 2) continue;

    // Drop the start tile and the enemy's own (occupied) tile; what's left are
    // the approach tiles, capped by movement range.
    const approach = path.slice(1, -1).slice(0, unit.moveRange);
    const destination = approach.length > 0 ? approach[approach.length - 1] : unit.pos;
    const target = isAdjacent(destination, enemy.pos) ? enemy : null;
    return { unit, path: approach, destination, target };
  }

  return stay;
}
