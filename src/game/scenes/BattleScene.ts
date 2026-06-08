import Phaser from "phaser";
import { FONT } from "../theme";
import {
  gridToScreen,
  screenToGrid,
  findPath,
  occupiedGrid,
  isAdjacent,
  TileGrid,
  TILE_WIDTH,
  TILE_HEIGHT,
  Battle,
  unitSkills,
  isValidSkillTarget,
  makeTrap,
  // M5b — logistics / deployment gamble
  removeItem,
  countOf,
  slotsUsed,
  createExposure,
  recordPlacement,
  exposureRisk,
  safeDepth,
  placementCost,
  freeCaptive,
  // M5 — camp / morale
  moraleTier,
  moraleModifiers,
  // M6 — the run loop
  currentEncounter,
  computeUpkeep,
  // M10 — theft (D30) + mid-combat bribe → recruitment (D33)
  thiefSteal,
  recoverStolen,
  thiefEscapes,
  previewNode,
  scoutedTier,
  bribeEnemy,
  bribeCost,
  recruitToRoster,
  type RunState,
  type RunLoop,
  type IntelReport,
  type DeployExposure,
  type GridCoord,
  type Unit,
  type Side,
  type SkillDef,
  type TheftAttempt,
} from "../../core";
import type { RunHandoff } from "./OverworldScene";
import { Button } from "../button";

/**
 * The mission driver (M6 phase loop, M7-framed): plays **one combat node** of the
 * run the {@link "./OverworldScene"} hands it. It owns no rules — the
 * {@link RunLoop} (already positioned at the chosen node) stages the encounter and
 * applies Upkeep/recovery/rewards/mortality. **Since M8 (D35)** the pre-fight camp
 * lives on the unified overworld camp ({@link "./OverworldScene"}); this scene runs
 * the silent Upkeep/RP bookkeeping then walks **Deployment → Battle → Resolution**,
 * and **returns to the overworld** so the player can pick the next node; the
 * overworld owns the run-end / run-complete terminals. The run + loop are passed in
 * (and back) so map position persists.
 */
export class BattleScene extends Phaser.Scene {
  private run!: RunState;
  private loop!: RunLoop;
  /** The owning guild + caravan (M9) — threaded back to the overworld/hall. */
  private guild?: RunHandoff["guild"];
  private caravanId?: string;
  private grid!: TileGrid;
  private battle!: Battle;

  private phase: "deployment" | "battle" | "resolution" = "deployment";

  // Board rendering (rebuilt each encounter).
  private gridGfx?: Phaser.GameObjects.Graphics;
  private safeZoneGfx?: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  private views = new Map<
    string,
    { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Arc; hp: Phaser.GameObjects.Text }
  >();
  private originX = 0;
  private originY = 0;

  // Persistent HUD.
  private titleText!: Phaser.GameObjects.Text;
  private campText!: Phaser.GameObjects.Text;
  private intelText!: Phaser.GameObjects.Text;
  private orderText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private lastHint = "";
  private primary!: Button;
  private actionButtons: Phaser.GameObjects.GameObject[] = [];
  private overlay: Phaser.GameObjects.GameObject[] = [];

  // Deployment state.
  private deployActor: Unit | null = null;
  private deployExposures = new Map<string, DeployExposure>();
  private placedTraps: { pos: GridCoord; damage: number; marker: Phaser.GameObjects.Text; sprung: boolean }[] = [];
  private trapDamage = 12;
  private intel?: IntelReport;

  // Battle interaction.
  private waitingFor: Unit | null = null;
  private armedSkill: SkillDef | null = null;
  private busy = false;
  private over = false;

  // M10 — theft (D30) + bribe→recruitment (D33).
  /** Live thief skims, keyed by the thief unit id (kill → recover, escape → lost). */
  private theftAttempts = new Map<string, TheftAttempt>();
  /** Total gold thieves got away with this battle (for the Resolution readout). */
  private goldStolen = 0;
  private goldRecovered = 0;
  /** Bribe targeting mode (the Noble's Influence verb), and pending permanent joins. */
  private bribeArmed = false;
  private pendingRecruits: Unit[] = [];

  constructor() {
    super("BattleScene");
  }

  /** Receive the run + loop (already positioned at the chosen combat node). */
  init(data: RunHandoff): void {
    this.run = data.run;
    this.loop = data.loop;
    this.guild = data.guild;
    this.caravanId = data.caravanId;
  }

