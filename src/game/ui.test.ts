import { describe, it, expect, vi, afterEach } from "vitest";
import { fitText } from "./ui";

// Phaser draws text to a canvas, so `fitText` can't be exercised against a real
// Text object without a browser. But it only ever reads `.width`/`.text` and
// calls `.setScale`/`.setText` — so a tiny stub whose width tracks its character
// count lets us prove all three branches (fits / snug-shrink / over-budget) in
// plain vitest. `width` is the *unscaled* texture width in Phaser (setScale is a
// display transform that doesn't change it), so the stub models it the same way.
const CHAR_W = 7;
function makeLabel(text: string) {
  return {
    text,
    scaleX: 1,
    scaleY: 1,
    setScale(s: number) {
      this.scaleX = this.scaleY = s;
      return this;
    },
    setText(t: string) {
      this.text = t;
      return this;
    },
    get width() {
      return this.text.length * CHAR_W;
    },
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fit = (label: ReturnType<typeof makeLabel>, maxWidth: number) => fitText(label as any, maxWidth);

afterEach(() => vi.restoreAllMocks());

describe("fitText", () => {
  it("leaves a label that already fits at full scale", () => {
    const label = makeLabel("Defend"); // 6 chars → 42px
    fit(label, 70);
    expect(label.scaleX).toBe(1);
    expect(label.text).toBe("Defend");
  });

  it("shrinks a snug label uniformly to fit, staying above the readable floor", () => {
    const label = makeLabel("elevenchars"); // 11 chars → 77px, just over 70
    fit(label, 70);
    expect(label.scaleX).toBeCloseTo(70 / 77, 5);
    expect(label.scaleX).toBeGreaterThanOrEqual(0.8); // within the snug band
    expect(label.text).toBe("elevenchars"); // not truncated
  });

  it("flags an over-budget label as invalid usage and ellipsizes it instead of shrinking", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const label = makeLabel("this is basically a whole sentence in a button"); // far past the floor
    fit(label, 70);
    expect(err).toHaveBeenCalledOnce();
    expect(err.mock.calls[0][0]).toContain("over budget");
    expect(label.scaleX).toBe(1); // full size — no smear
    expect(label.text.endsWith("…")).toBe(true); // bounded, visibly truncated
    expect(label.width).toBeLessThanOrEqual(70);
  });

  it("does not flag a label that fits", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fit(makeLabel("Advance Clock"), 200);
    expect(err).not.toHaveBeenCalled();
  });
});
