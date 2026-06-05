/**
 * The field-entity registry (D4).
 *
 * A field entity is a non-unit thing that occupies a tile and reacts to battle
 * events. M3 ships only the registry seam — no real traps/nests/runes yet
 * (those are M4–M5 data). The registry subscribes to the bus once and dispatches
 * tile-matched events to the entities standing there, so an entity is **data + a
 * callback**, never a special case in the loop.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit, Side } from "./units";
import type { GridCoord } from "./iso";
import type { EventBus } from "./events";
import { applyDamage } from "./combat";

/** Context handed to an entity's tile callbacks. */
export interface EntityEnterContext {
  unit: Unit;
  tile: GridCoord;
  /** True when the unit was pushed/pulled onto the tile (D19). */
  forced: boolean;
  bus: EventBus;
}

/**
 * A placed field entity. All behaviour is optional callbacks — a trap fills in
 * `onUnitEnterTile`, a nest would fill in an aura hook later, etc.
 */
export interface FieldEntity {
  id: string;
  pos: GridCoord;
  /** Which side placed it (entities can be enemy-owned, D12). */
  owner?: Side;
  /** Fires when a unit enters this entity's tile (the trap/snare hook). */
  onUnitEnterTile?(ctx: EntityEnterContext): void;
  /** Fires when a unit leaves this entity's tile. */
  onUnitLeaveTile?(ctx: Omit<EntityEnterContext, "forced">): void;
}

function sameTile(a: GridCoord, b: GridCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

/**
 * Registers field entities and wires them to the bus. Construct it with the
 * battle's {@link EventBus}; it subscribes to enter/leave once and routes those
 * events to whichever entities occupy the affected tile.
 */
export class EntityRegistry {
  private readonly entities = new Map<string, FieldEntity>();
  private readonly bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
    this.bus.on("unitEnterTile", ({ unit, tile, forced }) => {
      for (const e of this.at(tile)) {
        e.onUnitEnterTile?.({ unit, tile, forced: forced ?? false, bus });
      }
    });
    this.bus.on("unitLeaveTile", ({ unit, tile }) => {
      for (const e of this.at(tile)) {
        e.onUnitLeaveTile?.({ unit, tile, bus });
      }
    });
  }

  /** Register (or replace) an entity. */
  register(entity: FieldEntity): void {
    this.entities.set(entity.id, entity);
  }

  /** Remove an entity by id; returns true if one was present. */
  remove(id: string): boolean {
    return this.entities.delete(id);
  }

  /** All registered entities. */
  all(): FieldEntity[] {
    return [...this.entities.values()];
  }

  /** Entities occupying a given tile. */
  at(tile: GridCoord): FieldEntity[] {
    return this.all().filter((e) => sameTile(e.pos, tile));
  }
}

/**
 * The first data-defined field entity (D4): a **trap** the Survivalist places in
 * Deployment. A one-shot listener on `onUnitEnterTile` — when a unit of the
 * *opposing* side steps (or is pushed, D19) onto its tile, it deals `damage` once
 * and is spent. This is the Deployment→Combat payoff the whole bus/registry seam
 * was built for; later placeables (nests, runes) are the same shape with
 * different effects.
 */
export function makeTrap(
  id: string,
  pos: GridCoord,
  owner: Side,
  damage: number,
): FieldEntity {
  let sprung = false;
  return {
    id,
    pos: { col: pos.col, row: pos.row },
    owner,
    onUnitEnterTile: ({ unit, bus }) => {
      if (sprung || unit.side === owner) return;
      sprung = true;
      applyDamage(unit, damage, bus);
    },
  };
}
