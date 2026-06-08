/**
 * Standard font sizes for the game's text, as Phaser-ready px strings.
 *
 * Phaser renders each `Text` to a canvas texture, baking `fontSize` into a CSS
 * font string — so these are plain `px` (the only unit that interacts sanely
 * with the Scale Manager; `em`/`rem` resolve against the DOM/root, not the
 * scene, and confuse Phaser's own text metrics). Reference these instead of
 * scattering literals so the whole UI tunes from one ladder.
 */
export const FONT = {
  /** Token initials and tiny in-world glyphs. */
  micro: "9px",
  /** Unit nameplates, HP readouts, status glyphs. */
  nameplate: "10px",
  /** Dense list rows (turn order) and compact labels. */
  caption: "11px",
  /** Secondary labels and sub-headers. */
  label: "12px",
  /** Default body text — the common case. */
  body: "13px",
  /** Emphasized map markers / minor headings. */
  heading: "16px",
  /** Per-scene titles. */
  title: "18px",
  /** Overlay and end-screen titles. */
  display: "22px",
} as const;
