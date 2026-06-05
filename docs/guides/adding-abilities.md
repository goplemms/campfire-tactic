# Guide — Adding a new ability (skill)

> Audience: anyone adding combat or non-combat abilities. Assumes the codebase at
> the end of **M5** (jobs/skills as data, the D3 phase pipeline, the field-entity
> bus). Design rationale lives in [`docs/design/`](../design/); this guide is the
> *how-to*.

Abilities are **data**, not subclasses (decisions **D3/D4**). You almost never
touch the battle loop — you add a record to a job and, *only if* you need a brand
new kind of effect, one `case` to a resolver. This guide walks both paths.

## The mental model

```
JobDef ──has many──▶ SkillDef ──declares──▶ phase + target + effect
   │                                            │
   │ unit.jobId links a unit to its job         │ effect is interpreted by the
   ▼                                            ▼ resolver for that phase
unitSkills(unit, phase)                  battle → resolveSkill()
PhaseSkillRegistry.forPhase(phase)       meta   → applyCampSkill()
                                         deploy → makeTrap() (from placeTrap data)
```

- A **skill** (`SkillDef` in [`src/core/skills.ts`](../../src/core/skills.ts))
  declares which **phase** it hooks (`meta | deployment | battle | resolution`),
  what it **targets**, its **range**, the CT it **spends**, and a declarative
  **effect**.
- A **job** (`JobDef` in [`src/core/jobs.ts`](../../src/core/jobs.ts)) is a named
  list of skills. A unit's `jobId` links it to one.
- The **render layer** ([`BattleScene`](../../src/game/scenes/BattleScene.ts))
  reads skills back per phase and draws buttons. It owns no rules — it calls
  `core` and animates.

### The effect catalogue (today)

| `effect.kind` | Phase | Resolved by | Shape |
|---|---|---|---|
| `damage` | battle | `resolveSkill` | `{ bonusAttack }` — a hit at `attack + bonusAttack` |
| `heal` | battle | `resolveSkill` | `{ amount }` — restore HP (capped) |
| `status` | battle | `resolveSkill` | `{ status }` — apply a `StatusInstance` |
| `economy` | meta | `applyCampSkill` | `{ gold, storage }` — Merchant |
| `morale` | meta | `applyCampSkill` | `{ morale, partyHeal }` — Chef |
| `placeTrap` | deployment | `makeTrap` | `{ damage }` — Survivalist |

`target` is `self | enemy | ally` for battle skills, or `camp | party` for the
non-combat ones.

---

## Path A — a new ability that reuses an existing effect (data-only)

This is the common case and it's a **one-file change**: add a `SkillDef` to a
job's `skills` array. No core logic, no render changes — the buttons and
resolution already exist.

**Example: give the Soldier a "Rallying Strike" that hits and self-heals.** Two
effects in one skill aren't supported, so model it as two skills, or pick one.
Here's a simpler real addition — a longer-reach "Lunge":

```ts
// in src/core/jobs.ts, inside SOLDIER.skills:
{
  id: "lunge",
  name: "Lunge",
  description: "A reaching strike (+3 attack) against a foe up to 2 tiles away.",
  phase: "battle",
  target: "enemy",
  range: 2,                     // reuses isValidSkillTarget's range check
  spend: "act",
  effect: { kind: "damage", bonusAttack: 3 },
},
```

That's it. Because it's a `battle` skill on a unit with a job,
`BattleScene.showSkillButtons` (which calls `unitSkills(actor, "battle")`) will
render a **Lunge** button automatically; clicking it arms targeting, and
`isValidSkillTarget` enforces the range-2 / enemy rule.

**Checklist for Path A**
1. Add the `SkillDef` to the right job in `jobs.ts`.
2. Add/extend a test in [`jobs.test.ts`](../../src/core/jobs.test.ts) asserting
   the skill loads and `unitSkills` returns it.