  create(): void {
    // Persistent UI.
    this.titleText = this.add.text(this.scale.width / 2, 16, "", { color: "#e8eefc", fontSize: FONT.title }).setOrigin(0.5).setDepth(10);
    this.campText = this.add.text(this.scale.width / 2, 40, "", { color: "#cdd7ee", fontSize: FONT.body }).setOrigin(0.5).setDepth(10);
    this.intelText = this.add.text(this.scale.width / 2, 60, "", { color: "#d6c98a", fontSize: FONT.label }).setOrigin(0.5).setDepth(10);
    this.orderText = this.add.text(12, 12, "", { color: "#cdd7ee", fontSize: FONT.label, lineSpacing: 3 }).setDepth(10);
    this.hintText = this.add.text(this.scale.width / 2, this.scale.height - 104, "", { color: "#9fb0d0", fontSize: FONT.body, align: "center", wordWrap: { width: 700 } }).setOrigin(0.5).setDepth(10);
    this.highlight = this.add.graphics().setDepth(0.5);
    this.primary = this.makeTextButton(this.scale.width / 2, this.scale.height - 26, 200, 34, "", 0x2f6b46, 0x57b07a, () => this.onPrimary());
    this.primary.setDepth(12);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    this.startCombatNode();
  }

  // --- Combat node lifecycle (one chosen mission) ---------------------------

  /**
   * Stage the chosen combat node: run the silent **Upkeep/RP/dying-clock**
   * bookkeeping (D3/D9/D15 — the pre-fight *camp actions* now live on the unified
   * overworld camp, D35), build the board for the node's seeded encounter, read
   * intel (D10), and go straight to **Deployment**. If a dying clock runs out and
   * wipes the party, return straight to the overworld's run-end.
   */
  private startCombatNode(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];

    // Between-battle bookkeeping: pay Upkeep, bank RP, tick dying clocks (D9/D15).
    const camp = this.loop.camp();
    if (this.loop.isOver()) return this.returnToOverworld();

    // Stage the chosen node's seeded encounter and build the board.
    this.battle = this.loop.startEncounter();
    this.grid = this.battle.grid;
    this.over = false;
    this.busy = false;
    this.waitingFor = null;
    this.armedSkill = null;
    this.deployActor = null;
    this.deployExposures.clear();
    this.placedTraps = [];
    this.rebuildBoard();

