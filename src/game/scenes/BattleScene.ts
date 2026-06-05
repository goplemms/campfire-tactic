import Phaser from "phaser";
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
  createUnit,
  // M5b — logistics / deployment gamble
  addItem,
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
  applyCampSkill,
  moraleTier,
  moraleModifiers,
  // M6 — the run loop
  createRun,
  RunLoop,
  combatRoster,
  runDifficulty,
  currentEncounter,
  computeUpkeep,
  triageHeal,
  chunkHp,
  type RunState,
  type IntelReport,
  type DeployExposure,
  type GridCoord,
  type Unit,
  type SkillDef,
} from "../../core";

/** A small text button with a hover highlight. */
interface TextButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/**
 * The M6 run driver: wraps the phase loop in a **seeded, permadeath roguelike
 * run**. It owns no rules — a {@link RunLoop} generates each encounter, stages the
 * battle, applies Upkeep/recovery/rewards/mortality between fights, and reports
 * when the run is over. This scene walks the loop encounter-to-encounter
 * (Camp → Deployment → Battle → Resolution → next), and on a wipe shows a
 * **run-end screen with the seed** so the run can be replayed by re-entering it.
 */
export class BattleScene extends Phaser.Scene {
  private run!: RunState;
  private loop!: RunLoop;
  private grid!: TileGrid;
  private battle!: Battle;

  private phase: "camp" | "deployment" | "battle" | "resolution" = "camp";

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
  private primary!: TextButton;
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

  constructor() {
    super("BattleScene");
  }

  create(): void {
    // Seed: read the re-enterable field; default to a timestamp (render layer
    // only — core randomness still flows through the run's seeded RNG).
    const seedInput = document.getElementById("seed") as HTMLInputElement | null;
    let seed = seedInput?.value.trim() ?? "";
    if (!seed) {
      seed = `run-${Date.now()}`;
      if (seedInput) seedInput.value = seed;
    }
    const newRunBtn = document.getElementById("newrun") as HTMLButtonElement | null;
    if (newRunBtn) newRunBtn.onclick = () => this.scene.restart();

    this.run = createRun(seed, { party: this.startingRoster(), difficultyId: "normal", gold: 120, storageCap: 6 });
    this.loop = new RunLoop(this.run);

    // Persistent UI.
    this.titleText = this.add.text(this.scale.width / 2, 16, "", { color: "#e8eefc", fontSize: "18px" }).setOrigin(0.5).setDepth(10);
    this.campText = this.add.text(this.scale.width / 2, 40, "", { color: "#cdd7ee", fontSize: "13px" }).setOrigin(0.5).setDepth(10);
    this.intelText = this.add.text(this.scale.width / 2, 60, "", { color: "#d6c98a", fontSize: "12px" }).setOrigin(0.5).setDepth(10);
    this.orderText = this.add.text(12, 12, "", { color: "#cdd7ee", fontSize: "12px", lineSpacing: 3 }).setDepth(10);
    this.hintText = this.add.text(this.scale.width / 2, this.scale.height - 104, "", { color: "#9fb0d0", fontSize: "13px", align: "center", wordWrap: { width: 700 } }).setOrigin(0.5).setDepth(10);
    this.highlight = this.add.graphics().setDepth(0.5);
    this.primary = this.makeTextButton(this.scale.width / 2, this.scale.height - 26, 200, 34, "", 0x2f6b46, 0x57b07a, () => this.onPrimary());
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    this.startNight();
  }

  /** The starting party: two fighters + camp-only Chef and Merchant (D3). */
  private startingRoster(): Unit[] {
    return [
      createUnit({ id: "Rook", side: "player", pos: { col: 0, row: 1 }, name: "Rook", jobId: "soldier", awareness: 4, intelligence: 4, speed: 12, maxHp: 30, attack: 9, defense: 3, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Vale", side: "player", pos: { col: 0, row: 4 }, name: "Vale", jobId: "survivalist", awareness: 2, intelligence: 2, speed: 10, maxHp: 24, attack: 11, defense: 2, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Pip", side: "player", pos: { col: -1, row: -1 }, name: "Pip", jobId: "chef", speed: 8, maxHp: 18, attack: 3, defense: 1, moveRange: 3, sightRadius: 4 }),
      createUnit({ id: "Coin", side: "player", pos: { col: -1, row: -1 }, name: "Coin", jobId: "merchant", speed: 8, maxHp: 16, attack: 2, defense: 1, moveRange: 3, sightRadius: 4 }),
    ];
  }

