import Phaser from "phaser";

/**
 * Shrink a canvas text label so it never paints past the button rectangle it
 * sits on. The scenes draw buttons as a fixed-size {@link Phaser.GameObjects.Rectangle}
 * with a centered/left-anchored {@link Phaser.GameObjects.Text} on top — nothing
 * clips or reflows that text, so a long label (a kit name + a `[cd N]` tag, a long
 * camp action) used to spill over the edges.
 *
 * This scales the label down uniformly to fit `maxWidth`, keeping it crisp and
 * anchored on whatever origin the label already uses (so centered buttons stay
 * centered, left-aligned buttons stay left). It resets to scale 1 first, so it's
 * safe to call again whenever the label text changes (e.g. the primary button).
 * A no-op when the text already fits.
 *
 * Shrinking is clamped at {@link minScale} so a very long label never collapses
 * to an illegible smear: past that floor we stop scaling and accept a hair of
 * overflow, on the principle that readable-but-snug beats microscopic. Callers
 * that want a guaranteed clean fit should size their container to the content
 * (see `DemoScene.layoutButtons`) so this safety net rarely triggers.
 *
 * @param label    the text object drawn on the button
 * @param maxWidth the inner pixel width to fit within (pass the rectangle width
 *                 minus a little padding)
 * @param minScale the smallest scale we'll shrink to before clamping (default
 *                 0.8 — below this, text stops being comfortably readable)
 */
export function fitText(label: Phaser.GameObjects.Text, maxWidth: number, minScale = 0.8): void {
  label.setScale(1);
  const natural = label.width;
  if (maxWidth > 0 && natural > maxWidth) label.setScale(Math.max(minScale, maxWidth / natural));
}
