/**
 * Leveling — the D32 growth seam (thin).
 *
 * M9 lands only the **seam** D32 calls for: a per-character `level`/`xp` (on
 * {@link "./units".Unit}) and the recorded rule **"deployed grows, benched
 * doesn't."** The full FFT model — secondary-class slotting, use-leveling of
 * secondary abilities, the slot UI — is a later pass (see D32). What's here is
 * just enough to prove the rule headlessly:
 *
 * - **Combat XP** ({@link grantCombatXp}) — combat jobs level via combat, as today.
 * - **Deployed trickle** ({@link accrueDeployedXp}) — a passive trickle for the
 *   characters **deployed on an adventure** (a caravan's party). **Benched roster
 *   never accrues** — sitting in the guild hall is never free training.
 *
 * Pure logic: no Phaser, no DOM, no `Math.random` (leveling is deterministic).
 */

import type { Unit } from "./units";

/** Leveling tuning — all data, a numbers pass later (D32). */
export const LEVELING = {
  /** XP needed to advance one level (flat for the M9 seam; a curve comes later). */
  xpPerLevel: 100,
  /** Passive XP a **deployed** character trickles per node-step on the road. */
  deployedTrickle: 5,
  /** Bonus XP for a successful non-combat ability use (the use-leveling hook). */
  abilityUseBonus: 10,
} as const;

/**
 * Grant XP and apply any level-ups, capping carry-over so a big award can raise
 * more than one level. Returns the number of levels gained (0 if none).
 */
export function grantXp(unit: Unit, amount: number): number {
  if (amount <= 0) return 0;
  unit.xp += amount;
  let gained = 0;
  while (unit.xp >= LEVELING.xpPerLevel) {
    unit.xp -= LEVELING.xpPerLevel;
    unit.level += 1;
    gained += 1;
  }
  return gained;
}

/** Combat XP — the as-today path for combat jobs. Returns levels gained. */
export function grantCombatXp(unit: Unit, amount: number): number {
  return grantXp(unit, amount);
}

/**
 * The deployed trickle (D32): every **deployed** character (a caravan's party)
 * accrues a passive bump per node-step on the road. **Benched roster is not passed
 * in**, so it never grows — the whole point of the rule. Returns the per-unit
 * levels gained, keyed by unit id.
 */
export function accrueDeployedXp(
  deployed: readonly Unit[],
  amount = LEVELING.deployedTrickle,
): Record<string, number> {
  const gained: Record<string, number> = {};
  for (const u of deployed) {
    if (!u.alive) continue;
    const lv = grantXp(u, amount);
    if (lv > 0) gained[u.id] = lv;
  }
  return gained;
}

/** A successful non-combat ability use bumps the user (the use-leveling hook, D32). */
export function grantAbilityUseXp(unit: Unit): number {
  return grantXp(unit, LEVELING.abilityUseBonus);
}