  // --- Night / encounter lifecycle ------------------------------------------

  private startNight(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
    if (this.loop.isOver()) return this.runEnd();

    // Between-battle camp: pay Upkeep, bank RP, tick dying clocks (D9/D15).
    const camp = this.loop.camp();
    if (this.loop.isOver()) return this.runEnd();

    // Stage the next seeded encounter and (re)build the board.
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

    // Intel read before provisioning (D10).
    this.intel = this.loop.intel();

    this.enterCamp(camp);
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

  // --- Phase: Camp -----------------------------------------------------------

  private enterCamp(camp: { upkeep: { paid: number; underfunded: string[] }; rpAdded: number }): void {
    this.phase = "camp";
    this.titleText.setText(`Camp — Night ${this.run.night + 1} (Encounter ${this.run.encounterIndex + 1})`);
    this.refreshCampText();
    this.refreshIntelText();

    const upkeepNote =
      camp.upkeep.underfunded.length > 0
        ? `Underfunded ${camp.upkeep.underfunded.join(" + ")} — morale took a hit.`
        : `Upkeep paid (${camp.upkeep.paid}g).`;
    this.setHint(`${upkeepNote} +${camp.rpAdded} RP banked. Provision, then deploy.`);

    const specs: { text: string; description?: string; onClick: () => void }[] = [];
    for (const u of this.run.party) {
      for (const skill of unitSkills(u, "meta")) {
        specs.push({
          text: `${u.name}: ${skill.name}`,
          description: `${skill.name} — ${skill.description}`,
          onClick: () => this.useCampSkill(skill),
        });
      }
    }
    specs.push({
      text: "Load Trap Kit",
      description: "Buy a Trap Kit into storage (1 slot) for the Survivalist.",
      onClick: () => this.provisionTrapKit(),
    });
    specs.push({
      text: "Triage Heal",
      description: "Spend Rest Points to heal the most-wounded fighter one chunk (D9).",
      onClick: () => this.triage(),
    });
    this.layoutActionRow(specs);
    this.setPrimary("Proceed to Deployment");
  }

  private useCampSkill(skill: SkillDef): void {
    const out = applyCampSkill(skill, this.run.camp);
    if (out.storage) this.run.inventory.storageCap = this.run.camp.storageCap;
    this.refreshCampText();
    const parts: string[] = [];
    if (out.gold) parts.push(`+${out.gold} gold`);
    if (out.storage) parts.push(`+${out.storage} storage`);
    if (out.morale) parts.push(`+${out.morale} morale`);
    if (out.bankedHeal) parts.push(`banked +${out.bankedHeal} HP/unit`);
    this.setHint(`${skill.name}: ${parts.join(", ")}.`);
  }

  private provisionTrapKit(): void {
    const cost = 15;
    if (this.run.camp.gold < cost) {
      this.setHint("Not enough gold for a Trap Kit (15g).");
      return;
    }
    if (addItem(this.run.inventory, "trap-kit", 1)) {
      this.run.camp.gold -= cost;
      this.refreshCampText();
      this.setHint(`Bought a Trap Kit (${countOf(this.run.inventory, "trap-kit")} carried).`);
    } else {
      this.setHint("Storage full — have the Merchant Trade for more slots.");
    }
  }

  private triage(): void {
    const policy = runDifficulty(this.run);
    const wounded = combatRoster(this.run)
      .filter((u) => u.hp < u.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!wounded) {
      this.setHint("No wounded fighters to heal.");
      return;
    }
    if (this.run.rp < policy.rpPerChunk) {
      this.setHint(`Not enough RP (need ${policy.rpPerChunk} for a ${chunkHp(wounded)} HP chunk).`);
      return;
    }
    const res = triageHeal(wounded, policy.rpPerChunk, policy);
    this.run.rp -= res.rpSpent;
    this.refreshHp();
    this.refreshCampText();
    this.setHint(`Triaged ${wounded.name}: +${res.hpHealed} HP for ${res.rpSpent} RP.`);
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
    const marker = this.add.text(x, y - TILE_HEIGHT / 2, "✸", { color: "#ff9d5c", fontSize: "20px" }).setOrigin(0.5).setDepth(0.8);
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
    if (this.phase === "camp") this.enterDeploy();
    else if (this.phase === "deployment") this.startBattle();
    else if (this.phase === "battle") this.onAdvance();
    else if (this.phase === "resolution") this.startNight();
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
    this.layoutActionRow(
      skills.map((skill) => ({ text: skill.name, description: `${skill.name} — ${skill.description}`, onClick: () => this.onSkillButton(actor, skill) })),
    );
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
    const plan = this.battle.runEnemyTurn(actor);
    this.animateMove(actor, plan.path, () => {
      if (plan.target) this.flashAttack(actor, plan.target);
      this.afterTurn();
    });
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

    const res = this.loop.resolve();
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
    } else {
      lines.push("The party was overwhelmed.");
    }

    if (res.over) {
      this.runEnd(title, lines);
      return;
    }
    this.showOverlay(title, lines.join("\n"), won);
    this.setHint(`Resolution — ${lines.join("  ")}`);
    this.setPrimary("Next Encounter");
  }

