import { describe, it, expect } from "vitest";
import { DemoRunner, type RunReport } from "./demo-quest";

// Minimal local typing for the node global (the project carries no @types/node);
// used only to print the sheet, which vitest's console.log interception hides.
declare const process: { stdout: { write(s: string): boolean } };

// A readable "balance sheet" for The Hollow Mill: auto-play the quest down both
// branches of the deserter choice and tabulate the per-encounter telemetry, so we
// can spot pushovers / coin-flips and see whether the choice changes the fight.
//
//   npm run balance      (or: npx vitest run src/core/demo-balance.test.ts)
//
// Caveat baked into the numbers: auto-play is an AI-vs-AI sim — both sides run on
// the same scoring planner and the party doesn't use kits/items — so read these as
// a *relative* difficulty signal between fights and branches, not as a verdict on
// how a human will fare.

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

function sheet(r: RunReport): string {
  const head = `  ${"encounter".padEnd(26)} ${"result".padEnd(13)} ${"turns".padStart(5)} ${"endHP".padStart(5)} ${"lowHP".padStart(5)} ${"down".padStart(4)} ${"foes".padStart(4)} ${"dbuf".padStart(4)}`;
  const rows = r.encounters.map(
    (e) =>
      `  ${e.encounter.padEnd(26)} ${e.result.padEnd(13)} ${String(e.turns).padStart(5)} ${pct(e.endHpPct)} ${pct(e.lowestHpPct)} ${String(e.downed).padStart(4)} ${String(e.foesLeft).padStart(4)} ${String(e.debuffPeak).padStart(4)}`,
  );
  return [`  ── ${r.restChoice.toUpperCase()} → ${r.outcome.toUpperCase()} ──`, head, ...rows].join("\n");
}

describe("Hollow Mill balance sheet (D43 telemetry)", () => {
  it("auto-plays both deserter branches and tabulates the difficulty", () => {
    const reports = (["spare", "press"] as const).map((c) => new DemoRunner().autoPlayReport(c));

    // The deliverable: print the sheet so `npm run balance` shows it. Write to
    // stdout directly — vitest intercepts console.log but not this.
    process.stdout.write("\n" + reports.map(sheet).join("\n\n") + "\n\n");

    // Guard the telemetry stays sane (and that both branches still walk the quest).
    for (const r of reports) {
      expect(["complete", "failed", "wipe"]).toContain(r.outcome);
      expect(r.encounters.length).toBeGreaterThan(0);
      for (const e of r.encounters) {
        expect(e.turns).toBeGreaterThan(0);
        expect(e.endHpPct).toBeGreaterThanOrEqual(0);
        expect(e.endHpPct).toBeLessThanOrEqual(1);
        expect(e.lowestHpPct).toBeLessThanOrEqual(e.endHpPct + 1e-9); // no healing in-sim → lowest ≤ end
        expect(e.downed).toBeLessThanOrEqual(5);
      }
    }
  });
});
