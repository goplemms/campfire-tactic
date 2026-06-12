import Phaser from "phaser";
import {
  gridToScreen,
  screenToGrid,
  statusVisual,
  isValidSkillTarget,
  isImmobilized,
  effectiveMove,
  reachableTiles,
  forecastAttack,
  flankTiles,
  forecastEnemyAction,
  TILE_WIDTH,
  TILE_HEIGHT,
  type TileGrid,
  type GridCoord,
  type Unit,
  type SkillDef,
} from "../core";
import { COLOR, FONT, INK, WEIGHT } from "./theme";
import { roleColor } from "./roles";

/** Short token glyph for a unit: initials of a two-word name, else the first two letters. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (name[0]?.toUpperCase() ?? "") + (name[1]?.toLowerCase() ?? "");
}

/** The on-board presentation of one unit: a token container and its sub-parts. */
export interface UnitView {
  /** The live core unit (mutated in place, so reads stay current). */
  unit: Unit;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  /** Floating "Name" / "hp/max" plate — shown only for the active or hovered unit. */
  label: Phaser.GameObjects.Text;
  hp: Phaser.GameObjects.Text;
  badges: Phaser.GameObjects.Text;
  hpBarFill: Phaser.GameObjects.Rectangle;
  hpBarW: number;
}

/**
 * The shared **combat presentation** layer — the board geometry, the isometric
 * grid, the tile overlays, *and* the unit tokens — that both
 * {@link "./scenes/DemoScene"} (the standalone demo) and
 * {@link "./scenes/BattleScene"} (the real mission loop) render the same way.
 *
 * Both scenes drive the *same* core `Battle`, but each grew its own copy of this
 * drawing code; the demo (a polish spike) pulled ahead and the mission scene fell
 * behind. This is the seam that re-unites them: a scene owns its `Battle`,
 * orchestration and HUD, and delegates the board + token pixels here, so a board
 * tweak — or a future feel/telegraphing pass — is written once and shows up in
 * both. It owns the unit token objects (and sweeps them on {@link clearUnits});
 * the scene keeps its own non-unit board FX and teardown.
 */
export class CombatView {
  /** Board origin in screen space — the world offset added to every tile. */
  originX = 0;
  originY = 0;

  /** Every spawned unit's token, keyed by unit id. */
  readonly views = new Map<string, UnitView>();
  /** Live floating-combat-text objects, swept on teardown. */
  readonly floaters = new Set<Phaser.GameObjects.Text>();
  /** Attack-forecast labels drawn over foes in the move/attack preview. */
  private readonly forecastLabels = new Set<Phaser.GameObjects.Text>();
  /** The unit taking its turn / under the cursor — both reveal a nameplate. */
  activeUnitId: string | null = null;
  hoveredUnitId: string | null = null;
  /** Skip perpetual/juice motion (set by the screenshot harness) for stable frames. */
  reduceMotion = false;

  /** Units we've already played the death pop for (reset each encounter). */
  private readonly deadSeen = new Set<string>();
  /**
   * The most recent damage dealt to a unit, fed from the scene's `unitDamaged`
   * bus and consumed by {@link flashHit} so a heavy blow shakes harder than a
   * chip — without threading the amount through every attack call site.
   */
  private readonly lastHit = new Map<string, number>();

  constructor(private readonly scene: Phaser.Scene) {}

  // --- Board geometry -------------------------------------------------------

  /** Re-anchor the board (call whenever the scene recomputes its layout). */
  setOrigin(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
  }

  /** Tile coordinate → board-world pixel (the diamond's centre). */
  tileToWorld(coord: GridCoord): { x: number; y: number } {
    const { x, y } = gridToScreen(coord);
    return { x: this.originX + x, y: this.originY + y };
  }

  /** Board-world pixel → nearest tile coordinate. */
  worldToTile(px: number, py: number): GridCoord {
    const frac = screenToGrid({ x: px - this.originX, y: py - this.originY });
    return { col: Math.round(frac.col), row: Math.round(frac.row) };
  }

