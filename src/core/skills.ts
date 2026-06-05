/**
 * Skills as data (M4 / D3).
 *
 * A skill is a plain data record — never a subclass. It declares which **phase**
 * it hooks, what it **targets**, its **range**, the CT it **spends**, and a
 * declarative **effect** the resolver interprets against the battle. New skills
 * are new data; the battle loop needs no new branches. M4 exercises the
 * `battle`-phase skills; the other phases are laid as the D3 seam.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit } from "./units";
import type { EventBus } from "./events";
import type { StatusInstance } from "./status";
import { resolveAttack, manhattan } from "./combat";
import { applyStatus } from "./status";

/** The ordered phases of the game pipeline (D3). */
export type Phase = "meta" | "deployment" | "battle" | "resolution";

/**
 * Who a skill is aimed at. `self`/`enemy`/`ally` are battle targets (a unit);
 * `camp` (economy/morale) and `party` (a whole-party buff) are non-combat
 * targets resolved by the meta/deployment phases, not against a single unit.
 */
export type SkillTarget = "self" | "enemy" | "ally" | "camp" | "party";

/** A heavier strike: deal damage as if the caster's attack were `+bonusAttack`. */
export interface DamageEffect {
  kind: "damage";
  bonusAttack: number;
}
/** Restore HP to the target (capped at maxHp). */
export interface HealEffect {
  kind: "heal";
  amount: number;
}
/** Apply a status to the target (buff or debuff). */
export interface StatusEffect {
  kind: "status";
  status: Omit<StatusInstance, "data"> & { data?: Record<string, unknown> };
}

/** Meta/economy: the Merchant adds gold and storage to the camp. */
export interface EconomyEffect {
  kind: "economy";
  gold: number;
  storage: number;
}
/** Meta/camp: the Chef raises party morale and banks a between-battle heal. */
export interface MoraleEffect {
  kind: "morale";
  morale: number;
  /** HP healed to each unit at the start of the next battle. */
  partyHeal: number;
}
/** Deployment: the Survivalist places a trap dealing `damage` when sprung. */
export interface PlaceTrapEffect {
  kind: "placeTrap";
  damage: number;
}

/** The declarative effect a skill applies when it resolves. */
export type SkillEffect =
  | DamageEffect
  | HealEffect
  | StatusEffect
  | EconomyEffect
  | MoraleEffect
  | PlaceTrapEffect;

/** Effect kinds resolved against a unit in the Battle phase. */
export type BattleEffectKind = "damage" | "heal" | "status";

/** A skill definition — pure data authored in a job file. */
export interface SkillDef {
  id: string;
  name: string;
  description: string;
  /** Which phase of the pipeline this skill acts in (D3). */
  phase: Phase;
  /** Who it can be aimed at. */
  target: SkillTarget;
  /** Range in tiles (Manhattan). `self` skills use 0. */
  range: number;
  /** CT cost after use — battle skills are Acts (the expensive option, D5). */
  spend: "act" | "move";
  effect: SkillEffect;
}

/** What a resolved skill did, for the caller / render layer to report. */
export interface SkillOutcome {
  damage?: number;
  healed?: number;
  status?: string;
}

/** True if `target` is a legal target for `skill` cast by `caster`. */
export function isValidSkillTarget(
  skill: SkillDef,
  caster: Unit,
  target: Unit,
): boolean {
  switch (skill.target) {
    case "self":
      return target === caster && caster.alive;
    case "enemy":
      return (
        target.alive &&
        target.side !== caster.side &&
        manhattan(caster.pos, target.pos) <= skill.range
      );
    case "ally":
      return (
        target.alive &&
        target.side === caster.side &&
        manhattan(caster.pos, target.pos) <= skill.range
      );
  }
  // `camp` / `party` are non-combat targets — never a valid single-unit target.
  return false;
}

/**
 * Apply a skill's effect to a target. Emits the relevant bus events (damage /
 * heal) so listeners and the render layer react. Returns what happened.
 */
export function resolveSkill(
  skill: SkillDef,
  caster: Unit,
  target: Unit,
  bus?: EventBus,
): SkillOutcome {
  const effect = skill.effect;
  switch (effect.kind) {
    case "damage": {
      const damage = resolveAttack(
        caster,
        target,
        bus,
        caster.attack + effect.bonusAttack,
      );
      return { damage };
    }
    case "heal": {
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + effect.amount);
      const healed = target.hp - before;
      bus?.emit("unitHealed", { unit: target, amount: healed, source: caster });
      return { healed };
    }
    case "status": {
      applyStatus(target, { ...effect.status });
      return { status: effect.status.id };
    }
  }
  // Non-combat effects (economy/morale/placeTrap) resolve in their own phase
  // (see camp.ts / makeTrap), not against a single unit.
  throw new Error(`resolveSkill: "${effect.kind}" is not a Battle-phase effect`);
}
