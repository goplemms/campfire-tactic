// Screenshot the live game in a real (headless) browser.
//
// Our tests cover the pure `core/` logic, and `vite build` proves it compiles —
// but neither renders a single pixel. Phaser draws to a <canvas> via WebGL, so
// the only way to actually *see* a UI change (panel layout, range previews, HP
// bars…) is to boot the app in a browser and capture frames. This script does
// exactly that, end to end:
//
//   1. ensure a Chrome binary  (downloaded + cached on first run)
//   2. start the Vite dev server (in-process)
//   3. drive the demo with the keyboard and screenshot the canvas
//
// Run it with:  npm run shots
//
// Why a *pinned, hand-downloaded* Chrome instead of `npx playwright install`
// or full `puppeteer`? In the web/CI sandbox the usual browser-download CDNs
// are blocked by the network policy, but Google's chrome-for-testing object
// host (storage.googleapis.com) is reachable for direct downloads. So we pin a
// version and fetch the zip straight from there. On a machine where that host
// is blocked (or you'd rather use a browser you already have), set CHROME_BIN
// to any Chrome/Chromium executable and the download is skipped entirely.
//
// Env overrides:
//   CHROME_BIN   path to an existing Chrome/Chromium  (skips the download)
//   CFT_VERSION  chrome-for-testing version to pin     (default below)
//   CFT_HOST     download host                         (default below)
//   SHOTS_OUT    output directory                      (default ./screenshots)
//   SHOTS_PORT   dev-server port                       (default 5188)

import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, access, chmod } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFT_VERSION = process.env.CFT_VERSION ?? "131.0.6778.204";
const CFT_HOST = process.env.CFT_HOST ?? "https://storage.googleapis.com/chrome-for-testing-public";
const OUT_DIR = path.resolve(ROOT, process.env.SHOTS_OUT ?? "screenshots");
const CACHE_DIR = path.resolve(ROOT, ".cache", "chrome");
const PORT = Number(process.env.SHOTS_PORT ?? 5188);

// The demo is driven entirely from the keyboard (Space = advance/primary,
// 1–9 = ability buttons — the same controls a playtester uses), which makes it
// scriptable without guessing canvas pixel coordinates. Each step optionally
// presses some keys, waits for animations/tweens to settle, then captures the
// canvas. Add or reorder entries here to capture different moments.
// `hoverCanvas` parks the cursor over a token (in 800×600 canvas coords) so the
// shot exercises the hover-only nameplate; otherwise the cursor is parked off
// the board so no stray hover state leaks in.
const STEPS = [
  { name: "01-provision", settleMs: 3500 },                       // initial load — Provision screen
  { name: "02-encounter-open", keys: ["Space"], settleMs: 2500 }, // March Out → Encounter 1 board
  { name: "02b-hover", hoverCanvas: { x: 536, y: 309 }, settleMs: 500 }, // hover the isolated Bandit Cutthroat
  { name: "03-advance-1", keys: ["Space"], settleMs: 1800 },      // advance the clock; a player turn
  { name: "04-advance-2", keys: ["Space"], settleMs: 1800 },      // opens the right-hand kit panel
  { name: "05-advance-3", keys: ["Space"], settleMs: 1800 },
  { name: "06-advance-4", keys: ["Space"], settleMs: 1800 },
];

// chrome-for-testing packages per platform: [zip subpath, binary subpath].
const PLATFORMS = {
  "linux-x64": ["linux64", "chrome-linux64/chrome"],
  "darwin-arm64": ["mac-arm64", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
  "darwin-x64": ["mac-x64", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
  "win32-x64": ["win64", "chrome-win64/chrome.exe"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

/** Resolve a usable Chrome binary, downloading + caching it on first run. */
async function ensureChrome() {
  if (process.env.CHROME_BIN) {
    console.log(`• using CHROME_BIN=${process.env.CHROME_BIN}`);
    return process.env.CHROME_BIN;
  }
  const key = `${process.platform}-${process.arch}`;
  const plat = PLATFORMS[key];
  if (!plat) throw new Error(`No pinned Chrome mapping for ${key}; set CHROME_BIN to an existing browser.`);
  const [zipDir, binSub] = plat;
  const versionDir = path.join(CACHE_DIR, CFT_VERSION);
  const binary = path.join(versionDir, binSub);
  if (await exists(binary)) {
    console.log(`• Chrome ${CFT_VERSION} (cached)`);
    return binary;
  }
  const url = `${CFT_HOST}/${CFT_VERSION}/${zipDir}/chrome-${zipDir}.zip`;
  console.log(`• downloading Chrome ${CFT_VERSION} from ${url}`);
  await mkdir(versionDir, { recursive: true });
  const zipPath = path.join(versionDir, "chrome.zip");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} — host may be blocked; set CHROME_BIN instead.`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
  // No zip support in node core; shell out to `unzip` (present on Linux/macOS).
  try {
    execFileSync("unzip", ["-q", "-o", zipPath, "-d", versionDir], { stdio: "inherit" });
  } catch {
    throw new Error("`unzip` is required to extract Chrome but was not found on PATH.");
  }
  await rm(zipPath, { force: true });
  await chmod(binary, 0o755).catch(() => {});
  console.log(`• Chrome ready at ${binary}`);
  return binary;
}

async function main() {
  const chromeBin = await ensureChrome();
  await mkdir(OUT_DIR, { recursive: true });

  // In-process dev server — no port-guessing, clean shutdown. (vite.config.ts
  // also carries the vitest block; vite simply ignores the `test` key.)
  const server = await createServer({
    root: ROOT,
    server: { port: PORT, host: "127.0.0.1" },
    logLevel: "warn",
    clearScreen: false,
  });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${PORT}/`;
  console.log(`• dev server: ${url}`);

  const browser = await puppeteer.launch({
    executablePath: chromeBin,
    headless: true,
    protocolTimeout: 60000,
    args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader", "--window-size=820,680"],
  });

  const captured = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 820, height: 680 });
    const problems = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));

    await page.goto(`${url}#demo`, { waitUntil: "networkidle0", timeout: 30000 });
    const canvas = await page.waitForSelector("canvas", { timeout: 15000 });

    for (const step of STEPS) {
      for (const key of step.keys ?? []) await page.keyboard.press(key);
      // Position the cursor (canvas coords → page coords via the canvas box).
      const box = await canvas.boundingBox();
      const h = step.hoverCanvas;
      if (h) await page.mouse.move(box.x + (h.x * box.width) / 800, box.y + (h.y * box.height) / 600);
      else await page.mouse.move(box.x + 2, box.y + 2); // parked off the board
      await sleep(step.settleMs ?? 1500);
      const file = path.join(OUT_DIR, `${step.name}.png`);
      // Clip to the canvas so every shot is exactly the 800×600 game, free of
      // the surrounding page chrome.
      await canvas.screenshot({ path: file });
      captured.push(file);
      console.log(`  ✓ ${path.relative(ROOT, file)}`);
    }

    // Phaser/runtime errors won't fail the build, so surface them loudly here —
    // ignore the harmless favicon 404 that the demo page always emits.
    const real = problems.filter((p) => !/favicon|404/.test(p));
    if (real.length) console.warn(`\n⚠ ${real.length} browser error(s):\n  ${real.slice(0, 8).join("\n  ")}`);
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`\n${captured.length} screenshot(s) in ${path.relative(ROOT, OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
