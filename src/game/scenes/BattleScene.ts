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
  createUnit,
  unitSkills,
  isValidSkillTarget,
  // M5 — phases, jobs, camp
  PhasePipeline,
  PhaseSkillRegistry,
  registerParty,
  createCamp,
  applyCampSkill,
  applyCampToParty,
  moraleTier,
  makeTrap,
  type Camp,
  type GridCoord,
  type Unit,
  type Side,
  type SkillDef,
} from "../../core";

/** A small text button with a hover highlight. */
interface TextButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/**
 * The M5 mini-loop scene: Camp (Meta) → Deployment → Battle, driven by the
 * core's {@link PhasePipeline}. The scene owns **no** rules — it invokes the
 * signature jobs' skills through `core` (Merchant/Chef in camp, Survivalist in
 * deployment) and the {@link Battle} in combat, then draws the results. It proves
 * the D3 seam: three jobs each hook a *different* phase, and the prep (a banked
 * Chef heal, a placed Survivalist trap) pays off in the following battle.
 */
export class BattleScene extends Phaser.Scene {
  private static readonly COLS = 8;
  private static readonly ROWS = 6;
  private static readonly BLOCKED: readonly GridCoord[] = [
    { col: 3, row: 2 },
    { col: 4, row: 2 },
    { col: 4, row: 3 },
  ];

  private grid!: TileGrid;
  private battle!: Battle;
  private camp!: Camp;
  private pipeline!: PhasePipeline;
  private phaseSkills!: PhaseSkillRegistry;
  /** The full player party (incl. off-grid Chef/Merchant), for camp skills. */
  private party: Unit[] = [];
  private originX = 0;
  private originY = 0;

  /** Per-unit render handles. */
  private views = new Map<
    string,
    { container: Phaser.GameObjects.Container; hp: Phaser.GameObjects.Text }
  >();
  private highlight!: Phaser.GameObjects.Graphics;
  private orderText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private campText!: Phaser.GameObjects.Text;

  /** Bottom-centre primary button (Proceed / Start Battle / Advance Clock). */
  private primary!: TextButton;
  /** Per-phase action buttons (camp/deploy/skill), cleared on phase change. */
  private actionButtons: Phaser.GameObjects.GameObject[] = [];

  // Battle interaction state.
  private waitingFor: Unit | null = null;
  private armedSkill: SkillDef | null = null;
  private lastHint = "";
  private busy = false;
  private over = false;

  // Deployment state.
  private armingTrap = false;
  private trapDamage = 12;
  private placedTraps: {
    pos: GridCoord;
    damage: number;
    marker: Phaser.GameObjects.Text;
    sprung: boolean;
  }[] = [];

  constructor() {
    super("BattleScene");
  }

