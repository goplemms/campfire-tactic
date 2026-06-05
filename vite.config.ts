import { defineConfig } from "vitest/config";

// Single config for both the dev/build (Vite) and the headless core tests (Vitest).
// The `core/` layer is pure logic, so its tests run in a plain node environment with
// no DOM and no Phaser — that separation is what keeps the core portable and fast to test.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