  // --- Run end ---------------------------------------------------------------

  private runEnd(title = "Run Over", extra: string[] = []): void {
    this.phase = "resolution";
    this.clearActionButtons();
    this.setPrimary("", false);
    this.highlightTile(null);

    const won = this.run.history.filter((h) => h.winner === "player").length;
    const lines = [
      ...extra,
      "",
      `Survived ${this.run.night} night(s), won ${won} encounter(s).`,
      `Final gold ${this.run.camp.gold}.`,
      "",
      `Seed:  ${this.run.seed}`,
      "Re-enter the seed above and press New Run to replay this run.",
    ];
    this.showOverlay(title, lines.join("\n"), false, 520, 240);
    this.setHint("Run over. Re-enter the seed above and press New Run to replay the same run.");
  }

  private showOverlay(title: string, body: string, good: boolean, w = 480, h = 170): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.overlay.push(
      this.add.rectangle(cx, cy, w, h, 0x11141b, 0.92).setStrokeStyle(2, good ? 0x57b07a : 0xb05757).setDepth(20),
      this.add.text(cx, cy - h / 2 + 28, title, { color: good ? "#9ff0bf" : "#f0a0a0", fontSize: "26px" }).setOrigin(0.5).setDepth(21),
      this.add.text(cx, cy + 14, body, { color: "#cdd7ee", fontSize: "13px", align: "center", lineSpacing: 4 }).setOrigin(0.5).setDepth(21),
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
      const label = this.add.text(0, -TILE_HEIGHT / 2 - 26, unit.name, { color: "#e8eefc", fontSize: "11px" }).setOrigin(0.5);
      const hp = this.add.text(0, -TILE_HEIGHT / 2 - 13, "", { color: "#bfe8c0", fontSize: "11px" }).setOrigin(0.5);
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

  private makeTextButton(x: number, y: number, w: number, h: number, text: string, fill: number, stroke: number, onClick: () => void, description?: string): TextButton {
    const bg = this.add.rectangle(x, y, w, h, fill).setStrokeStyle(2, stroke).setInteractive({ useHandCursor: true }).setDepth(12);
    const label = this.add.text(x, y, text, { color: "#eafff0", fontSize: "13px" }).setOrigin(0.5).setDepth(13);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      bg.setFillStyle(Phaser.Display.Color.IntegerToColor(fill).brighten(18).color);
      if (description) this.hintText.setText(description);
    });
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      bg.setFillStyle(fill);
      if (description) this.hintText.setText(this.lastHint);
    });
    return { bg, label };
  }

  private setPrimary(text: string, visible = true): void {
    this.primary.label.setText(text);
    this.primary.bg.setVisible(visible);
    this.primary.label.setVisible(visible);
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
      const btn = this.makeTextButton(startX + i * gap, y, gap - 12, 30, spec.text, 0x394063, 0x6f7bb0, spec.onClick, spec.description);
      this.actionButtons.push(btn.bg, btn.label);
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
