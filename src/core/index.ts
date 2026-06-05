// Barrel for the pure-logic core. The render layer (`game/`) imports from here;
// it must never reach into Phaser or the DOM. Everything below is plain data +
// functions, headlessly testable.
export * from "./iso";
