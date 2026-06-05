/**
 * Run-loop orchestrator (M6) — the single entry the render layer drives.
 *
 * Steps a seeded run through the phase pipeline Camp → Deployment → Battle →
 * Resolution → next, applying Upkeep/recovery (D9/D15), rewards, material
 * recovery (D13), auto-rescue (D21) and the mortality policy (D9) between
 * encounters, until {@link RunLoop.isOver}. The orchestrator owns the *wiring*;
 * each rule still lives in its own core module — it just sequences them and
 * threads the run's single RNG so the whole run is deterministic.
 *
 * Pure logic: no Phaser, no DOM. Headlessly testable: {@link RunLoop.autoBattle}
 * plays a battle to a decision deterministically so a test can run a full run to
 * a wipe and replay a seed.
 */

import type { Unit } from "./units";
import type { GridCoord } from "./iso";
import { TileGrid } from "./grid";
import { Battle } from "./turn";
import { buildGrid, buildEnemies, type EncounterDef } from "./generation";
import {
  type RunState,
  runDifficulty,
  currentEncounter,
  combatRoster,
  isRunOver,
  removeFromRoster,
  advanceRun,
} from "./run";
import { moraleModifiers } from "./morale";
import { moraleTier } from "./camp";
import { applyCampToParty } from "./camp";
import { freeCaptive } from "./deployment";
import { recoverMaterials } from "./resolution";
import { addItem } from "./inventory";
import { resolveDowned, resolveCaptured, tickDyingClocks, type DownedOutcome, type RescueQuest } from "./mortality";
import { rpPerNight, payUpkeep, type UpkeepResult } from "./upkeep";
import { intelFloor, readEncounter, type IntelReport, type IntelTier } from "./intel";
import { planEnemyTurn } from "./ai";

/** What a resolved encounter produced (for the render/run-end screen). */
export interface ResolveResult {
  winner?: "player" | "enemy";
  goldEarned: number;
  recovered: string[];
  rescued: string[];
  downed: DownedOutcome[];
  permadeaths: string[];
  rescueQuests: RescueQuest[];
  over: boolean;
}

/** What the nightly camp step produced. */
export interface CampResult {
  upkeep: UpkeepResult;
  rpAdded: number;
  dyingLost: string[];
}

/** The run-loop orchestrator. */
export class RunLoop {
  readonly run: RunState;
  /** The encounter currently being played (set by {@link startEncounter}). */
  encounter?: EncounterDef;
  /** The live battle for the current encounter. */
  battle?: Battle;
  /** Player combatants placed for the current encounter. */
  combatants: Unit[] = [];

  constructor(run: RunState) {
    this.run = run;
  }

  /** True once the run has ended (a wipe). */
  isOver(): boolean {
    return this.run.over;
  }

  // --- Camp (between battles, D9/D15) ---------------------------------------

  /**
   * Run the nightly camp upkeep + recovery (D9/D15): pay Upkeep (underfunding a
   * line hits morale), bank Rest Points, and tick any Hard-mode dying clocks —
   * removing units whose clock ran out (permadeath). RP triage and cleric
   * revives are explicit player actions on {@link "./upkeep"}.
   */
  camp(): CampResult {
    const upkeep = payUpkeep(this.run.camp, this.run.party);
    const rpAdded = rpPerNight(this.run.party);
    this.run.rp += rpAdded;
    const lost = tickDyingClocks(this.run.party);
    const dyingLost = lost.map((u) => u.id);
    for (const u of lost) removeFromRoster(this.run, u);
    this.run.over = isRunOver(this.run);
    return { upkeep, rpAdded, dyingLost };
  }

  // --- Intel (D10) ----------------------------------------------------------

  /** The current encounter's intel report at the party's floor tier (D10). */
  intel(extraTier = 0): IntelReport {
    const def = this.encounter ?? currentEncounter(this.run);
    const tier = Math.min(3, intelFloor(this.run.party) + extraTier) as IntelTier;
    return readEncounter(def, tier);
  }

  // --- Battle setup ---------------------------------------------------------

  /**
   * Generate and stage the current encounter: build the grid, inflate enemies,
   * place the active roster on the home (left) edge, and create the {@link Battle}
   * the render drives. `deploymentPenalty` shrinks the player's usable home
   * columns (the D9 rescue "ambush-in-reverse" modifier).
   */
  startEncounter(deploymentPenalty = 0): Battle {
    const def = currentEncounter(this.run);
    this.encounter = def;
    const grid = buildGrid(def);
    const enemies = buildEnemies(def);
    const players = combatRoster(this.run);
    this.placePlayers(players, grid, def, deploymentPenalty);
    this.combatants = players;
    this.battle = new Battle(grid, [...players, ...enemies]);
    return this.battle;
  }

  /** Position player combatants on the left edge, resetting combat-scoped state. */
  private placePlayers(
    players: Unit[],
    grid: TileGrid,
    def: EncounterDef,
    deploymentPenalty: number,
  ): void {
    // The rescue modifier pushes the home edge inward (fewer columns to set up).
    const homeCols = Math.max(1, 2 - Math.min(1, deploymentPenalty));
    const taken = new Set<string>();
    for (const block of def.blocked) taken.add(`${block.col},${block.row}`);
    players.forEach((u, i) => {
      let pos: GridCoord = { col: i % homeCols, row: i % def.rows };
      for (let row = 0; row < def.rows; row++) {
        for (let col = 0; col < homeCols; col++) {
          const key = `${col},${row}`;
          if (!taken.has(key) && grid.isWalkable({ col, row })) {
            pos = { col, row };
            taken.add(key);
            row = def.rows;
            break;
          }
        }
      }
      taken.add(`${pos.col},${pos.row}`);
      u.pos = pos;
      u.ct = 0;
      u.statuses = [];
      u.captured = false;
    });
  }