3. (If it's a new *resolution* behaviour worth pinning) add a
   [`skills.test.ts`](../../src/core/skills.test.ts) case.
4. `npm test` + `npm run build`. Done.

---

## Path B — a new *kind* of effect (touches the resolver)

When the effect can't be expressed by an existing kind, add one. This touches
**three** places at most: the effect union, the phase resolver, and (sometimes)
the render layer for feedback. Keep the core change tiny and let the bus carry
the rest.

**Example: a battle `drain` — damage a foe and heal the caster for half.**

1. **Declare the effect** in `src/core/skills.ts`:

   ```ts
   /** Damage a foe and heal the caster for `leech` fraction of the damage. */
   export interface DrainEffect { kind: "drain"; bonusAttack: number; leech: number; }

   export type SkillEffect =
     | DamageEffect | HealEffect | StatusEffect
     | EconomyEffect | MoraleEffect | PlaceTrapEffect
     | DrainEffect;          // ← add it
   ```

2. **Resolve it** in the right resolver. `drain` is a Battle effect, so add a
   `case` to `resolveSkill` (same file). Reuse `applyDamage` so defeat/heal events
   fire exactly like everything else:

   ```ts
   case "drain": {
     const dmg = resolveAttack(caster, target, bus, caster.attack + effect.bonusAttack);
     const heal = Math.floor(dmg * effect.leech);
     caster.hp = Math.min(caster.maxHp, caster.hp + heal);
     bus?.emit("unitHealed", { unit: caster, amount: heal, source: caster });
     return { damage: dmg, healed: heal };
   }
   ```

   > The `switch` ends with a `throw` for unrecognised kinds — put your `case`
   > before it. For a **meta** effect you'd add the `case` to `applyCampSkill`
   > in [`camp.ts`](../../src/core/camp.ts) instead; for **deployment**, build a
   > `FieldEntity` (see `makeTrap` in [`entities.ts`](../../src/core/entities.ts)).

3. **Add the skill** to a job (Path A), e.g. a "Leech" on some job with
   `effect: { kind: "drain", bonusAttack: 0, leech: 0.5 }`.

4. **Render feedback (optional).** `BattleScene.commitSkill` already reports
   `outcome.damage` / `outcome.healed`, so a drain shows both with no change. If
   your effect needs *new* visuals (an AoE marker, a knockback tween), add it
   there — the scene is the only place that may grow.

5. **Test it** in `skills.test.ts` (assert damage dealt + caster healed + events).

**Checklist for Path B**
1. Add the interface to the `SkillEffect` union.
2. Handle it in the phase resolver (`resolveSkill` / `applyCampSkill` / an entity
   factory) — reuse `applyDamage`, `applyStatus`, bus events.
3. Add the skill to a job.
4. Add a `skills.test.ts` (or `camp.test.ts`) case.
5. `npm test` + `npm run build`.

---

## Adding a whole new job

1. Define a `JobDef` in `jobs.ts` with its skills and register it in the `JOBS`
   map (`[NEWJOB.id]: NEWJOB`).
2. Give a unit `jobId: "newjob"` (in a roster, e.g. `BattleScene.makeCombatants`
   or `makeCampCrew`). `registerParty` will bucket its skills into the right
   phases automatically.
3. Test: `getJob("newjob")` loads, and `registerParty` puts each skill under its
   phase (see the "three signature jobs" case in `jobs.test.ts`).

A non-combat job's bearer can live **off-grid** (like Pip/Coin) — it still
contributes its phase skills through `registerParty`.

---

## How a skill reaches the screen

- **Battle:** `BattleScene.showSkillButtons` → `unitSkills(actor, "battle")` →
  one button per skill. `self` skills resolve immediately; targeted skills arm,
  then a click is validated by `isValidSkillTarget` and run via
  `Battle.useSkill(caster, skill, target)` (which resolves the effect **and**
  ends the turn, spending CT per `skill.spend`).
- **Camp (meta):** `enterCampPhase` → `phaseSkills.forPhase("meta")` → buttons →
  `applyCampSkill(skill, camp)`.
- **Deployment:** `enterDeployPhase` → `forPhase("deployment")`; the scene reads
  the `placeTrap` data and registers a `makeTrap` entity at battle start.

To surface a skill in a phase the scene doesn't render yet (e.g. `resolution`),
add a small overlay following the camp/deploy pattern.

---

## Gotchas & conventions

- **CT cost.** `spend: "act"` costs `ACT_COST` (100), `"move"` costs `MOVE_COST`
  (50) — see [`clock.ts`](../../src/core/clock.ts). Battle skills are normally
  Acts. `Battle.useSkill` ends the turn for you; don't also call `endTurn`.
- **Status tick timing.** Statuses tick on the *target's* turn start
  (`Battle.nextActor`), so a 1-turn lockout needs `duration: 2` to survive that
  tick and actually cost a move — that's why Hamstring's Immobilized is `2`. See
  [`status.ts`](../../src/core/status.ts).
- **Damage goes through `applyDamage`.** Never mutate `hp` directly in an effect —
  use `resolveAttack` / `applyDamage` so `onUnitDamaged` / `onUnitDefeated` fire
  and traps/listeners stay consistent.
- **Traps ignore their owner** and fire once; forced entry (D19) triggers them via
  the same `onUnitEnterTile`. Model new placeables as `FieldEntity` listeners, not
  loop special-cases.
- **Non-combat effects throw in `resolveSkill`.** Keep battle effects in
  `resolveSkill` and camp effects in `applyCampSkill`; the throw is a guard, not a
  TODO.
- **Keep `core/` pure.** No Phaser/DOM in `src/core/`. Resolution + math live in
  core; only feedback (tweens, markers, text) lives in the scene.

## File map

| Concern | File |
|---|---|
| Skill defs, effect union, `resolveSkill`, targeting | `src/core/skills.ts` |
| Jobs + registry (`JOBS`, `getJob`, `unitSkills`, `registerParty`) | `src/core/jobs.ts` |
| Phase pipeline + per-phase skill registry | `src/core/phases.ts` |
| Camp/meta effects (`applyCampSkill`, `applyCampToParty`) | `src/core/camp.ts` |
| Field entities (`makeTrap`, `EntityRegistry`) | `src/core/entities.ts` |
| Damage/heal/defeat + events | `src/core/combat.ts`, `src/core/events.ts` |
| Battle orchestration (`Battle.useSkill`) | `src/core/turn.ts` |
| Buttons, targeting UI, animations | `src/game/scenes/BattleScene.ts` |
| Tests | `src/core/*.test.ts` |
