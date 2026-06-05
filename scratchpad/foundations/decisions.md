# Decisions: foundations

OPT-IN ledger for contested or multi-track work. Skip this file for simple,
single-track features. Before editing an entry, CLASSIFY the change and confirm
with the user: is this a **pivot** (supersede + re-open) or an **adjustment**
(new milestone)?

Statuses: `Open` · `Decided` · `Superseded` · `Deferred` · `Blocked`

Superseded entries are NEVER deleted — they keep a "Superseded by" link so the
trail of reasoning stays intact.

---

## D1 — Engine & platform strategy

- **Status:** Decided
- **Context:** First-time game developer, most comfortable on the web, but wants
  to keep the door open to ship on Steam and as a mobile app later.
- **Options considered:** Godot 4 / Unity / Web (TypeScript + Phaser 3) / Bevy (Rust)
- **Decision:** **Web-first — TypeScript + Phaser 3 + Vite.** Steam/desktop later
  via a Tauri or Electron wrapper; mobile later via Capacitor. These are additive
  wrappers around the same web build, not a port, so "web now" does not forfeit
  Steam/mobile.
- **Superseded by:** —

## D2 — Core/render separation (the rule that makes D1 safe)

- **Status:** Decided
- **Context:** A web game can bleed engine/DOM assumptions into game logic, which
  is exactly what makes later platform moves a rewrite.
- **Options considered:** (a) Phaser-coupled game objects throughout /
  (b) pure-logic `core` package + thin `game` render layer + future platform shells
- **Decision:** **(b).** `core/` is plain TypeScript with no Phaser and no DOM —
  stats, grid, pathfinding, jobs, skills, turn rules, run state. `game/` renders
  it with Phaser. Benefits: the core is headlessly unit-testable (which is what
  the kit's "tests green" milestone gates check), and it travels unchanged into
  any platform shell.
- **Superseded by:** —

## D3 — Phase pipeline: Meta → Deployment → Battle → Resolution

- **Status:** Decided
- **Context:** The signature non-combat jobs do NOT all act in the same place:
  Chef acts between battles (camp), Survivalist acts before a battle starts
  (deployment), Merchant acts in the economy/meta layer. Bolting these onto a
  single battle loop later would fight the architecture.
- **Options considered:** (a) one monolithic battle state / (b) explicit ordered
  phases with jobs/skills hooking specific phases
- **Decision:** **(b).** Model the game as ordered phases and treat jobs/skills as
  data that register effects into a phase. This makes the unique hook cheap to
  extend and is set up in M4, exercised in M5–M6.
- **Superseded by:** —
