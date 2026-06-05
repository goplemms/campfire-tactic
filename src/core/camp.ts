/**
 * Camp state — the Meta-phase economy + morale the non-combat jobs act on (M5).
 *
 * The signature jobs hook *different* phases (D3): the **Merchant** works the
 * economy (gold + storage), the **Chef** raises **morale** (D8) and banks a
 * between-battle **party heal**. Both act here, in camp, then their effects carry
 * into the following battle. This module is the small state object + the pure
 * functions that apply those effects.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit } from "./units";
import type { EventBus } from "./events";
import type { SkillDef } from "./skills";

/** Mutable camp / meta state. */
export interface Camp {
  /** Currency (Merchant generates it). */
  gold: number;
  /** Storage capacity in slots (Merchant raises it). */
  storageCap: number;
  /** Party morale, a banded value (D8); higher is better. */
  morale: number;
  /** HP the Chef has banked to heal each unit at the next battle's start. */
  pendingHeal: number;
}

/** A fresh camp with sensible starting values. */
export function createCamp(init: Partial<Camp> = {}): Camp {
  return {
    gold: init.gold ?? 0,
    storageCap: init.storageCap ?? 6,
    morale: init.morale ?? 0,
    pendingHeal: init.pendingHeal ?? 0,
  };
}

/** Morale tiers (D8 banding): a legible label for the current morale value. */
export type MoraleTier = "Low" | "Neutral" | "High" | "Inspired";

/** Band a raw morale value into its tier (asymmetric — the floor is shallow). */
export function moraleTier(morale: number): MoraleTier {
  if (morale < 0) return "Low";
  if (morale === 0) return "Neutral";
  if (morale < 3) return "High";
  return "Inspired";
}

/** What a camp skill changed, for the render layer to report. */
export interface CampOutcome {
  gold?: number;
  storage?: number;
  morale?: number;
  bankedHeal?: number;
}

/**
 * Apply a Meta-phase skill's effect to the camp. Handles the Merchant's
 * `economy` effect and the Chef's `morale` effect; other effect kinds are not
 * camp effects and throw.
 */
export function applyCampSkill(skill: SkillDef, camp: Camp): CampOutcome {
  const effect = skill.effect;
  switch (effect.kind) {
    case "economy":
      camp.gold += effect.gold;
      camp.storageCap += effect.storage;
      return { gold: effect.gold, storage: effect.storage };
    case "morale":
      camp.morale += effect.morale;
      camp.pendingHeal += effect.partyHeal;
      return { morale: effect.morale, bankedHeal: effect.partyHeal };
  }
  throw new Error(`applyCampSkill: "${effect.kind}" is not a camp effect`);
}

/**
 * Apply the camp's banked buffs to a battle's units at battle start: heal each
 * living unit by `pendingHeal` (capped at maxHp, emitting `unitHealed`), then
 * clear the bank. Returns the total HP restored.
 */
export function applyCampToParty(
  camp: Camp,
  units: readonly Unit[],
  bus?: EventBus,
): number {
  if (camp.pendingHeal <= 0) return 0;
  let total = 0;
  for (const u of units) {
    if (!u.alive || u.side !== "player") continue;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + camp.pendingHeal);
    const healed = u.hp - before;
    total += healed;
    if (healed > 0) bus?.emit("unitHealed", { unit: u, amount: healed });
  }
  camp.pendingHeal = 0;
  return total;
}
