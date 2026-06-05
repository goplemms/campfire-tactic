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

/** The job registry — the single source jobs are loaded from. */
export const JOBS: Record<string, JobDef> = {
  [SOLDIER.id]: SOLDIER,
};

/** Look up a job by id. */
export function getJob(id: string | undefined): JobDef | undefined {
  return id === undefined ? undefined : JOBS[id];
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
