/**
 * Unit data (D2 core/render split — plain TS, no Phaser/DOM).
 *
 * A unit is **data**, not a subclass (D4 ethos): a `UnitSpec` is the authored
 * stat block; {@link createUnit} inflates it into a live `Unit` carrying the
 * mutable battle runtime (position, HP, CT, statuses, per-unit counters). New
 * unit kinds are new data, never new classes.
 */

import type { GridCoord } from "./iso";
import type { StatusInstance } from "./status";

/** Which side a unit fights for. */
export type Side = "player" | "enemy";

/** The minimal combat stat block (M3). All numbers are tuning values. */
export interface UnitStats {
  /** CT gauge fill per clock tick — governs turn frequency (D5). */
  speed: number;
  /** Maximum hit points. */
  maxHp: number;
  /** Raw attack power (damage before the defender's defense). */
  attack: number;
  /** Damage soak. */
  defense: number;
  /** How many tiles a unit may step in one turn. */
  moveRange: number;
  /** Vision radius for the fog-of-war seam (D18). */
  sightRadius: number;
}
/** The authored description of a unit — the data a designer writes. */
export interface UnitSpec extends UnitStats {
  id: string;
  side: Side;
  pos: GridCoord;
  /** Display name; defaults to `id`. */
  name?: string;
  /** Starting HP; defaults to `maxHp`. */
  hp?: number;
  /** Optional job id (see {@link "./jobs"}); grants the unit its skills. */
  jobId?: string;
  /** Deployment safety stat (D7/D11); defaults to 0. Higher = preps deeper safely. */
  awareness?: number;
  /**
   * Intel-gathering stat (D10); defaults to 0. Higher raises the party's passive
   * intel floor (how much it sees before a fight). Distinct from awareness.
   */
  intelligence?: number;
  /**
   * Overworld fatigue (D29/D35); defaults to 0 ("Rested"). Overworld-only — spent
   * by overworld actions, restored by rest, **never** read by combat (D29).
   */
  fatigue?: number;
  /**
   * Character level (D32 leveling seam); defaults to 1. Grows via combat XP and a
   * passive trickle **while deployed** ({@link "./leveling"}); benched = no growth.
   */
  level?: number;
  /** Accumulated experience toward the next level (D32); defaults to 0. */
  xp?: number;
  /**
   * Named campaign **lord** flag (D27 stakes seam); defaults to false. A lord
   * riding a caravan that wipes carries the `lordLost` terminal flag — the
   * game-over/reload path itself is a later pass (not built in M9).
   */
  isLord?: boolean;
}

/**
 * A live unit in a battle. Extends its authored stats with the mutable runtime:
 * current `pos`, `hp`, the `ct` gauge, `alive` flag, applied `statuses`, and a
 * generic `counters` bag (the capture-meter shape, D12).
 */
export interface Unit extends UnitStats {
  readonly id: string;
  readonly side: Side;
  readonly name: string;
  /** The unit's job, if any — the data that grants its skills. */
  readonly jobId?: string;
  /** Current tile. Replaced wholesale on a move (never mutated in place). */
  pos: GridCoord;
  hp: number;
  /** Charge-Time gauge; a unit takes a turn at `ct >= 100` (D5). */
  ct: number;
  alive: boolean;
  /** Deployment safety stat (D7/D11): bigger safe allowance, gentler exposure. */
  awareness: number;
  /** Intel-gathering stat (D10): raises the party's passive intel floor. */
  intelligence: number;
  /**
   * Overworld fatigue (D29/D35): spent by overworld actions, restored by rest.
   * **Overworld-only** — ignored by the CT clock and every combat stat (D29).
   */
  fatigue: number;
  /** Character level (D32): grows deployed, never benched ({@link "./leveling"}). */
  level: number;
  /** Experience toward the next level (D32). */
  xp: number;
  /** Named campaign lord (D27 stakes seam); a wipe carrying one flags `lordLost`. */
  isLord: boolean;
  /**
   * Captured (D7): bound on the map, doesn't take turns, excluded from the
   * initiative seed, but still "alive" — a rescuable sub-objective.
   */
  captured: boolean;
  /** Active statuses (D12); ticked on the unit's turn start. */
  statuses: StatusInstance[];
  /** Generic per-unit counters, e.g. a capture meter (D12). */
  counters: Record<string, number>;
}

/** Inflate an authored {@link UnitSpec} into a live {@link Unit}. */
export function createUnit(spec: UnitSpec): Unit {
  return {
    id: spec.id,
    side: spec.side,
    name: spec.name ?? spec.id,
    jobId: spec.jobId,
    pos: { col: spec.pos.col, row: spec.pos.row },
    hp: spec.hp ?? spec.maxHp,
    maxHp: spec.maxHp,
    ct: 0,
    alive: true,
    awareness: spec.awareness ?? 0,
    intelligence: spec.intelligence ?? 0,
    fatigue: spec.fatigue ?? 0,
    level: spec.level ?? 1,
    xp: spec.xp ?? 0,
    isLord: spec.isLord ?? false,
    captured: false,
    speed: spec.speed,
    attack: spec.attack,
    defense: spec.defense,
    moveRange: spec.moveRange,
    sightRadius: spec.sightRadius,
    statuses: [],
    counters: {},
  };
}

/** Living units on a given side. */
export function livingUnits(units: readonly Unit[], side?: Side): Unit[] {
  return units.filter((u) => u.alive && (side === undefined || u.side === side));
}