    // Intel read (D10), then straight into Deployment.
    this.intel = this.loop.intel();
    this.refreshCampText();
    this.refreshIntelText();
    const upkeepNote =
      camp.upkeep.underfunded.length > 0
        ? `Underfunded ${camp.upkeep.underfunded.join(" + ")} — morale took a hit.`
        : `Upkeep paid (${camp.upkeep.paid}g).`;
    this.enterDeploy();
    this.setHint(`${upkeepNote} +${camp.rpAdded} RP banked. Deploy your party, then Start Battle.`);
  }

  private rebuildBoard(): void {
    for (const o of this.boardObjects) o.destroy();
    this.boardObjects = [];
    this.views.clear();
    this.gridGfx?.destroy();
    this.safeZoneGfx?.destroy();
    this.safeZoneGfx = undefined;
    this.highlight.clear();

    this.originX = this.scale.width / 2;
    this.originY = this.scale.height / 2 - (this.grid.rows * TILE_HEIGHT) / 2 + 4;

    this.drawGrid();
    this.spawnUnits();
  }

  // --- Phase: Deployment -----------------------------------------------------

  private enterDeploy(): void {
    this.phase = "deployment";
    const trapSkill = this.run.party
      .flatMap((u) => unitSkills(u, "deployment"))
      .find((s) => s.effect.kind === "placeTrap");
    if (trapSkill && trapSkill.effect.kind === "placeTrap") this.trapDamage = trapSkill.effect.damage;
    this.selectDeployActor(this.battle.units.find((u) => u.side === "player") ?? null);
    this.setPrimary("Start Battle");
  }

  private moraleMods() {
    return moraleModifiers(moraleTier(this.run.camp.morale));
  }

  private exposureOf(unit: Unit): DeployExposure {
    let st = this.deployExposures.get(unit.id);
    if (!st) {
      st = createExposure();
      this.deployExposures.set(unit.id, st);
    }
    return st;
  }

  private selectDeployActor(unit: Unit | null): void {
    this.deployActor = unit;
    this.highlightTile(unit ? unit.pos : null);
    this.drawSafeZone(unit);
    this.refreshDeployButtons();
    this.refreshDeployStatus();
    if (unit) {
      this.setHint(`${unit.name}: click a tile to move (deeper = riskier), place a trap where you stand, or pick another unit.`);
    }
  }

  private refreshDeployButtons(): void {
    const actor = this.deployActor;
    const specs: { text: string; description?: string; onClick: () => void }[] = [];
    if (actor && !actor.captured && unitSkills(actor, "deployment").some((s) => s.effect.kind === "placeTrap")) {
      specs.push({
        text: "Place Trap Here",
        description: "Drop a trap on this tile (1 kit). Deeper tiles raise capture risk.",
        onClick: () => this.placeTrap(),
      });
    }
    if (this.battle.units.filter((u) => u.side === "player" && !u.captured).length > 1) {
      specs.push({ text: "Next Unit", description: "Switch to another unit to deploy.", onClick: () => this.cycleDeployActor() });
    }
    this.layoutActionRow(specs);
  }

  private cycleDeployActor(): void {
    if (this.busy) return;
    const players = this.battle.units.filter((u) => u.side === "player" && !u.captured);
    if (players.length === 0) return;
    const i = this.deployActor ? players.indexOf(this.deployActor) : -1;
    this.selectDeployActor(players[(i + 1) % players.length]);
  }

  private depthOf(tile: GridCoord): number {
    return tile.col;
  }

  private refreshDeployStatus(): void {
    const actor = this.deployActor;
    if (!actor) {
      this.titleText.setText("Deployment");
      return;
    }
    const st = this.exposureOf(actor);
    const pct = Math.round(exposureRisk(st) * 100);
    const mods = this.moraleMods();
    const here = Math.round(placementCost(actor, this.depthOf(actor.pos), mods));
    const kits = countOf(this.run.inventory, "trap-kit");
    const tag = actor.captured ? " — CAPTURED" : `, safe to depth ${safeDepth(actor, mods.safeDepthBonus)} (place here +${here}%)`;
    this.titleText.setText(`Deployment — ${actor.name} exposure ${pct}%${tag} · Trap Kits ${kits}`);
  }

  private drawSafeZone(unit: Unit | null): void {
    if (!this.safeZoneGfx) {
      this.safeZoneGfx = this.add.graphics().setDepth(0.4);
      this.boardObjects.push(this.safeZoneGfx);
    }
    this.safeZoneGfx.clear();
    if (!unit) return;
    const maxCol = safeDepth(unit, this.moraleMods().safeDepthBonus);
    for (let row = 0; row < this.grid.rows; row++) {
      for (let col = 0; col <= maxCol && col < this.grid.cols; col++) {
        if (!this.grid.isWalkable({ col, row })) continue;
        const { x, y } = this.tileToWorld({ col, row });
        const halfW = TILE_WIDTH / 2;
        const halfH = TILE_HEIGHT / 2;
        this.safeZoneGfx.fillStyle(0x2f6b46, 0.28);
        this.safeZoneGfx.beginPath();
        this.safeZoneGfx.moveTo(x, y - halfH);
        this.safeZoneGfx.lineTo(x + halfW, y);
        this.safeZoneGfx.lineTo(x, y + halfH);
        this.safeZoneGfx.lineTo(x - halfW, y);
        this.safeZoneGfx.closePath();
        this.safeZoneGfx.fillPath();
      }
    }
  }

  private deployMove(tile: GridCoord): void {
    const actor = this.deployActor;
    if (!actor || actor.captured || this.busy) return;
    const nav = occupiedGrid(this.grid, this.battle.units, [actor]);
    const path = findPath(nav, actor.pos, tile);
    if (!path || path.length < 2) {
      this.setHint("Can't move there.");
      return;
    }
    const steps = path.slice(1).slice(0, actor.moveRange);
    actor.pos = { ...steps[steps.length - 1] };
    this.busy = true;
    this.animateMove(actor, steps, () => {
      this.busy = false;
      this.highlightTile(actor.pos);
      this.refreshDeployStatus();
      this.refreshDeployButtons();
    });
  }

  private placeTrap(): void {
    const actor = this.deployActor;
    if (!actor || actor.captured || this.busy) return;
    if (countOf(this.run.inventory, "trap-kit") <= 0) {
      this.setHint("No trap kits carried — load some in camp first.");
      return;
    }
    const tile = actor.pos;
    if (this.placedTraps.some((t) => t.pos.col === tile.col && t.pos.row === tile.row)) {
      this.setHint("There's already a trap here — move first.");
      return;
    }
    removeItem(this.run.inventory, "trap-kit", 1);
    const { x, y } = this.tileToWorld(tile);
    const marker = this.add.text(x, y - TILE_HEIGHT / 2, "✸", { color: "#ff9d5c", fontSize: FONT.display }).setOrigin(0.5).setDepth(0.8);
    this.boardObjects.push(marker);
    this.placedTraps.push({ pos: { ...tile }, damage: this.trapDamage, marker, sprung: false });
    this.refreshCampText();

    const st = this.exposureOf(actor);
    const result = recordPlacement(st, actor, this.depthOf(tile), this.moraleMods());
    this.refreshDeployStatus();
    if (result.captured) {
      this.captureDuringDeploy(actor);
    } else {
      const pct = Math.round(exposureRisk(st) * 100);
      this.refreshDeployButtons();
      this.setHint(
        result.exposureAdded > 0
          ? `Trap placed deep — exposure now ${pct}%. Press your luck or Start Battle.`
          : "Trap placed safely. Range deeper or Start Battle.",
      );
    }
  }

  private captureDuringDeploy(unit: Unit): void {
    unit.pos = { col: this.grid.cols - 2, row: this.grid.rows - 1 };
    this.placeView(unit);
    this.tintCaptured(unit, true);
    this.highlightTile(null);
    const next = this.battle.units.find((u) => u.side === "player" && !u.captured && u !== unit);
    this.selectDeployActor(next ?? null);
    this.setHint(`${unit.name} ranged too deep and was captured! She starts the battle bound in the enemy zone — rescue her, or win to bring her home.`);
  }

  // --- Phase: Battle ---------------------------------------------------------

  private startBattle(): void {
    this.phase = "battle";
    this.titleText.setText("Battle");
    this.clearActionButtons();
    this.theftAttempts.clear();
    this.goldStolen = 0;
    this.goldRecovered = 0;
    this.pendingRecruits = [];
    this.bribeArmed = false;
    this.deployActor = null;
    this.safeZoneGfx?.clear();
    this.highlightTile(null);

    this.placedTraps.forEach((t, i) => this.battle.entities.register(makeTrap(`trap-${i}`, t.pos, "player", t.damage)));
    this.battle.bus.on("unitEnterTile", ({ unit, tile }) => {
      if (unit.side !== "enemy") return;
      const t = this.placedTraps.find((t) => !t.sprung && t.pos.col === tile.col && t.pos.row === tile.row);
      if (t) {
        t.sprung = true;
        t.marker.setText("✺").setColor("#7a8190");
        this.tweens.add({ targets: t.marker, scale: 1.8, duration: 140, yoyo: true });
      }
    });

    // beginBattle: Chef heal + morale-warmed initiative seed (D8).
    const healed = this.loop.beginBattle();
    this.refreshCampText();
    if (healed > 0) for (const u of this.battle.units) if (u.side === "player" && u.alive) this.flashHeal(u);

    this.refreshHud();
    this.setPrimary("Advance Clock");
    const bound = this.battle.units.find((u) => u.captured && u.side === "player");
    this.setHint((healed > 0 ? `Chef's stew restored ${healed} HP. ` : "Battle begins. ") + (bound ? `${bound.name} is bound — rescue or win to free her. ` : "") + "Press Advance Clock.");
  }

  private onPrimary(): void {
    if (this.phase === "deployment") this.startBattle();
    else if (this.phase === "battle") this.onAdvance();
    else if (this.phase === "resolution") this.returnToOverworld();
  }

  private onAdvance(): void {
    if (this.over || this.busy || this.waitingFor) return;
    const actor = this.battle.nextActor();
    if (!actor) return this.finishBattle();
    this.highlightTile(actor.pos);
    this.refreshHud();
    if (actor.side === "enemy") {
      this.runEnemyTurn(actor);
    } else {
      this.waitingFor = actor;
      this.setHint(`${actor.name}'s turn — move, attack, or use a skill.`);
      this.showSkillButtons(actor);
    }
  }

  private showSkillButtons(actor: Unit): void {
    const skills = unitSkills(actor, "battle");
    const specs = skills.map((skill) => ({ text: skill.name, description: `${skill.name} — ${skill.description}`, onClick: () => this.onSkillButton(actor, skill) }));
    // The Noble's mid-combat BRIBE (D30/D33): spend guild Influence to sway an enemy.
    if (this.guild && this.battle.units.some((u) => u.side === "enemy" && u.alive)) {
      const cost = bribeCost(this.currentPreview());
      const affordable = this.guild.influence >= cost;
      specs.push({
        text: `Bribe (${cost} Inf)`,
        description: affordable
          ? "Bribe an enemy (Noble Influence): a generic turns coat for the fight; an authored one joins the guild permanently."
          : `Not enough Influence (need ${cost}).`,
        onClick: () => {
          if (!affordable) return this.setHint(`Not enough Influence to bribe (need ${cost}).`);
          this.bribeArmed = true;
          this.armedSkill = null;
          this.setHint(`Bribe: click an enemy to sway it (or click ${actor.name} to cancel).`);
        },
      });
    }
    this.layoutActionRow(specs);
  }

  /** The current combat node's banded preview (D24) — leverage for the Noble's bribe. */
  private currentPreview() {
    return previewNode(this.run, this.run.mapNodeId, scoutedTier(this.run.overworld, this.run.mapNodeId));
  }

  /** Spend guild Influence to sway an enemy (D30/D33). Consumes the actor's turn. */
  private doBribe(actor: Unit, foe: Unit): void {
    if (!this.guild) return;
    const res = bribeEnemy(this.guild, foe, this.currentPreview());
    this.bribeArmed = false;
    if (!res.applied) return this.setHint(`Can't bribe: ${res.reason}`);
    // Turncoat: flip the enemy to the player's side for the rest of the fight.
    (foe as unknown as { side: Side }).side = "player";
    const view = this.views.get(foe.id);
    view?.body.setFillStyle(0xffcf6b).setStrokeStyle(2, 0x6b4a1c);
    if (res.outcome?.permanent) this.pendingRecruits.push(foe);
    this.waitingFor = null;
    this.busy = true;
    this.clearActionButtons();
    this.highlightTile(null);
    this.battle.endTurn(actor, { acted: true });
    this.afterTurn();
    if (!this.over) this.setHint(res.detail ?? `${foe.name} swayed.`);
  }

  private onSkillButton(actor: Unit, skill: SkillDef): void {
    if (this.busy || this.waitingFor !== actor) return;
    if (skill.target === "self") return this.commitSkill(actor, skill, actor);
    this.armedSkill = skill;
    this.setHint(`${skill.name}: click a valid target (or click ${actor.name} to cancel).`);
  }

  private commitSkill(actor: Unit, skill: SkillDef, target: Unit): void {
    this.armedSkill = null;
    this.waitingFor = null;
    this.busy = true;
    this.clearActionButtons();
    this.highlightTile(null);
    const outcome = this.battle.useSkill(actor, skill, target);
    if (skill.target === "self") this.flashHeal(target);
    else this.flashAttack(actor, target);
    const verb = outcome.healed ? `heals ${outcome.healed}` : outcome.damage ? `hits for ${outcome.damage}` : outcome.status ? `applies ${outcome.status}` : "acts";
    this.afterTurn();
    if (!this.over) this.setHint(`${actor.name} used ${skill.name} — ${verb}. Advance Clock.`);
  }

  private runEnemyTurn(actor: Unit): void {
    this.busy = true;
    this.setHint(`${actor.name} (enemy) acts…`);
    // The thief archetype (D30): on its first turn it skims the run PURSE, then
    // bolts for the edge. Kill it before it escapes to recover the gold.
    if (actor.thief && actor.alive && !this.theftAttempts.has(actor.id)) {
      const attempt = thiefSteal(this.run, `thief:${actor.id}`);
      if (attempt.stolen > 0) {
        this.theftAttempts.set(actor.id, attempt);
        this.goldStolen += attempt.stolen;
        this.refreshCampText();
        this.setHint(`${actor.name} lifted ${attempt.stolen}g off the purse! Cut it down before it escapes to recover the gold.`);
      }
    }
    const plan = this.battle.runEnemyTurn(actor);
    this.animateMove(actor, plan.path, () => {
      if (plan.target) this.flashAttack(actor, plan.target);
      this.afterTurn();
    });
  }

  /** Recover loot from any thief that has just died (kill-to-recover, D13/D21). */
  private resolveTheftDeaths(): void {
    for (const [id, attempt] of this.theftAttempts) {
      if (attempt.resolved) continue;
      const thief = this.battle.units.find((u) => u.id === id);
      if (thief && !thief.alive) {
        const back = recoverStolen(this.run, attempt);
        this.goldRecovered += back;
        this.refreshCampText();
        this.setHint(`Recovered ${back}g from the slain thief.`);
      }
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const tile = this.worldToTile(pointer.worldX, pointer.worldY);
    if (!this.grid || !this.grid.inBounds(tile)) return;

    if (this.phase === "deployment") {
      if (this.busy) return;
      const clicked = this.battle.units.find((u) => u.alive && u.pos.col === tile.col && u.pos.row === tile.row);
      if (clicked && clicked.side === "player" && !clicked.captured) this.selectDeployActor(clicked);
      else if (!clicked) this.deployMove(tile);
      return;
    }
    if (this.phase !== "battle") return;

    const actor = this.waitingFor;
    if (this.over || this.busy || !actor) return;
    const clicked = this.battle.units.find((u) => u.alive && u.pos.col === tile.col && u.pos.row === tile.row);

    if (this.bribeArmed) {
      if (clicked === actor) {
        this.bribeArmed = false;
        this.setHint(`${actor.name}'s turn — move, attack, or use a skill.`);
        return;
      }
      if (clicked && clicked.side === "enemy" && !clicked.captured) this.doBribe(actor, clicked);
      else this.setHint("Pick an enemy to bribe (or click yourself to cancel).");
      return;
    }

    if (this.armedSkill) {
      if (clicked === actor) {
        this.armedSkill = null;
        this.setHint(`${actor.name}'s turn — move, attack, or use a skill.`);
        return;
      }
      if (clicked && isValidSkillTarget(this.armedSkill, actor, clicked)) this.commitSkill(actor, this.armedSkill, clicked);
      else this.setHint("Not a valid target for that skill.");
      return;
    }

    if (clicked && clicked.captured && clicked.side === actor.side && clicked !== actor) this.playerRescueOrApproach(actor, clicked);
    else if (clicked && clicked.side !== actor.side && !clicked.captured) this.playerAttackOrApproach(actor, clicked);
    else if (!clicked && this.grid.isWalkable(tile)) this.playerMove(actor, tile);
  }

  private playerRescueOrApproach(actor: Unit, captive: Unit): void {
    if (isAdjacent(actor.pos, captive.pos)) return this.commitRescue(actor, [], captive);
    const nav = occupiedGrid(this.grid, this.battle.units, [actor, captive]);
    const path = findPath(nav, actor.pos, captive.pos);
    if (!path || path.length < 2) return this.setHint("No path to your captured ally.");
    const approach = path.slice(1, -1).slice(0, actor.moveRange);
    const dest = approach.length > 0 ? approach[approach.length - 1] : actor.pos;
    this.commitRescue(actor, approach, isAdjacent(dest, captive.pos) ? captive : null);
  }

  private commitRescue(actor: Unit, path: GridCoord[], captive: Unit | null): void {
    this.waitingFor = null;
    this.armedSkill = null;
    this.busy = true;
    this.clearActionButtons();
    this.highlightTile(null);
    if (path.length > 0) this.battle.moveUnit(actor, path);
    let freed = false;
    if (captive && isAdjacent(actor.pos, captive.pos)) {
      freeCaptive(captive);
      this.tintCaptured(captive, false);
      freed = true;
    }
    this.battle.endTurn(actor, { moved: path.length > 0, acted: freed });
    this.animateMove(actor, path, () => {
      if (freed) this.flashHeal(captive!);
      this.afterTurn();
      if (!this.over && freed) this.setHint(`${actor.name} freed ${captive!.name}! Advance Clock.`);
    });
  }

  private playerAttackOrApproach(actor: Unit, foe: Unit): void {
    if (isAdjacent(actor.pos, foe.pos)) return this.commitPlayer(actor, [], foe);
    const nav = occupiedGrid(this.grid, this.battle.units, [actor, foe]);
    const path = findPath(nav, actor.pos, foe.pos);
    if (!path || path.length < 2) return this.setHint("No path to that foe.");
    const approach = path.slice(1, -1).slice(0, actor.moveRange);
    const dest = approach.length > 0 ? approach[approach.length - 1] : actor.pos;
    this.commitPlayer(actor, approach, isAdjacent(dest, foe.pos) ? foe : null);
  }

  private playerMove(actor: Unit, tile: GridCoord): void {
    const nav = occupiedGrid(this.grid, this.battle.units, [actor]);
    const path = findPath(nav, actor.pos, tile);
    if (!path || path.length < 2) return this.setHint("Can't move there.");
    this.commitPlayer(actor, path.slice(1).slice(0, actor.moveRange), null);
  }

  private commitPlayer(actor: Unit, path: GridCoord[], target: Unit | null): void {
    this.waitingFor = null;
    this.armedSkill = null;
    this.busy = true;
    this.clearActionButtons();
    this.highlightTile(null);
    if (path.length > 0) this.battle.moveUnit(actor, path);
    if (target && target.alive) this.battle.attack(actor, target);
    this.battle.endTurn(actor, { moved: path.length > 0, acted: target !== null });
    this.animateMove(actor, path, () => {
      if (target) this.flashAttack(actor, target);
      this.afterTurn();
    });
  }

  private afterTurn(): void {
    this.busy = false;
    this.resolveTheftDeaths();
    this.refreshHud();
    this.highlightTile(null);
    if (this.battle.outcome().over) return this.finishBattle();
    this.setHint("Press Advance Clock for the next turn.");
  }

  // --- Resolution ------------------------------------------------------------

  private finishBattle(): void {
    if (this.over) return;
    this.over = true;
    this.phase = "resolution";
    this.highlightTile(null);
    this.clearActionButtons();

    // Any thief still standing at the bell got away with its skim (D13/D21).
    let goldEscaped = 0;
    for (const [id, attempt] of this.theftAttempts) {
      if (attempt.resolved) continue;
      const thief = this.battle.units.find((u) => u.id === id);
      if (thief && thief.alive) goldEscaped += thiefEscapes(attempt);
    }

    const res = this.loop.resolve();

    // Mid-combat bribe → recruitment (D33): permanent (authored) turncoats join the
    // guild roster after the battle; generics were temporary (just fought it out).
    const recruited: string[] = [];
    if (this.guild) {
      for (const u of this.pendingRecruits) {
        if (recruitToRoster(this.guild, u)) recruited.push(u.name);
      }
    }

    this.refreshCampText();
    this.refreshHp();
    // Re-tint any freed allies.
    for (const u of this.run.party) if (!u.captured) this.tintCaptured(u, false);

    const won = res.winner === "player";
    const title = res.winner === undefined ? "Draw" : won ? "Victory!" : "Defeat";
    const lines: string[] = [];
    if (won) {
      lines.push(`+${res.goldEarned} gold.`);
      if (res.rescued.length) lines.push(`Auto-rescued ${res.rescued.join(", ")} (won the field).`);
      lines.push(res.recovered.length ? `Recovered ${res.recovered.length} unsprung trap kit(s).` : "No unsprung materials.");
      if (res.downed.length) lines.push(`Downed: ${res.downed.map((d) => `${d.unitId} (${d.resolution})`).join(", ")}.`);
      if (res.permadeaths.length) lines.push(`Lost forever: ${res.permadeaths.join(", ")}.`);
      if (this.loop.isComplete()) lines.push("The final mission is cleared — the run is complete!");
    } else {
      lines.push("The party was overwhelmed.");
    }
    // Theft + recruitment outcomes (M10).
    if (this.goldStolen > 0) {
      lines.push(`Thieves skimmed ${this.goldStolen}g — recovered ${this.goldRecovered}g${goldEscaped > 0 ? `, ${goldEscaped}g escaped` : ""}.`);
    }
    if (recruited.length) lines.push(`Swayed to the guild (permanent): ${recruited.join(", ")}.`);

    this.showOverlay(title, lines.join("\n"), won);
    this.setHint(`Resolution — ${lines.join("  ")}`);
    // On any terminal (wipe / loss / run-complete) the overworld shows the end
    // screen; otherwise the player returns to the map to pick the next node.
    this.setPrimary(res.over ? (this.loop.isComplete() ? "See Results" : "Run Over") : "Return to Map");
  }

  /** Hand the run back to the overworld so the player can pick the next node. */
  private returnToOverworld(): void {
    this.scene.start("OverworldScene", { run: this.run, loop: this.loop, guild: this.guild, caravanId: this.caravanId } as RunHandoff);
  }

  private showOverlay(title: string, body: string, good: boolean, w = 480, h = 170): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.overlay.push(
      this.add.rectangle(cx, cy, w, h, 0x11141b, 0.92).setStrokeStyle(2, good ? 0x57b07a : 0xb05757).setDepth(20),
      this.add.text(cx, cy - h / 2 + 28, title, { color: good ? "#9ff0bf" : "#f0a0a0", fontSize: FONT.display }).setOrigin(0.5).setDepth(21),
      this.add.text(cx, cy + 14, body, { color: "#cdd7ee", fontSize: FONT.body, align: "center", lineSpacing: 4 }).setOrigin(0.5).setDepth(21),
    );
  }

  // --- Drawing helpers -------------------------------------------------------

  private tileToWorld(coord: GridCoord): { x: number; y: number } {
    const { x, y } = gridToScreen(coord);
    return { x: this.originX + x, y: this.originY + y };
  }

  private worldToTile(px: number, py: number): GridCoord {
    const frac = screenToGrid({ x: px - this.originX, y: py - this.originY });
    return { col: Math.round(frac.col), row: Math.round(frac.row) };
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    this.gridGfx = g;
    for (let row = 0; row < this.grid.rows; row++) {
      for (let col = 0; col < this.grid.cols; col++) {
        const { x, y } = this.tileToWorld({ col, row });
        const walkable = this.grid.isWalkable({ col, row });
        const fill = !walkable ? 0x55304a : (col + row) % 2 === 0 ? 0x2a3550 : 0x222b40;
        this.drawDiamond(g, x, y, fill);
      }
    }
  }

  private drawDiamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, fill: number): void {
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    g.fillStyle(fill, 1);
    g.lineStyle(1, 0x3d4b6e, 1);
    g.beginPath();
    g.moveTo(cx, cy - halfH);
    g.lineTo(cx + halfW, cy);
    g.lineTo(cx, cy + halfH);
    g.lineTo(cx - halfW, cy);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private spawnUnits(): void {
    for (const unit of this.battle.units) {
      const color = unit.side === "player" ? 0xffcf6b : 0xe06b6b;
      const stroke = unit.side === "player" ? 0x6b4a1c : 0x6b1c1c;
      const body = this.add.circle(0, -TILE_HEIGHT / 2, 11, color).setStrokeStyle(2, stroke);
      const label = this.add.text(0, -TILE_HEIGHT / 2 - 26, unit.name, { color: "#e8eefc", fontSize: FONT.caption }).setOrigin(0.5);
      const hp = this.add.text(0, -TILE_HEIGHT / 2 - 13, "", { color: "#bfe8c0", fontSize: FONT.caption }).setOrigin(0.5);
      const container = this.add.container(0, 0, [body, label, hp]).setDepth(1);
      this.views.set(unit.id, { container, body, hp });
      this.boardObjects.push(container);
      if (unit.captured) this.tintCaptured(unit, true);
      this.placeView(unit);
    }
    this.refreshHp();
  }

  private tintCaptured(unit: Unit, captured: boolean): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    view.body.setFillStyle(captured ? 0x9a6bd0 : 0xffcf6b);
    view.body.setStrokeStyle(2, captured ? 0x4a2c6b : 0x6b4a1c);
  }

  private placeView(unit: Unit): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    const { x, y } = this.tileToWorld(unit.pos);
    view.container.setPosition(x, y);
  }

  private refreshHp(): void {
    for (const unit of this.battle.units) {
      const view = this.views.get(unit.id);
      if (!view) continue;
      view.hp.setText(`${Math.max(0, unit.hp)}/${unit.maxHp}`);
      view.container.setAlpha(unit.alive ? 1 : 0.25);
    }
  }

  private refreshHud(): void {
    const order = [...this.battle.units]
      .filter((u) => u.alive && !u.captured)
      .sort((a, b) => b.ct - a.ct)
      .map((u) => `${u.side === "player" ? "●" : "○"} ${u.name}  CT ${Math.round(u.ct)}`)
      .join("\n");
    this.orderText.setText(`CT order\n${order}`);
    this.refreshHp();
  }

  private refreshCampText(): void {
    const tier = moraleTier(this.run.camp.morale);
    const up = computeUpkeep(this.run.party).total;
    this.campText.setText(
      `Night ${this.run.night + 1}  ·  Gold ${this.run.camp.gold}  ·  Morale ${tier} (${this.run.camp.morale})  ·  ` +
        `Storage ${slotsUsed(this.run.inventory)}/${this.run.inventory.storageCap}  ·  Kits ${countOf(this.run.inventory, "trap-kit")}  ·  RP ${this.run.rp}  ·  Upkeep ${up}g/night`,
    );
  }

  private refreshIntelText(): void {
    const r = this.intel;
    if (!r) {
      this.intelText.setText("");
      return;
    }
    const parts = [`Intel T${r.tier}`];
    if (r.types) parts.push(`types: ${r.types.join(", ")}`);
    if (r.count !== undefined) parts.push(`count: ${r.count}`);
    if (r.grantsVision) parts.push("starting vision");
    const def = currentEncounter(this.run);
    this.intelText.setText(`${parts.join("  ·  ")}   (${def.type})`);
  }

  private setHint(text: string): void {
    this.lastHint = text;
    this.hintText.setText(text);
  }

  private highlightTile(coord: GridCoord | null): void {
    this.highlight.clear();
    if (!coord) return;
    const { x, y } = this.tileToWorld(coord);
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    this.highlight.lineStyle(3, 0x7fe0a0, 1);
    this.highlight.beginPath();
    this.highlight.moveTo(x, y - halfH);
    this.highlight.lineTo(x + halfW, y);
    this.highlight.lineTo(x, y + halfH);
    this.highlight.lineTo(x - halfW, y);
    this.highlight.closePath();
    this.highlight.strokePath();
  }

  // --- Buttons ---------------------------------------------------------------

  private makeTextButton(x: number, y: number, w: number, h: number, text: string, fill: number, stroke: number, onClick: () => void, description?: string): Button {
    const btn = new Button(this, x, y, {
      text,
      w,
      h,
      fill,
      stroke,
      onClick,
      hint: { bar: this.hintText, description, idle: () => this.lastHint },
    });
    this.add.existing(btn).setDepth(12);
    return btn;
  }

  private setPrimary(text: string, visible = true): void {
    this.primary.setLabel(text).setVisible(visible);
  }

  private clearActionButtons(): void {
    for (const obj of this.actionButtons) obj.destroy();
    this.actionButtons = [];
  }

  private layoutActionRow(specs: { text: string; description?: string; onClick: () => void }[]): void {
    this.clearActionButtons();
    if (specs.length === 0) return;
    const y = this.scale.height - 66;
    const gap = Math.min(150, 720 / specs.length);
    const startX = this.scale.width / 2 - ((specs.length - 1) * gap) / 2;
    specs.forEach((spec, i) => {
      this.actionButtons.push(this.makeTextButton(startX + i * gap, y, gap - 12, 30, spec.text, 0x394063, 0x6f7bb0, spec.onClick, spec.description));
    });
  }

  // --- Animation -------------------------------------------------------------

  private animateMove(unit: Unit, path: readonly GridCoord[], done: () => void): void {
    const view = this.views.get(unit.id);
    if (!view || path.length === 0) return done();
    const targets = path.map((c) => this.tileToWorld(c));
    this.tweens.chain({ targets: view.container, tweens: targets.map((p) => ({ x: p.x, y: p.y, duration: 150, ease: "Linear" })), onComplete: done });
  }

  private flashAttack(attacker: Unit, target: Unit): void {
    const av = this.views.get(attacker.id);
    const tv = this.views.get(target.id);
    if (av) {
      const home = this.tileToWorld(attacker.pos);
      const toward = this.tileToWorld(target.pos);
      this.tweens.add({ targets: av.container, x: home.x + (toward.x - home.x) * 0.3, y: home.y + (toward.y - home.y) * 0.3, duration: 90, yoyo: true, ease: "Quad.easeOut" });
    }
    if (tv) this.tweens.add({ targets: tv.container, alpha: 0.4, duration: 70, yoyo: true });
  }

  private flashHeal(unit: Unit): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    this.tweens.add({ targets: view.container, scale: 1.25, duration: 130, yoyo: true, ease: "Quad.easeOut" });
  }
}