  /** Paint the whole grid onto `g`: a checkered diamond per tile, blocked tiles flagged. */
  drawGrid(g: Phaser.GameObjects.Graphics, grid: TileGrid): void {
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const { x, y } = this.tileToWorld({ col, row });
        const walkable = grid.isWalkable({ col, row });
        const fill = !walkable ? COLOR.tileBlocked : (col + row) % 2 === 0 ? COLOR.tileLight : COLOR.tileDark;
        this.drawDiamond(g, x, y, fill);
      }
    }
  }

  /** A translucent wash over one tile (reach / threat / safe-zone), with an optional outline. */
  fillTile(g: Phaser.GameObjects.Graphics, coord: GridCoord, fill: number, alpha: number, line?: number): void {
    const { x, y } = this.tileToWorld(coord);
    this.diamondPath(g, x, y);
    g.fillStyle(fill, alpha);
    g.fillPath();
    if (line !== undefined) {
      g.lineStyle(2, line, 0.9);
      g.strokePath();
    }
  }

  /** A tile outline only — e.g. an enemy's attack-range marker. */
  outlineTile(g: Phaser.GameObjects.Graphics, coord: GridCoord, color: number): void {
    const { x, y } = this.tileToWorld(coord);
    this.diamondPath(g, x, y);
    g.lineStyle(2.5, color, 0.95);
    g.strokePath();
  }

  /** Outline a single tile (the cursor / selected tile) onto `g`, or clear it on null. */
  highlightTile(g: Phaser.GameObjects.Graphics, coord: GridCoord | null): void {
    g.clear();
    if (!coord) return;
    const { x, y } = this.tileToWorld(coord);
    this.diamondPath(g, x, y);
    g.lineStyle(3, COLOR.accent, 1);
    g.strokePath();
  }

  /**
   * Paint a player unit's turn preview onto `g`: when a skill is `armed`, its valid
   * targets (green allies / red foes); otherwise the reachable tiles (blue wash) plus
   * a threat outline on every foe a move would bring into attack range. Clears `g`
   * first, so the caller just re-invokes it whenever the turn state changes.
   */
  drawPreview(g: Phaser.GameObjects.Graphics, actor: Unit, units: readonly Unit[], grid: TileGrid, armed?: SkillDef): void {
    g.clear();
    this.clearForecast();
    if (armed) {
      for (const u of units) {
        if (!u.alive || u.hidden || !isValidSkillTarget(armed, actor, u)) continue;
        const ally = u.side === actor.side;
        this.fillTile(g, u.pos, ally ? COLOR.success : COLOR.danger, 0.22, ally ? COLOR.accent : COLOR.threat);
      }
      return;
    }
    const budget = isImmobilized(actor) ? 0 : effectiveMove(actor);
    const reach = reachableTiles(actor, units, grid, budget);
    for (const r of reach) {
      if (r.tile.col === actor.pos.col && r.tile.row === actor.pos.row) continue;
      this.fillTile(g, r.tile, COLOR.reach, 0.18);
    }
    // Flank-tile preview: outline the reachable tiles that would set up a gang-up
    // on an adjacent foe — "stand here to flank" (the spatial half of the forecast).
    for (const tile of flankTiles(actor, units, grid)) {
      this.outlineTile(g, tile, COLOR.gold);
    }
    // Telegraph each foe the actor could strike this turn: outline it, and float a
    // forecast badge — the best-case damage, a flank tag, and a skull when lethal —
    // so a player reads the consequence before committing the move.
    for (const foe of units) {
      if (!foe.alive || foe.hidden || foe.side === actor.side) continue;
      const f = forecastAttack(actor, foe, units, grid);
      if (!f) continue;
      this.outlineTile(g, foe.pos, f.lethal ? COLOR.danger : COLOR.threat);
      this.drawForecast(foe, f);
    }
    // Enemy intent: for every foe that would act on one of the actor's side next
    // turn, draw a threat link to its mark and the incoming damage — read the
    // counter-attack before you commit.
    this.drawIntents(g, actor, units, grid);
  }

  /** Threat links from each enemy to the ally it intends to hit next turn (+ incoming damage). */
  private drawIntents(g: Phaser.GameObjects.Graphics, actor: Unit, units: readonly Unit[], grid: TileGrid): void {
    for (const foe of units) {
      if (!foe.alive || foe.hidden || foe.side === actor.side) continue;
      const intent = forecastEnemyAction(foe, units, grid);
      if (!intent || intent.target.side !== actor.side) continue;
      const from = this.tileToWorld(foe.pos);
      const to = this.tileToWorld(intent.target.pos);
      // A thin, semi-transparent threat line tipped with a chevron at the mark.
      g.lineStyle(1.5, COLOR.threat, 0.5);
      g.lineBetween(from.x, from.y - TILE_HEIGHT / 2, to.x, to.y - TILE_HEIGHT / 2);
      // Incoming-damage tag over the threatened ally: "↘N" (skull if it would drop them).
      const tag = intent.ability && intent.damage === 0 ? "snare" : `↘${intent.damage}${intent.lethal ? "☠" : ""}`;
      const label = this.scene.add
        .text(to.x, to.y - TILE_HEIGHT / 2 - 18, tag, { color: intent.lethal ? "#ff7a3a" : INK.danger, fontFamily: FONT.family, fontSize: FONT.nameplate, fontStyle: WEIGHT.bold })
        .setOrigin(0.5)
        .setDepth(6)
        .setStroke("#1a0d05", 3);
      this.forecastLabels.add(label);
    }
  }

  /** Float an attack-forecast badge above a foe (best-case damage / flank / lethal). */
  private drawForecast(foe: Unit, f: { damage: number; lethal: boolean; flank: boolean }): void {
    const { x, y } = this.tileToWorld(foe.pos);
    const text = `${f.flank ? "⚔" : ""}${f.damage}${f.lethal ? "☠" : ""}`;
    const color = f.lethal ? "#ff7a3a" : f.flank ? INK.gold : INK.ember;
    const label = this.scene.add
      .text(x, y - TILE_HEIGHT / 2 - 30, text, { color, fontFamily: FONT.family, fontSize: FONT.caption, fontStyle: WEIGHT.bold })
      .setOrigin(0.5)
      .setDepth(6)
      .setStroke("#1a0d05", 3);
    this.forecastLabels.add(label);
  }

  /** Drop every attack-forecast badge (called on redraw and when the preview clears). */
  private clearForecast(): void {
    for (const l of this.forecastLabels) l.destroy();
    this.forecastLabels.clear();
  }

  /** Wipe the preview graphics *and* its forecast badges — scenes call this to clear the preview. */
  clearPreview(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    this.clearForecast();
  }

  /** A solid, bordered tile diamond centred at world `(cx, cy)`. */
  private drawDiamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, fill: number): void {
    g.fillStyle(fill, 1);
    g.lineStyle(1, COLOR.border, 1);
    this.diamondPath(g, cx, cy);
    g.fillPath();
    g.strokePath();
  }

  /** Trace a tile-sized diamond path centred at `(cx, cy)` (caller fills/strokes it). */
  private diamondPath(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
  }

  // --- Unit tokens ----------------------------------------------------------

  /**
   * Spawn a unit's token: a side-coloured body with a role-coloured ring, its
   * initials inside, a contact shadow, an HP bar, status badges, and a nameplate
   * that's hidden until the unit is active or hovered (so spawn clusters don't
   * collapse into a pile of overlapping text). Returns the created view.
   */
  spawnUnit(unit: Unit): UnitView {
    const s = this.scene;
    const color = unit.side === "player" ? COLOR.ally : COLOR.foe;
    const stroke = unit.side === "player" ? COLOR.allyEdge : COLOR.foeEdge;
    const cy = -TILE_HEIGHT / 2;
    const body = s.add.circle(0, cy, 12, color).setStrokeStyle(3, roleColor(unit, stroke));
    const initials = s.add.text(0, cy, initialsOf(unit.name), { color: INK.onLight, fontFamily: FONT.family, fontSize: FONT.micro, fontStyle: WEIGHT.bold }).setOrigin(0.5);
    const label = s.add.text(0, cy - 36, unit.name, { color: INK.primary, fontFamily: FONT.family, fontSize: FONT.nameplate }).setOrigin(0.5).setVisible(false);
    const hp = s.add.text(0, cy - 24, "", { color: INK.success, fontFamily: FONT.family, fontSize: FONT.nameplate }).setOrigin(0.5).setVisible(false);
    const badges = s.add.text(0, cy + 10, "", { color: INK.gold, fontFamily: FONT.family, fontSize: FONT.nameplate }).setOrigin(0.5);
    const hpBarW = 26;
    const hpBarH = 6;
    const hpBarY = cy - 14;
    const hpBarBg = s.add.rectangle(0, hpBarY, hpBarW, hpBarH, COLOR.bg).setStrokeStyle(1, COLOR.black, 0.6);
    const hpBarFill = s.add.rectangle(-hpBarW / 2, hpBarY, hpBarW, hpBarH, COLOR.success).setOrigin(0, 0.5);
    const shadow = s.add.ellipse(0, -2, 24, 9, COLOR.black, 0.28);
    const container = s.add.container(0, 0, [shadow, hpBarBg, hpBarFill, body, initials, label, hp, badges]).setDepth(1);
    const view: UnitView = { unit, container, body, label, hp, badges, hpBarFill, hpBarW };
    this.views.set(unit.id, view);
    // Hovering a token reveals its nameplate (the other half of "active/hover only").
    body.setInteractive({ useHandCursor: false });
    body.on("pointerover", () => { this.hoveredUnitId = unit.id; this.refreshNameplate(unit.id); });
    body.on("pointerout", () => { if (this.hoveredUnitId === unit.id) this.hoveredUnitId = null; this.refreshNameplate(unit.id); });
    this.placeView(unit);
    return view;
  }

  /** Snap a unit's token to its current tile. */
  placeView(unit: Unit): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    const { x, y } = this.tileToWorld(unit.pos);
    view.container.setPosition(x, y);
  }

  /** Show a unit's floating nameplate iff it's the active or hovered (and visible) unit. */
  refreshNameplate(unitId: string): void {
    const view = this.views.get(unitId);
    if (!view) return;
    const show = view.unit.alive && !view.unit.hidden && (unitId === this.activeUnitId || unitId === this.hoveredUnitId);
    view.label.setVisible(show);
    view.hp.setVisible(show);
  }

  /** Mark the unit taking its turn; its nameplate stays up until the turn ends. */
  setActiveUnit(unit: Unit | null): void {
    const prev = this.activeUnitId;
    this.activeUnitId = unit?.id ?? null;
    if (prev && prev !== this.activeUnitId) this.refreshNameplate(prev);
    if (this.activeUnitId) this.refreshNameplate(this.activeUnitId);
    // A quick scale-pop when a unit takes the turn — a clearer hand-off than the
    // chevron alone. End state is unchanged (yoyo), so captures are unaffected.
    if (unit && prev !== this.activeUnitId && !this.reduceMotion) {
      const view = this.views.get(unit.id);
      if (view) this.scene.tweens.add({ targets: view.container, scaleX: 1.18, scaleY: 1.18, duration: 130, yoyo: true, ease: "Quad.Out" });
    }
  }

  /** Refresh every token's HP bar, status badges, fade state, and death pop. */
  refreshUnits(): void {
    for (const view of this.views.values()) {
      const unit = view.unit;
      view.hp.setText(`${Math.max(0, unit.hp)}/${unit.maxHp}`);
      // HP bar: width by fraction, tint green→amber→red as it drops.
      const frac = unit.maxHp > 0 ? Math.max(0, unit.hp) / unit.maxHp : 0;
      view.hpBarFill.width = Math.max(0, view.hpBarW * frac);
      view.hpBarFill.setFillStyle(frac > 0.5 ? COLOR.success : frac > 0.25 ? COLOR.gold : COLOR.danger);
      view.hpBarFill.setVisible(unit.alive);
      // Status trackers (D41): one glyph per active status, tinted by the registry.
      const badges = unit.statuses.map((st) => statusVisual(st.id).glyph).join("");
      view.badges.setText(badges);
      if (unit.statuses.length > 0) view.badges.setColor(`#${statusVisual(unit.statuses[0].id).tint.toString(16).padStart(6, "0")}`);
      view.container.setAlpha(!unit.alive ? 0.2 : unit.captured ? 0.4 : unit.hidden ? 0.35 : 1);
      // Death pop: the first time a unit reads as dead, collapse its token so the
      // kill registers (it then rests as the faded "downed" marker).
      if (!unit.alive && !this.deadSeen.has(unit.id)) {
        this.deadSeen.add(unit.id);
        view.hpBarFill.setVisible(false);
        if (!this.reduceMotion) this.scene.tweens.add({ targets: view.container, scaleX: 0.72, scaleY: 0.72, duration: 260, ease: "Quad.Out" });
      }
    }
  }

  /** A short-lived combat-text pop-up that drifts up off a unit and fades. */
  floatText(unit: Unit, text: string, color: string, dy = 0): void {
    if (!this.views.has(unit.id)) return;
    const { x, y } = this.tileToWorld(unit.pos);
    this.emitFloat(x, y - TILE_HEIGHT / 2 - 18 + dy, text, color, 13);
  }

  /**
   * A **damage number** with magnitude-scaled emphasis: a chip floats small in
   * muted red, a heavy blow floats big and hot with a punchy scale-pop and a
   * longer, taller rise — so the size of the hit *reads* before you parse the
   * digits. Intensity is the damage as a fraction of the target's max HP (a hit
   * for ~40%+ of the bar maxes out); there's no separate crit flag in the rules,
   * so magnitude stands in for "crit". Routes through the shared float emitter.
   */
  floatDamage(unit: Unit, amount: number): void {
    if (amount <= 0 || !this.views.has(unit.id)) return;
    const intensity = Math.min(1, amount / Math.max(1, unit.maxHp) / 0.4);
    const sizePx = Math.round(13 + intensity * 11); // 13 (chip) → 24 (heavy)
    // Muted red for a chip, ember-orange mid, white-hot for a crusher.
    const color = intensity < 0.34 ? INK.danger : intensity < 0.67 ? "#ff9a4a" : "#ff6a2a";
    const { x, y } = this.tileToWorld(unit.pos);
    this.emitFloat(x, y - TILE_HEIGHT / 2 - 18, `-${amount}`, color, sizePx, intensity);
  }

  /** Record the damage a unit just took (from the scene's `unitDamaged` bus). */
  noteDamage(unitId: string, amount: number): void {
    if (amount > 0) this.lastHit.set(unitId, amount);
  }

  /** Spawn one floating text and tween it up as it fades; `pop` adds a scale punch. */
  private emitFloat(x: number, y: number, text: string, color: string, sizePx: number, pop = 0): void {
    const t = this.scene.add
      .text(x, y, text, { color, fontFamily: FONT.family, fontSize: `${sizePx}px`, fontStyle: WEIGHT.bold })
      .setOrigin(0.5)
      .setDepth(30);
    if (pop > 0) t.setScale(1 + pop * 0.6).setStroke("#3a0f04", 3);
    this.floaters.add(t);
    this.scene.tweens.add({
      targets: t,
      y: y - (26 + pop * 14),
      alpha: 0,
      scale: 1,
      duration: 760 + pop * 220,
      ease: "Cubic.Out",
      onComplete: () => {
        this.floaters.delete(t);
        t.destroy();
      },
    });
  }

  /** Slide a unit's token along a path, calling `done` when it lands. */
  animateMove(unit: Unit, path: readonly GridCoord[], done: () => void, stepMs = 130): void {
    const view = this.views.get(unit.id);
    if (!view || path.length === 0) {
      this.placeView(unit);
      return done();
    }
    const targets = path.map((c) => this.tileToWorld(c));
    this.scene.tweens.chain({ targets: view.container, tweens: targets.map((p) => ({ x: p.x, y: p.y, duration: stepMs, ease: "Linear" })), onComplete: done });
  }

  /**
   * The attack-impact FX: the attacker lunges a third of the way at the target, the
   * struck token flashes white and blinks, and the camera gives a short shake. The
   * body colour is captured and restored, so a recoloured token (a captured unit)
   * keeps its hue. Shake is skipped under reduceMotion for stable captures.
   */
  flashHit(attacker: Unit, target: Unit): void {
    const av = this.views.get(attacker.id);
    const tv = this.views.get(target.id);
    // How hard this landed: the damage just dealt (noted off the bus) as a
    // fraction of the target's bar — a hit for ~40%+ of max HP maxes the impact.
    const dmg = this.lastHit.get(target.id);
    this.lastHit.delete(target.id);
    const intensity = dmg ? Math.min(1, dmg / Math.max(1, target.maxHp) / 0.4) : 0;
    // A bigger blow lunges farther into the target (chip ~0.28 → crusher ~0.42).
    if (av && attacker !== target) {
      const home = this.tileToWorld(attacker.pos);
      const toward = this.tileToWorld(target.pos);
      const reach = 0.28 + intensity * 0.14;
      this.scene.tweens.add({ targets: av.container, x: home.x + (toward.x - home.x) * reach, y: home.y + (toward.y - home.y) * reach, duration: 90, yoyo: true, ease: "Quad.easeOut" });
    }
    if (tv) {
      const prevFill = tv.body.fillColor;
      tv.body.setFillStyle(COLOR.white);
      this.scene.tweens.add({ targets: tv.container, alpha: 0.4, duration: 70, yoyo: true, onComplete: () => this.refreshUnits() });
      this.scene.time.delayedCall(95, () => tv.body.setFillStyle(prevFill));
      // Impact scales with the blow: a chip barely nudges the camera, a crusher
      // shakes hard and freezes longer. A kill always lands near the top of the
      // range so finishing a foe feels decisive, big overkill harder still.
      // (The death pop itself is played by refreshUnits when the token reads dead.)
      const fatal = !target.alive;
      const power = fatal ? Math.max(0.8, intensity) : intensity;
      if (!this.reduceMotion) {
        this.scene.cameras.main.shake(55 + power * 95, 0.003 + power * 0.006);
        this.hitStop(Math.round(35 + power * 70));
      }
    }
  }

  /**
   * A brief **hit-stop**: freeze every tween for `ms` so an impact *lands* — the
   * pause reads as force. The scene clock keeps running (so this self-restores),
   * and it's skipped under reduceMotion to keep captures deterministic.
   */
  private hitStop(ms: number): void {
    if (this.reduceMotion) return;
    const tw = this.scene.tweens;
    if (tw.timeScale === 0) return; // already frozen by a prior hit this frame
    tw.timeScale = 0;
    this.scene.time.delayedCall(ms, () => {
      tw.timeScale = 1;
    });
  }

  /** A heal/buff cue: a quick scale-pop on the unit's token. */
  flashHeal(unit: Unit): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    this.scene.tweens.add({ targets: view.container, scale: 1.25, duration: 130, yoyo: true, ease: "Quad.easeOut" });
  }

  /** Tear down all unit tokens and floaters (call when rebuilding the board). */
  clearUnits(): void {
    for (const f of this.floaters) f.destroy();
    this.floaters.clear();
    this.clearForecast();
    for (const view of this.views.values()) view.container.destroy();
    this.views.clear();
    this.deadSeen.clear();
    this.lastHit.clear();
    this.activeUnitId = null;
    this.hoveredUnitId = null;
  }
}
