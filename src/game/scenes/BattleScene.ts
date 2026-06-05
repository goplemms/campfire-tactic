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
  type GridCoord,
  type Unit,
  type Side,
  type SkillDef,
} from "../../core";

/**
 * M3 scene: a tiny two-sided skirmish on the iso grid, run on the core's CT
 * clock. The scene owns **no** battle rules — it builds a {@link Battle} from
 * `core`, drives it through `nextActor` / `moveUnit` / `attack` / `endTurn`, and
 * only draws + animates the result. "Advance Clock" steps to the next actor:
 * enemies act automatically; on your unit's turn, click a tile to move or an
 * adjacent foe to attack.
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

  /** The unit currently awaiting player input (null otherwise). */
  private waitingFor: Unit | null = null;
  /** A skill armed and awaiting a target click (null otherwise). */
  private armedSkill: SkillDef | null = null;
  /** Live skill-button game objects for the current player turn. */
  private skillButtons: Phaser.GameObjects.GameObject[] = [];
  /** True while an animation plays — input is locked. */
  private busy = false;
  private over = false;

  constructor() {
    super("BattleScene");
  }

  create(): void {
    this.grid = new TileGrid(BattleScene.COLS, BattleScene.ROWS, BattleScene.BLOCKED);
    this.battle = new Battle(this.grid, this.makeUnits());
    this.battle.seed();

    this.originX = this.scale.width / 2;
    this.originY = this.scale.height / 2 - (BattleScene.ROWS * TILE_HEIGHT) / 2 - 10;

    this.drawGrid();
    this.highlight = this.add.graphics().setDepth(0.5);
    this.spawnUnits();

    this.orderText = this.add
      .text(12, 12, "", { color: "#cdd7ee", fontSize: "13px", lineSpacing: 3 })
      .setDepth(10);
    this.hintText = this.add
      .text(this.scale.width / 2, this.scale.height - 56, "", {
        color: "#9fb0d0",
        fontSize: "14px",
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.makeButton();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    this.refreshHud();
    this.setHint("Press Advance Clock to begin.");
  }

  /** The starting roster — pure data (D4 ethos). */
  private makeUnits(): Unit[] {
    return [
      createUnit({ id: "Rook", side: "player", pos: { col: 0, row: 1 }, name: "Rook", jobId: "soldier", speed: 12, maxHp: 30, attack: 9, defense: 3, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Vale", side: "player", pos: { col: 0, row: 4 }, name: "Vale", jobId: "soldier", speed: 10, maxHp: 24, attack: 11, defense: 2, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Grunt", side: "enemy", pos: { col: 7, row: 1 }, name: "Grunt", speed: 9, maxHp: 22, attack: 7, defense: 2, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Brute", side: "enemy", pos: { col: 7, row: 4 }, name: "Brute", speed: 7, maxHp: 30, attack: 8, defense: 3, moveRange: 3, sightRadius: 4 }),
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

  private setHint(text: string): void {
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

  // --- Controls --------------------------------------------------------------

  private makeButton(): void {
    const x = this.scale.width / 2;
    const y = this.scale.height - 26;
    const bg = this.add
      .rectangle(x, y, 180, 34, 0x2f6b46)
      .setStrokeStyle(2, 0x57b07a)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    const label = this.add
      .text(x, y, "Advance Clock", { color: "#eafff0", fontSize: "15px" })
      .setOrigin(0.5)
      .setDepth(11);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.onAdvance());
    label.setName("advanceLabel");
  }

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

  // --- Skill UI (M4) ---------------------------------------------------------

  /** Draw a button per Battle-phase skill the acting unit's job grants. */
  private showSkillButtons(actor: Unit): void {
    this.clearSkillButtons();
    const skills = unitSkills(actor, "battle");
    const y = this.scale.height - 64;
    const gap = 150;
    const startX = this.scale.width / 2 - ((skills.length - 1) * gap) / 2;
    skills.forEach((skill, i) => {
      const x = startX + i * gap;
      const bg = this.add
        .rectangle(x, y, 140, 26, 0x394063)
        .setStrokeStyle(2, 0x6f7bb0)
        .setInteractive({ useHandCursor: true })
        .setDepth(12);
      const label = this.add
        .text(x, y, skill.name, { color: "#dfe6ff", fontSize: "13px" })
        .setOrigin(0.5)
        .setDepth(13);
      bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () =>
        this.onSkillButton(actor, skill),
      );
      this.skillButtons.push(bg, label);
    });
  }

  private clearSkillButtons(): void {
    for (const obj of this.skillButtons) obj.destroy();
    this.skillButtons = [];
  }

  private onSkillButton(actor: Unit, skill: SkillDef): void {
    if (this.busy || this.waitingFor !== actor) return;
    if (skill.target === "self") {
      // Resolve immediately — no target needed.
      this.commitSkill(actor, skill, actor);
      return;
    }
    // Arm it; the next valid target click resolves it.
    this.armedSkill = skill;
    this.setHint(`${skill.name}: click a valid target (or click ${actor.name} to cancel).`);
  }

  /** Apply a skill through the core, then animate it and end the turn. */
  private commitSkill(actor: Unit, skill: SkillDef, target: Unit): void {
    this.armedSkill = null;
    this.waitingFor = null;
    this.busy = true;
    this.clearSkillButtons();
    this.highlightTile(null);
    const outcome = this.battle.useSkill(actor, skill, target);
    if (skill.target === "self") {
      this.flashHeal(target);
    } else {
      this.flashAttack(actor, target);
    }
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
    const actor = this.waitingFor;
    if (this.over || this.busy || !actor) return;
    const tile = this.worldToTile(pointer.worldX, pointer.worldY);
    if (!this.grid.inBounds(tile)) return;

    const clicked = this.battle.units.find(
      (u) => u.alive && u.pos.col === tile.col && u.pos.row === tile.row,
    );

    // A skill is armed: the next click picks its target (or cancels on self).
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
    // Path to a tile adjacent to the foe (its own tile is allowed as endpoint).
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
    this.clearSkillButtons();
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
