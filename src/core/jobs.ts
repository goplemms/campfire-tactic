/**
 * Jobs as data (M4).
 *
 * A job is a named bundle of {@link SkillDef}s — pure data, no subclasses. A
 * unit's `jobId` links it here; {@link unitSkills} reads back its skills (filtered
 * by phase). M4 ships one combat job, the **Soldier**, whose three skills hook
 * the **Battle** phase and exercise all three effect kinds (damage / status /
 * heal). Adding a job — or a whole non-combat role later — is adding a record to
 * {@link JOBS}, nothing more.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit } from "./units";
import type { Phase, SkillDef } from "./skills";
import type { PhaseSkillRegistry } from "./phases";

/** A job definition — a named, described set of skills. */
export interface JobDef {
  id: string;
  name: string;
  description: string;
  skills: SkillDef[];
  /**
   * Rest Points this role banks per night (D9 recovery) — data, so adding a
   * healer is adding a number. Support roles (Chef, Medic, …) contribute; pure
   * combatants leave it undefined (0).
   */
  restPoints?: number;
  /**
   * Per-night Upkeep budget lines this job owns (D15). The Chef owns Food, the
   * Blacksmith Repairs; collapsed to a single gold figure in {@link "./upkeep"}.
   */
  upkeep?: { food?: number; repairs?: number };
  /**
   * True for camp-only roles (Chef, Merchant) that act in Meta but never take the
   * field — kept in the roster for Upkeep/RP/morale, excluded from combat.
   */
  noncombat?: boolean;
}

/**
 * The Soldier — a front-line combat job. Its skills are all Battle-phase Acts:
 *
 * - **Power Strike** — a heavier melee hit (damage effect).
 * - **Hamstring** — a melee hit that Immobilizes (status effect). Duration 2 so
 *   it survives the target's next turn-start tick and actually costs them a move
 *   (the AI honours `isImmobilized`).
 * - **Second Wind** — self-heal (heal effect).
 */
export const SOLDIER: JobDef = {
  id: "soldier",
  name: "Soldier",
  description: "Front-line fighter: heavy strikes, a crippling blow, and grit.",
  skills: [
    {
      id: "power-strike",
      name: "Power Strike",
      description: "A heavy melee blow (+6 attack) against an adjacent foe.",
      phase: "battle",
      target: "enemy",
      range: 1,
      spend: "act",
      effect: { kind: "damage", bonusAttack: 6 },
    },
    {
      id: "hamstring",
      name: "Hamstring",
      description: "Strike an adjacent foe and Immobilize them for a turn.",
      phase: "battle",
      target: "enemy",
      range: 1,
      spend: "act",
      effect: {
        kind: "status",
        status: { id: "immobilized", name: "Immobilized", duration: 2 },
      },
    },
    {
      id: "second-wind",
      name: "Second Wind",
      description: "Catch your breath and recover 10 HP.",
      phase: "battle",
      target: "self",
      range: 0,
      spend: "act",
      effect: { kind: "heal", amount: 10 },
    },
  ],
};

/**
 * The Survivalist — the signature **Deployment**-phase job (D3). Carries a
 * placeable trap (the first real field entity, D4): placed before battle, it
 * springs on an enemy in Combat.
 */
export const SURVIVALIST: JobDef = {
  id: "survivalist",
  name: "Survivalist",
  description: "Field-craft specialist: lays traps before the fight begins.",
  restPoints: 1,
  skills: [
    {
      id: "set-trap",
      name: "Set Trap",
      description: "Place a trap that deals 12 damage to the first enemy onto it.",
      phase: "deployment",
      target: "camp",
      range: 0,
      spend: "act",
      effect: { kind: "placeTrap", damage: 12 },
    },
  ],
};

/**
 * The Chef — the signature **Meta/camp**-phase job (D3). Cooking raises party
 * morale (D8) and banks a between-battle heal applied to the party at the start
 * of the next fight.
 */
export const CHEF: JobDef = {
  id: "chef",
  name: "Chef",
  description: "Cooks for the party: lifts morale and banks a hearty heal.",
  restPoints: 3,
  upkeep: { food: 1 }, // the Chef lowers the per-unit food cost (D15)
  noncombat: true,
  skills: [
    {
      id: "cook-stew",
      name: "Cook Stew",
      description: "Raise morale and bank +8 HP healing for each unit next battle.",
      phase: "meta",
      target: "party",
      range: 0,
      spend: "act",
      effect: { kind: "morale", morale: 1, partyHeal: 8 },
    },
  ],
};

/**
 * The Merchant — the signature **Meta/economy**-phase job (D3). Trading
 * generates gold and expands storage (the master logistics cap, D6).
 */
export const MERCHANT: JobDef = {
  id: "merchant",
  name: "Merchant",
  description: "Works the economy: generates gold and expands storage.",
  noncombat: true,
  skills: [
    {
      id: "trade",
      name: "Trade",
      description: "Earn +50 gold and add +2 storage slots.",
      phase: "meta",
      target: "camp",
      range: 0,
      spend: "act",
      effect: { kind: "economy", gold: 50, storage: 2 },
    },
  ],
};

/** The job registry — the single source jobs are loaded from. */
export const JOBS: Record<string, JobDef> = {
  [SOLDIER.id]: SOLDIER,
  [SURVIVALIST.id]: SURVIVALIST,
  [CHEF.id]: CHEF,
  [MERCHANT.id]: MERCHANT,
};

/** Look up a job by id. */
export function getJob(id: string | undefined): JobDef | undefined {
  return id === undefined ? undefined : JOBS[id];
}

/** True if a unit can take the field (jobless or a combat job, not camp-only). */
export function isCombatant(unit: Unit): boolean {
  return !getJob(unit.jobId)?.noncombat;
}

/**
 * The skills a unit has via its job, optionally filtered to one phase. Returns
 * an empty list for a unit with no job.
 */
export function unitSkills(unit: Unit, phase?: Phase): SkillDef[] {
  const job = getJob(unit.jobId);
  if (!job) return [];
  return phase ? job.skills.filter((s) => s.phase === phase) : job.skills;
}

/**
 * Register every unit's job skills into a {@link PhaseSkillRegistry}, bucketed by
 * the phase each skill hooks (D3). Call once at battle setup.
 */
export function registerParty(
  units: readonly Unit[],
  registry: PhaseSkillRegistry,
): void {
  for (const unit of units) {
    for (const skill of unitSkills(unit)) {
      registry.register(unit, skill);
    }
  }
}
