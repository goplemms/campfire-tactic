/**
 * The Charge-Time (CT) clock (D5) — an FFT-style continuous action economy.
 *
 * No discrete rounds. The clock advances in **ticks**; on each tick every living
 * unit's `ct += speed`. A unit takes a turn at `ct >= TURN_THRESHOLD`; after the
 * turn its CT is **spent down** — acting costs more than only moving, so movers
 * come back up sooner. Speed therefore governs *how often* a unit acts.
 *
 * The clock also owns a **scheduled-effects queue** (the D5 charged-ability /
 * D16 entity-chain primitive): an effect carries its own `speed` gauge, fills it
 * each tick, and **resolves later** when the gauge fills — exactly how a slow
 * charged spell or a delayed combo lands on the timeline.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit, Side } from "./units";
import type { EventBus } from "./events";

/** CT needed to take a turn. */
export const TURN_THRESHOLD = 100;
/** CT spent when a unit Acts (the expensive option). */
export const ACT_COST = 100;
/** CT spent when a unit only Moves (cheaper — it comes back up sooner). */
export const MOVE_COST = 50;
/** A scheduled effect resolves when its gauge reaches this. */
export const CHARGE_THRESHOLD = 100;

/** What a unit did on its turn, used to compute spend-down. */
export interface TurnSpend {
  moved?: boolean;
  acted?: boolean;
}

/**
 * An effect committed to the timeline. Its `gauge` fills by `speed` each tick;
 * when it reaches {@link CHARGE_THRESHOLD} the clock calls `run` and (if a bus
 * is wired) emits `chargeResolved`. `speed >= CHARGE_THRESHOLD` resolves on the
 * next tick (an "instant" chain); a small speed becomes a disruptable timer.
 */
export interface ScheduledEffect {
  id: string;
  speed: number;
  /** Current fill; starts at 0. */
  gauge?: number;
  run: () => void;
}

/** Average Speed of a side's living units — the initiative seed source (D11). */
export function sideSeed(units: readonly Unit[], side: Side): number {
  const own = units.filter((u) => u.alive && u.side === side);
  if (own.length === 0) return 0;
  const total = own.reduce((sum, u) => sum + u.speed, 0);
  return total / own.length;
}

/** The CT clock over a fixed set of units. */
export class CTClock {
  /** Total ticks elapsed (the global timeline position). */
  time = 0;
  private readonly units: Unit[];
  private readonly bus?: EventBus;
  private scheduled: ScheduledEffect[] = [];

  constructor(units: Unit[], bus?: EventBus) {
    this.units = units;
    this.bus = bus;
  }

  /**
   * Seed each side's starting CT from its units' average Speed (D11). The faster
   * side starts warmer and reaches the threshold first — so losing a unit (a
   * lower seed) hands the enemy early tempo.
   */
  seedInitiative(): void {
    const seeds = new Map<Side, number>();
    for (const u of this.units) {
      if (!seeds.has(u.side)) seeds.set(u.side, sideSeed(this.units, u.side));
    }
    for (const u of this.units) {
      u.ct = seeds.get(u.side) ?? 0;
    }
  }

  /** Commit an effect to the timeline. */
  schedule(effect: ScheduledEffect): void {
    this.scheduled.push({ gauge: 0, ...effect });
  }

  /** How many effects are still charging. */
  pendingEffects(): number {
    return this.scheduled.length;
  }

  /**
   * Advance the clock one tick: fill + resolve scheduled effects, then add each
   * living unit's Speed to its CT.
   */
  tick(): void {
    this.time += 1;

    // 1) Charged effects fill and resolve first, so a charge landing this tick
    //    is processed before units act on it.
    if (this.scheduled.length > 0) {
      const ready: ScheduledEffect[] = [];
      for (const e of this.scheduled) {
        e.gauge = (e.gauge ?? 0) + e.speed;
        if (e.gauge >= CHARGE_THRESHOLD) ready.push(e);
      }
      if (ready.length > 0) {
        this.scheduled = this.scheduled.filter((e) => !ready.includes(e));
        for (const e of ready) {
          e.run();
          this.bus?.emit("chargeResolved", { id: e.id });
        }
      }
    }

    // 2) Every living unit charges by its Speed.
    for (const u of this.units) {
      if (u.alive) u.ct += u.speed;
    }
  }

  /**
   * Tick until a living unit is ready (`ct >= TURN_THRESHOLD`), then return the
   * readiest one (highest CT, ties broken by Speed, then id for determinism).
   * Returns `null` if no living unit can ever act.
   */
  advanceToNextActor(): Unit | null {
    if (this.units.every((u) => !u.alive)) return null;
    let guard = 0;
    const GUARD_MAX = 1_000_000;
    while (!this.units.some((u) => u.alive && u.ct >= TURN_THRESHOLD)) {
      this.tick();
      if (++guard > GUARD_MAX) return null;
      if (this.units.every((u) => !u.alive)) return null;
    }
    const ready = this.units.filter((u) => u.alive && u.ct >= TURN_THRESHOLD);
    ready.sort(
      (a, b) => b.ct - a.ct || b.speed - a.speed || a.id.localeCompare(b.id),
    );
    return ready[0];
  }

  /**
   * Spend a unit's CT after its turn. Acting is the expensive option; a unit
   * that only moved comes back up sooner. A unit that did neither (waited) pays
   * the move cost so the clock can't stall.
   */
  spend(unit: Unit, spend: TurnSpend): void {
    const cost = spend.acted ? ACT_COST : MOVE_COST;
    unit.ct -= cost;
  }
}
