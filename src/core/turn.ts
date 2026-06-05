/**
 * Battle orchestrator — the single entry the render layer drives.
 *
 * Wires the pieces together: a {@link CTClock} picks the next actor, the
 * {@link EventBus} announces moments (turn start/end, tile enter/leave, damage,
 * defeat), the {@link EntityRegistry} lets entities react, {@link combat}
 * resolves attacks, and {@link planEnemyTurn} runs the enemy. The render layer
 * calls `nextActor`, then `moveUnit` / `attack` / `endTurn` (or `runEnemyTurn`),
 * then checks `outcome` — it owns no rules.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit, Side } from "./units";
import type { GridCoord } from "./iso";
import type { TileGrid } from "./grid";
import { EventBus } from "./events";
import { CTClock, type TurnSpend } from "./clock";
import { EntityRegistry } from "./entities";
import { resolveAttack, battleOutcome, type BattleOutcome } from "./combat";
import { tickStatuses } from "./status";
import { computeVisibleTiles } from "./vision";
import { planEnemyTurn, type AIPlan } from "./ai";
import { resolveSkill, type SkillDef, type SkillOutcome } from "./skills";

export class Battle {
  readonly grid: TileGrid;
  readonly units: Unit[];
  readonly bus: EventBus;
  readonly clock: CTClock;
  readonly entities: EntityRegistry;

  constructor(grid: TileGrid, units: Unit[]) {
    this.grid = grid;
    this.units = units;
    this.bus = new EventBus();
    this.clock = new CTClock(units, this.bus);
    this.entities = new EntityRegistry(this.bus);
  }

  /** Apply the per-side initiative seed (D11). Call once before the first turn. */
  seed(): void {
    this.clock.seedInitiative();
  }

  /**
   * Advance the clock to the next actor, fire `turnStart`, and tick that unit's
   * statuses. Returns the acting unit, or null if the battle can't continue.
   */
  nextActor(): Unit | null {
    const unit = this.clock.advanceToNextActor();
    if (!unit) return null;
    this.bus.emit("turnStart", { unit });
    tickStatuses(unit);
    return unit;
  }

  /**
   * Walk a unit through a sequence of tiles, emitting `unitLeaveTile` /
   * `unitEnterTile` for each step so entities (traps, snares) and forced-move
   * combos fire. `forced` marks push/pull entries (D19).
   */
  moveUnit(unit: Unit, path: readonly GridCoord[], forced = false): void {
    for (const tile of path) {
      this.bus.emit("unitLeaveTile", { unit, tile: unit.pos });
      unit.pos = { col: tile.col, row: tile.row };
      this.bus.emit("unitEnterTile", { unit, tile, forced });
    }
  }

  /** Resolve a basic attack, firing damage/defeat events. Returns damage dealt. */
  attack(attacker: Unit, target: Unit): number {
    return resolveAttack(attacker, target, this.bus);
  }

  /**
   * Resolve a job skill against a target (firing its bus events) and end the
   * caster's turn, spending CT per the skill's cost. The single entry the render
   * layer uses for the skill buttons.
   */
  useSkill(caster: Unit, skill: SkillDef, target: Unit): SkillOutcome {
    const outcome = resolveSkill(skill, caster, target, this.bus);
    this.endTurn(caster, { acted: skill.spend === "act", moved: skill.spend === "move" });
    return outcome;
  }

  /** End a unit's turn: fire `turnEnd` and spend its CT (act costs more). */
  endTurn(unit: Unit, spend: TurnSpend): void {
    this.bus.emit("turnEnd", { unit });
    this.clock.spend(unit, spend);
  }

  /**
   * Run a full enemy turn: plan (move + attack toward nearest enemy), execute
   * it through the bus, and end the turn. Returns the plan for the render layer
   * to animate.
   */
  runEnemyTurn(unit: Unit): AIPlan {
    const plan = planEnemyTurn(unit, this.units, this.grid);
    if (plan.path.length > 0) this.moveUnit(unit, plan.path);
    if (plan.target && plan.target.alive) this.attack(unit, plan.target);
    this.endTurn(unit, {
      moved: plan.path.length > 0,
      acted: plan.target !== null,
    });
    return plan;
  }

  /** Current win/lose state. */
  outcome(): BattleOutcome {
    return battleOutcome(this.units);
  }

  /** Tiles a side can currently see (vision seam, D18). */
  visibleTiles(side: Side): Set<string> {
    return computeVisibleTiles(this.units, side);
  }
}
