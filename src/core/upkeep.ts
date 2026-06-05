/**
 * Between-battle camp: Upkeep (D15) + Rest-Point recovery (D9).
 *
 * Two between-night systems live here, both feeding the run's camp state:
 *
 * **Upkeep (D15)** — maintenance collapses into a single **gold figure** = the
 * sum of per-job budget lines (Food, Repairs). Pay the total (the chore), or
 * **underfund a line** when broke (the *choice*): a breach costs **morale** (Food
 * a high hit, Repairs moderate + worn gear). Food is gold, not a carried item, so
 * it never competes for storage slots.
 *
 * **Rest-Point recovery (D9)** — support roles bank **Rest Points** per night;
 * RP converts to healing at `RP_PER_CHUNK` → one chunk of `CHUNK_FRACTION` max
 * HP, spent by **triage** (allocate to chosen units). Difficulty scales
 * `RP_PER_CHUNK` only. The **cleric** is a separate gold sink: an emergency revive
 * for a Hard-mode dying unit.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit } from "./units";
import type { Camp } from "./camp";
import { getJob } from "./jobs";
import type { DifficultyPolicy } from "./mortality";
import { DYING_COUNTER } from "./mortality";

// --- Upkeep (D15) -----------------------------------------------------------

/** Tuning for the Upkeep lines (all data, configurable). */
export const UPKEEP = {
  /** Per-roster-unit food cost without a Chef. */
  foodPerUnit: 2,
  /** Per-roster-unit food cost with a Chef in the party (the discount). */
  chefFoodPerUnit: 1,
  /** Per-roster-unit repairs cost. */
  repairsPerUnit: 1,
  /** Morale hit when Food is underfunded (high — hunger bites fast, D15). */
  foodMoraleHit: -3,
  /** Morale hit when Repairs are underfunded (moderate, D15). */
  repairsMoraleHit: -1,
} as const;

/** One Upkeep budget line. */
export interface UpkeepLine {
  id: "food" | "repairs";
  name: string;
  cost: number;
  /** Morale hit if this line is underfunded. */
  moraleHit: number;
}

/** A computed Upkeep bill — the lines and their total gold figure. */
export interface UpkeepBill {
  lines: UpkeepLine[];
  total: number;
}

/** True if any party member is a Chef (unlocks the food discount, D15). */
function hasChef(party: readonly Unit[]): boolean {
  return party.some((u) => getJob(u.jobId)?.upkeep?.food !== undefined);
}

/**
 * Compute the night's Upkeep bill for a roster (D15). Food scales per unit
 * (cheaper with a Chef); Repairs scale per unit. The total is the single number
 * shown on the camp menu.
 */
export function computeUpkeep(party: readonly Unit[]): UpkeepBill {
  const size = party.length;
  const foodPerUnit = hasChef(party) ? UPKEEP.chefFoodPerUnit : UPKEEP.foodPerUnit;
  const lines: UpkeepLine[] = [
    { id: "food", name: "Food", cost: foodPerUnit * size, moraleHit: UPKEEP.foodMoraleHit },
    { id: "repairs", name: "Repairs", cost: UPKEEP.repairsPerUnit * size, moraleHit: UPKEEP.repairsMoraleHit },
  ];
  return { lines, total: lines.reduce((s, l) => s + l.cost, 0) };
}

/** The result of paying (or underfunding) Upkeep. */
export interface UpkeepResult {
  paid: number;
  underfunded: UpkeepLine["id"][];
  /** Net morale change applied (<= 0). */
  moraleDelta: number;
  /** True if Repairs were skipped → gear condition slips (−defense/−crit, D15). */
  gearWorn: boolean;
}

/**
 * Pay Upkeep from the camp's gold (D15). Funds as many lines as gold allows
 * (Food first — skipping it guts morale); any unfunded line breaches: deduct its
 * morale hit and, for Repairs, flag worn gear. Returns what was paid/skipped.
 */