  /**
   * Begin the staged battle: apply the Chef's banked heal and seed initiative
   * warmed by the current morale tier (D8). Returns the HP healed.
   */
  beginBattle(): number {
    if (!this.battle) throw new Error("RunLoop.beginBattle: no staged battle");
    const healed = applyCampToParty(this.run.camp, this.battle.units, this.battle.bus);
    const mods = moraleModifiers(moraleTier(this.run.camp.morale));
    this.battle.seed(mods.initiativeBonus);
    return healed;
  }

  // --- Resolution (D13/D21/D9) ----------------------------------------------

  /**
   * Resolve the finished battle: award gold (morale gold-find bonus, D8) and
   * material drops on a win, recover unsprung materials (D13), auto-rescue still-
   * captured allies (D21), apply the mortality policy to downed units (D9) with
   * permadeath removal, turn any non-win captives into rescue quests, then
   * advance the run. Returns a full summary for the render/run-end screen.
   */
  resolve(): ResolveResult {
    if (!this.battle || !this.encounter) throw new Error("RunLoop.resolve: no battle");
    const battle = this.battle;
    const def = this.encounter;
    const policy = runDifficulty(this.run);
    const outcome = battle.outcome();
    const winner = outcome.winner;
    const won = winner === "player";

    // Rewards + material recovery (win only).
    let goldEarned = 0;
    const recovered: string[] = [];
    if (won) {
      const mods = moraleModifiers(moraleTier(this.run.camp.morale));
      goldEarned = Math.round(def.reward.gold * (1 + mods.goldFindBonus));
      this.run.camp.gold += goldEarned;
      for (const drop of def.reward.materials) {
        // Add drops up to the storage cap; overflow is simply lost (D6).
        for (let i = 0; i < drop.count; i++) addItem(this.run.inventory, drop.id);
      }
      const rec = recoverMaterials(battle.entities.all(), winner, this.run.inventory);
      recovered.push(...rec.recovered);
    }

    // Auto-rescue still-captured allies on a win (D21).
    const rescued: string[] = [];
    const rescueQuests: RescueQuest[] = [];
    for (const u of this.combatants) {
      if (!u.captured) continue;
      if (won) {
        freeCaptive(u);
        rescued.push(u.id);
      } else {
        rescueQuests.push(resolveCaptured(policy, u)); // a follow-up quest, not death
      }
    }

    // Mortality (D9): on a **win**, resolve every downed player combatant per the
    // difficulty policy (Easy full-heal … Hardest permadeath) — the run continues.
    // A **lost** battle is the run-ending wipe itself (the party went down), so the
    // per-unit recovery policy doesn't apply — there's no camp to recover in.
    const downed: DownedOutcome[] = [];
    const permadeaths: string[] = [];
    if (won) {
      for (const u of this.combatants) {
        if (u.alive || u.captured) continue;
        const res = resolveDowned(policy, u);
        downed.push(res);
        if (res.permadeath) {
          removeFromRoster(this.run, u);
          permadeaths.push(u.id);
        }
      }
    }

    let over: boolean;
    if (won) {
      over = advanceRun(this.run, {
        index: def.index,
        type: def.type,
        winner,
        goldEarned,
        fallen: [...permadeaths],
      });
    } else {
      // The party lost the field — the run ends here (permadeath of the run).
      this.run.history.push({
        index: def.index,
        type: def.type,
        winner,
        goldEarned: 0,
        fallen: this.combatants.filter((u) => !u.alive).map((u) => u.id),
        night: this.run.night,
      });
      this.run.over = true;
      over = true;
    }

    this.battle = undefined;
    this.encounter = undefined;
    this.combatants = [];

    return { winner, goldEarned, recovered, rescued, downed, permadeaths, rescueQuests, over };
  }

  // --- Headless auto-play (tests / fast-forward) ----------------------------

  /**
   * Play the current battle to a decision **deterministically** — both sides use
   * the same nearest-enemy AI, threading no randomness beyond the clock's stable
   * tie-breaks. Returns the winning side. Used by the full-loop integration test
   * (and as a "simulate" hook); the interactive render drives the battle itself.
   */
  autoBattle(maxTurns = 1000): "player" | "enemy" | undefined {
    if (!this.battle) throw new Error("RunLoop.autoBattle: no staged battle");
    const battle = this.battle;
    for (let i = 0; i < maxTurns; i++) {
      const o = battle.outcome();
      if (o.over) return o.winner;
      const actor = battle.nextActor();
      if (!actor) break;
      const plan = planEnemyTurn(actor, battle.units, battle.grid);
      if (plan.path.length > 0) battle.moveUnit(actor, plan.path);
      if (plan.target && plan.target.alive) battle.attack(actor, plan.target);
      battle.endTurn(actor, { moved: plan.path.length > 0, acted: plan.target !== null });
    }
    return battle.outcome().winner;
  }
}