  create(): void {
    this.grid = new TileGrid(BattleScene.COLS, BattleScene.ROWS, BattleScene.BLOCKED);
    this.battle = new Battle(this.grid, this.makeCombatants());
    this.camp = createCamp({ gold: 0, storageCap: 6, morale: 0 });
    this.pipeline = new PhasePipeline();

    // The party = on-grid combatants + off-grid non-combat jobs (Chef/Merchant).
    this.party = [
      ...this.battle.units.filter((u) => u.side === "player"),
      ...this.makeCampCrew(),
    ];
    this.phaseSkills = new PhaseSkillRegistry();
    registerParty(this.party, this.phaseSkills);

    this.originX = this.scale.width / 2;
    this.originY = this.scale.height / 2 - (BattleScene.ROWS * TILE_HEIGHT) / 2 - 10;

    this.drawGrid();
    this.highlight = this.add.graphics().setDepth(0.5);
    this.spawnUnits();

    this.titleText = this.add
      .text(this.scale.width / 2, 22, "", { color: "#e8eefc", fontSize: "18px" })
      .setOrigin(0.5)
      .setDepth(10);
    this.campText = this.add
      .text(this.scale.width / 2, 46, "", { color: "#cdd7ee", fontSize: "13px" })
      .setOrigin(0.5)
      .setDepth(10);
    this.orderText = this.add
      .text(12, 12, "", { color: "#cdd7ee", fontSize: "13px", lineSpacing: 3 })
      .setDepth(10);
    this.hintText = this.add
      .text(this.scale.width / 2, this.scale.height - 104, "", {
        color: "#9fb0d0",
        fontSize: "14px",
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.primary = this.makeTextButton(
      this.scale.width / 2,
      this.scale.height - 26,
      190,
      34,
      "",
      0x2f6b46,
      0x57b07a,
      () => this.onPrimary(),
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    this.refreshCampText();
    this.enterCampPhase();
  }

  // --- Rosters (pure data) ---------------------------------------------------

  /** The on-grid combatants. */
  private makeCombatants(): Unit[] {
    return [
      createUnit({ id: "Rook", side: "player", pos: { col: 0, row: 1 }, name: "Rook", jobId: "soldier", speed: 12, maxHp: 30, hp: 18, attack: 9, defense: 3, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Vale", side: "player", pos: { col: 0, row: 4 }, name: "Vale", jobId: "survivalist", speed: 10, maxHp: 24, hp: 14, attack: 11, defense: 2, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Grunt", side: "enemy", pos: { col: 7, row: 1 }, name: "Grunt", speed: 9, maxHp: 22, attack: 7, defense: 2, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Brute", side: "enemy", pos: { col: 7, row: 4 }, name: "Brute", speed: 7, maxHp: 30, attack: 8, defense: 3, moveRange: 3, sightRadius: 4 }),
    ];
  }

  /** Off-grid party members whose jobs act only in camp. */
  private makeCampCrew(): Unit[] {
    return [
      createUnit({ id: "Pip", side: "player", pos: { col: -1, row: -1 }, name: "Pip", jobId: "chef", speed: 8, maxHp: 18, attack: 3, defense: 1, moveRange: 3, sightRadius: 4 }),
      createUnit({ id: "Coin", side: "player", pos: { col: -1, row: -1 }, name: "Coin", jobId: "merchant", speed: 8, maxHp: 16, attack: 2, defense: 1, moveRange: 3, sightRadius: 4 }),
    ];
  }

  // --- Coordinate helpers ----------------------------------------------------

  private tileToWorld(coord: GridCoord): { x: number; y: number } {
    const { x, y } = gridToScreen(coord);
    return { x: this.originX + x, y: this.originY + y };
  }

  private worldToTile(px: number, py: number): GridCoord {
    const frac = screenToGrid({ x: px - this.originX, y: py - this.originY });
    return { col: Math.round(frac.col), row: Math.round(frac.row) };
  }

  // --- Drawing ---------------------------------------------------------------

  private drawGrid(): void {
    const g = this.add.graphics();
    for (let row = 0; row < BattleScene.ROWS; row++) {
      for (let col = 0; col < BattleScene.COLS; col++) {
        const { x, y } = this.tileToWorld({ col, row });
        const walkable = this.grid.isWalkable({ col, row });
        const fill = !walkable
          ? 0x55304a
          : (col + row) % 2 === 0
            ? 0x2a3550
            : 0x222b40;
        this.drawDiamond(g, x, y, fill);
      }
    }
  }

  private drawDiamond(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    fill: number,
  ): void {
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
      const body = this.add.circle(0, -TILE_HEIGHT / 2, 11, color);
      body.setStrokeStyle(2, stroke);
      const label = this.add
        .text(0, -TILE_HEIGHT / 2 - 26, unit.name, { color: "#e8eefc", fontSize: "11px" })
        .setOrigin(0.5);
      const hp = this.add
        .text(0, -TILE_HEIGHT / 2 - 13, "", { color: "#bfe8c0", fontSize: "11px" })
        .setOrigin(0.5);
      const container = this.add.container(0, 0, [body, label, hp]).setDepth(1);
      this.views.set(unit.id, { container, hp });
      this.placeView(unit);
    }
    this.refreshHp();
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
      view.hp.setText(`${unit.hp}/${unit.maxHp}`);
      view.container.setAlpha(unit.alive ? 1 : 0.25);
    }
  }

  private refreshHud(): void {
    const order = [...this.battle.units]
      .filter((u) => u.alive)
      .sort((a, b) => b.ct - a.ct)
      .map((u) => `${u.side === "player" ? "●" : "○"} ${u.name}  CT ${Math.round(u.ct)}`)
      .join("\n");
    this.orderText.setText(`CT order\n${order}`);
    this.refreshHp();
  }

  private refreshCampText(): void {
    this.campText.setText(
      `Gold ${this.camp.gold}   Storage ${this.camp.storageCap}   Morale ${moraleTier(this.camp.morale)} (${this.camp.morale})   Banked heal ${this.camp.pendingHeal}`,
    );
  }

  private setHint(text: string): void {
    this.lastHint = text;
    this.hintText.setText(text);
  }

  private showTransientHint(text: string): void {
    this.hintText.setText(text);
  }

  private restoreHint(): void {
    this.hintText.setText(this.lastHint);
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

  private makeTextButton(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    fill: number,
    stroke: number,
    onClick: () => void,
    description?: string,
  ): TextButton {
    const bg = this.add
      .rectangle(x, y, w, h, fill)
      .setStrokeStyle(2, stroke)
      .setInteractive({ useHandCursor: true })
      .setDepth(12);
    const label = this.add
      .text(x, y, text, { color: "#eafff0", fontSize: "14px" })
      .setOrigin(0.5)
      .setDepth(13);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      bg.setFillStyle(Phaser.Display.Color.IntegerToColor(fill).brighten(18).color);
      if (description) this.showTransientHint(description);
    });
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      bg.setFillStyle(fill);
      if (description) this.restoreHint();
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

  /** Lay out a row of action buttons centred in the bottom band. */
  private layoutActionRow(
    specs: { text: string; description?: string; onClick: () => void }[],
  ): void {
    this.clearActionButtons();
    const y = this.scale.height - 66;
    const gap = 165;
    const startX = this.scale.width / 2 - ((specs.length - 1) * gap) / 2;
    specs.forEach((spec, i) => {
      const btn = this.makeTextButton(
        startX + i * gap,
        y,
        155,
        30,
        spec.text,
        0x394063,
        0x6f7bb0,
        spec.onClick,
        spec.description,
      );
      this.actionButtons.push(btn.bg, btn.label);
    });
  }

  // --- Phase: Camp (Meta) ----------------------------------------------------

  private enterCampPhase(): void {
    this.titleText.setText("Camp — Meta phase");
    this.setHint("Use your camp jobs, then proceed to deployment.");
    const metaSkills = this.phaseSkills.forPhase("meta");
    this.layoutActionRow(
      metaSkills.map(({ unit, skill }) => ({
        text: `${unit.name}: ${skill.name}`,
        description: `${skill.name} — ${skill.description}`,
        onClick: () => this.useCampSkill(skill),
      })),
    );
    this.setPrimary("Proceed to Deployment");
  }

  private useCampSkill(skill: SkillDef): void {
    const out = applyCampSkill(skill, this.camp);
    this.refreshCampText();
    const parts: string[] = [];
    if (out.gold) parts.push(`+${out.gold} gold`);
    if (out.storage) parts.push(`+${out.storage} storage`);
    if (out.morale) parts.push(`+${out.morale} morale`);
    if (out.bankedHeal) parts.push(`banked +${out.bankedHeal} HP/unit`);
    this.setHint(`${skill.name}: ${parts.join(", ")}.`);
  }

  // --- Phase: Deployment -----------------------------------------------------

  private enterDeployPhase(): void {
    this.titleText.setText("Deployment — place your prep");
    this.setHint("Set a trap on the map (it springs on the first enemy onto it).");
    // Pull the trap's damage from the Survivalist's data so it stays data-driven.
    const deploySkills = this.phaseSkills.forPhase("deployment");
    const trapSkill = deploySkills.find((h) => h.skill.effect.kind === "placeTrap");
    if (trapSkill && trapSkill.skill.effect.kind === "placeTrap") {
      this.trapDamage = trapSkill.skill.effect.damage;
    }
    this.layoutActionRow(
      deploySkills.map(({ unit, skill }) => ({
        text: `${unit.name}: ${skill.name}`,
        description: `${skill.name} — ${skill.description}`,
        onClick: () => {
          this.armingTrap = true;
          this.setHint("Click a walkable tile to place the trap.");
        },
      })),
    );
    this.setPrimary("Start Battle");
  }

  private placeTrapAt(tile: GridCoord): void {
    if (!this.grid.isWalkable(tile)) {
      this.setHint("Can't place a trap there.");
      return;
    }
    if (this.battle.units.some((u) => u.alive && u.pos.col === tile.col && u.pos.row === tile.row)) {
      this.setHint("That tile is occupied.");
      return;
    }
    if (this.placedTraps.some((t) => t.pos.col === tile.col && t.pos.row === tile.row)) {
      this.setHint("There's already a trap there.");
      return;
    }
    const { x, y } = this.tileToWorld(tile);
    const marker = this.add
      .text(x, y - TILE_HEIGHT / 2, "✸", { color: "#ff9d5c", fontSize: "20px" })
      .setOrigin(0.5)
      .setDepth(0.8);
    this.placedTraps.push({ pos: { ...tile }, damage: this.trapDamage, marker, sprung: false });
    this.armingTrap = false;
    this.setHint("Trap placed. Set another, or Start Battle.");
  }

  // --- Phase: Battle ---------------------------------------------------------

  private startBattlePhase(): void {
    this.titleText.setText("Battle");
    this.clearActionButtons();
    this.armingTrap = false;

    // Register the Survivalist's traps as field entities (D4) before the fight.
    this.placedTraps.forEach((t, i) =>
      this.battle.entities.register(makeTrap(`trap-${i}`, t.pos, "player", t.damage)),
    );
    // Watch for traps springing, to give them a visual.
    this.battle.bus.on("unitEnterTile", ({ unit, tile }) => {
      if (unit.side !== "enemy") return;
      const t = this.placedTraps.find(
        (t) => !t.sprung && t.pos.col === tile.col && t.pos.row === tile.row,
      );
      if (t) {
        t.sprung = true;
        t.marker.setText("✺").setColor("#7a8190");
        this.tweens.add({ targets: t.marker, scale: 1.8, duration: 140, yoyo: true });
      }
    });

    // Apply the Chef's banked heal to the party (D8 morale buff lands here).
    const healed = applyCampToParty(this.camp, this.battle.units, this.battle.bus);
    this.refreshCampText();
    if (healed > 0) {
      for (const u of this.battle.units) {
        if (u.side === "player" && u.alive) this.flashHeal(u);
      }
    }

    this.battle.seed();
    this.refreshHud();
    this.setPrimary("Advance Clock");
    this.setHint(
      healed > 0
        ? `Chef's stew restored ${healed} HP across the party. Press Advance Clock.`
        : "Press Advance Clock to begin the battle.",
    );
  }

  // --- Primary button + phase transitions ------------------------------------

  private onPrimary(): void {
    const phase = this.pipeline.current();
    if (phase === "meta") {
      this.pipeline.advance(); // → deployment
      this.enterDeployPhase();
    } else if (phase === "deployment") {
      this.pipeline.advance(); // → battle
      this.startBattlePhase();
    } else if (phase === "battle") {
      this.onAdvance();
    }
  }

  // --- Battle loop -----------------------------------------------------------

  private onAdvance(): void {
    if (this.over || this.busy || this.waitingFor) return;
    const actor = this.battle.nextActor();
    if (!actor) {
      this.finish();
      return;
    }
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

  /** Draw a button per Battle-phase skill the acting unit's job grants. */
  private showSkillButtons(actor: Unit): void {
    const skills = unitSkills(actor, "battle");
    this.layoutActionRow(
      skills.map((skill) => ({
        text: skill.name,
        description: `${skill.name} — ${skill.description}`,
        onClick: () => this.onSkillButton(actor, skill),
      })),
    );
  }

  private onSkillButton(actor: Unit, skill: SkillDef): void {
    if (this.busy || this.waitingFor !== actor) return;
    if (skill.target === "self") {
      this.commitSkill(actor, skill, actor);
      return;
    }
    this.armedSkill = skill;
    this.setHint(`${skill.name}: click a valid target (or click ${actor.name} to cancel).`);
  }

  /** Apply a skill through the core, then animate it and end the turn. */
  private commitSkill(actor: Unit, skill: SkillDef, target: Unit): void {
    this.armedSkill = null;
    this.waitingFor = null;
    this.busy = true;
    this.clearActionButtons();
    this.highlightTile(null);
    const outcome = this.battle.useSkill(actor, skill, target);
    if (skill.target === "self") this.flashHeal(target);
    else this.flashAttack(actor, target);
    const verb = outcome.healed
      ? `heals ${outcome.healed}`
      : outcome.damage
        ? `hits for ${outcome.damage}`
        : outcome.status
          ? `applies ${outcome.status}`
          : "acts";
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
    const phase = this.pipeline.current();
    const tile = this.worldToTile(pointer.worldX, pointer.worldY);
    if (!this.grid.inBounds(tile)) return;

    if (phase === "deployment") {
      if (this.armingTrap) this.placeTrapAt(tile);
      return;
    }
    if (phase !== "battle") return;

    const actor = this.waitingFor;
    if (this.over || this.busy || !actor) return;

    const clicked = this.battle.units.find(
      (u) => u.alive && u.pos.col === tile.col && u.pos.row === tile.row,
    );

    if (this.armedSkill) {
      if (clicked === actor) {
        this.armedSkill = null;
        this.setHint(`${actor.name}'s turn — move, attack, or use a skill.`);
        return;
      }
      if (clicked && isValidSkillTarget(this.armedSkill, actor, clicked)) {
        this.commitSkill(actor, this.armedSkill, clicked);
      } else {
        this.setHint("Not a valid target for that skill.");
      }
      return;
    }

    if (clicked && clicked.side !== actor.side) {
      this.playerAttackOrApproach(actor, clicked);
    } else if (!clicked && this.grid.isWalkable(tile)) {
      this.playerMove(actor, tile);
    }
  }

  private playerAttackOrApproach(actor: Unit, foe: Unit): void {
    if (isAdjacent(actor.pos, foe.pos)) {
      this.commitPlayer(actor, [], foe);
      return;
    }
    const nav = occupiedGrid(this.grid, this.battle.units, [actor, foe]);
    const path = findPath(nav, actor.pos, foe.pos);
    if (!path || path.length < 2) {
      this.setHint("No path to that foe.");
      return;
    }
    const approach = path.slice(1, -1).slice(0, actor.moveRange);
    const dest = approach.length > 0 ? approach[approach.length - 1] : actor.pos;
    this.commitPlayer(actor, approach, isAdjacent(dest, foe.pos) ? foe : null);
  }

  private playerMove(actor: Unit, tile: GridCoord): void {
    const nav = occupiedGrid(this.grid, this.battle.units, [actor]);
    const path = findPath(nav, actor.pos, tile);
    if (!path || path.length < 2) {
      this.setHint("Can't move there.");
      return;
    }
    this.commitPlayer(actor, path.slice(1).slice(0, actor.moveRange), null);
  }

  /** Apply a player action through the core, then animate it. */
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

  // --- Animation -------------------------------------------------------------

  private animateMove(unit: Unit, path: readonly GridCoord[], done: () => void): void {
    const view = this.views.get(unit.id);
    if (!view || path.length === 0) {
      done();
      return;
    }
    const targets = path.map((c) => this.tileToWorld(c));
    this.tweens.chain({
      targets: view.container,
      tweens: targets.map((p) => ({ x: p.x, y: p.y, duration: 160, ease: "Linear" })),
      onComplete: done,
    });
  }

  private flashAttack(attacker: Unit, target: Unit): void {
    const av = this.views.get(attacker.id);
    const tv = this.views.get(target.id);
    if (av) {
      const home = this.tileToWorld(attacker.pos);
      const toward = this.tileToWorld(target.pos);
      this.tweens.add({
        targets: av.container,
        x: home.x + (toward.x - home.x) * 0.3,
        y: home.y + (toward.y - home.y) * 0.3,
        duration: 90,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }
    if (tv) {
      this.tweens.add({ targets: tv.container, alpha: 0.4, duration: 70, yoyo: true });
    }
  }

  private flashHeal(unit: Unit): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    this.tweens.add({
      targets: view.container,
      scale: 1.25,
      duration: 130,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  /** Common post-turn bookkeeping: refresh HUD, check win/lose, re-arm. */
  private afterTurn(): void {
    this.busy = false;
    this.refreshHud();
    this.highlightTile(null);
    const outcome = this.battle.outcome();
    if (outcome.over) {
      this.finish(outcome.winner);
      return;
    }
    this.setHint("Press Advance Clock for the next turn.");
  }

  private finish(winner?: Side): void {
    if (this.over) return;
    this.over = true;
    this.highlightTile(null);
    this.clearActionButtons();
    this.setPrimary("", false);
    const won = winner === "player";
    const msg = winner === undefined ? "Draw" : won ? "Victory!" : "Defeat";
    this.setHint(msg);
    this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, 320, 90, 0x11141b, 0.85)
      .setStrokeStyle(2, won ? 0x57b07a : 0xb05757)
      .setDepth(20);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, msg, {
        color: won ? "#9ff0bf" : "#f0a0a0",
        fontSize: "34px",
      })
      .setOrigin(0.5)
      .setDepth(21);
  }
}
