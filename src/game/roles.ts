import type { Unit } from "../core";

/**
 * Per-role accent colours for board tokens. The token *fill* stays side-coloured
 * (gold ally / red foe) so friend-or-foe reads instantly; this recolours the
 * token's *ring* by the unit's role so you can also tell the knight from the
 * scout from the medic at a glance — without decoding the 2-letter initials.
 *
 * Allies key off their job; foes (which rarely carry a job) key off their name.
 */
const JOB_COLORS: Record<string, number> = {
  soldier: 0x6f9bd6,
  "heavy-knight": 0x6f9bd6, // steel — frontline / tank
  hunter: 0xe0b24a, //         amber — ranged marker
  scout: 0x6fd69b, //          green — mobility / recon
  medic: 0x8fe0d0, //          cyan  — sustain
  chef: 0xe0903a, //           orange — support
  merchant: 0xd6c24a, //       gold  — economy
  survivalist: 0x9bd66f, //    leaf  — traps
  "snare-trapper": 0x4fb0a0, // teal  — debuffer
};

const FOE_COLORS: { match: RegExp; color: number }[] = [
  { match: /captain|boss/i, color: 0xf0c060 }, // bright — the leader
  { match: /bowman|archer/i, color: 0xe0b24a }, // amber — ranged
  { match: /cutthroat|thief|assassin/i, color: 0xc07fd0 }, // violet — skirmisher
  { match: /trapper|snare/i, color: 0x4fb0a0 }, // teal — debuffer
  { match: /sapper/i, color: 0xe0843a }, // orange — objective threat
];

/**
 * The role-accent colour for a unit's token ring, or `fallback` (its side stroke)
 * when no role is recognised.
 */
export function roleColor(unit: Unit, fallback: number): number {
  const job = unit.primaryJob ?? unit.jobId;
  if (job && job in JOB_COLORS) return JOB_COLORS[job];
  for (const f of FOE_COLORS) if (f.match.test(unit.name)) return f.color;
  return fallback;
}