export function payUpkeep(camp: Camp, party: readonly Unit[]): UpkeepResult {
  const bill = computeUpkeep(party);
  // Food before Repairs: skipping food is the harsher breach, so fund it first.
  const ordered = [...bill.lines].sort((a, b) =>
    a.id === "food" ? -1 : b.id === "food" ? 1 : 0,
  );
  let paid = 0;
  let moraleDelta = 0;
  const underfunded: UpkeepLine["id"][] = [];
  let gearWorn = false;
  for (const line of ordered) {
    if (camp.gold >= line.cost) {
      camp.gold -= line.cost;
      paid += line.cost;
    } else {
      underfunded.push(line.id);
      moraleDelta += line.moraleHit;
      if (line.id === "repairs") gearWorn = true;
    }
  }
  camp.morale += moraleDelta;
  return { paid, underfunded, moraleDelta, gearWorn };
}

// --- Rest-Point recovery (D9) -----------------------------------------------

/** Fraction of max HP one healing chunk restores (default 1/8, D9). */
export const CHUNK_FRACTION = 1 / 8;

/** Rest Points the party banks in one night = Σ each role's contribution (D9). */
export function rpPerNight(party: readonly Unit[]): number {
  let rp = 0;
  for (const u of party) {
    if (!u.alive) continue;
    rp += getJob(u.jobId)?.restPoints ?? 0;
  }
  return rp;
}

/** HP one chunk heals for a unit (rounded up, at least 1). */
export function chunkHp(unit: Unit): number {
  return Math.max(1, Math.ceil(unit.maxHp * CHUNK_FRACTION));
}

/** The result of a triage allocation. */
export interface TriageResult {
  rpSpent: number;
  chunks: number;
  hpHealed: number;
}

/**
 * Triage-heal one unit from a Rest-Point pool (D9): spend whole chunks
 * (`policy.rpPerChunk` RP each → `CHUNK_FRACTION` max HP), capped by available RP
 * and the unit's missing HP. Difficulty scales `rpPerChunk` *only*. Mutates the
 * unit's HP; returns RP spent and HP healed. (A downed/dying unit isn't a triage
 * target — that's the cleric's job.)
 */
export function triageHeal(
  unit: Unit,
  availableRp: number,
  policy: DifficultyPolicy,
): TriageResult {
  if (!unit.alive || unit.hp >= unit.maxHp) {
    return { rpSpent: 0, chunks: 0, hpHealed: 0 };
  }
  const perChunk = chunkHp(unit);
  const missing = unit.maxHp - unit.hp;
  const maxChunksByRp = Math.floor(availableRp / policy.rpPerChunk);
  const maxChunksByHp = Math.ceil(missing / perChunk);
  const chunks = Math.min(maxChunksByRp, maxChunksByHp);
  if (chunks <= 0) return { rpSpent: 0, chunks: 0, hpHealed: 0 };
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + chunks * perChunk);
  return { rpSpent: chunks * policy.rpPerChunk, chunks, hpHealed: unit.hp - before };
}

// --- The cleric (D9 economy sink) -------------------------------------------

/** Default cost in gold to revive a dying unit (an emergency life-save, D9). */
export const CLERIC_COST = 120;

/** The result of a cleric revive attempt. */
export interface ClericResult {
  revived: boolean;
  goldSpent: number;
}

/**
 * Pay the local cleric to pull a **dying** unit off the clock (D9 Hard mode) —
 * an emergency life-save, *not* general healing. Spends gold from the camp,
 * clears the dying clock, and revives the unit battered (at one chunk of HP).
 * Returns whether it succeeded.
 */
export function clericRevive(camp: Camp, unit: Unit, cost = CLERIC_COST): ClericResult {
  const dying = (unit.counters[DYING_COUNTER] ?? 0) > 0 && !unit.alive;
  if (!dying || camp.gold < cost) return { revived: false, goldSpent: 0 };
  camp.gold -= cost;
  delete unit.counters[DYING_COUNTER];
  unit.alive = true;
  unit.hp = chunkHp(unit);
  return { revived: true, goldSpent: cost };
}
