# Testing Strategy

Tests are concentrated where they pay off. UI polish and look-and-feel are left to manual review.

Related: [State Management](./state.md), [RNG](./rng.md).

| Area | Tested | Tool |
|---|---|---|
| Pure logic (`logic/` folder) | Heavily | Vitest |
| Stores | Heavily | Vitest |
| Collision, scoring formulas | Heavily | Vitest |
| Physics behavior (Rapier) | Selectively | Vitest |
| Entity rendering | Lightly | (rely on E2E) |
| Scenes & input flow | Critical paths only | Playwright |
| Animations, transitions | Not tested | Manual review |
| Visual regression | Critical screens only | Playwright screenshots |

## Decoupling logic for testability

Pure logic classes (no Pixi imports) belong in each game's `logic/` folder. Entity classes that extend `Container` keep a reference to a logic class and forward state changes to it. This split lets the bulk of game-rule unit tests run without spinning up Pixi.

## E2E Test Hooks

In test builds (`import.meta.env.MODE === 'test'`), each game installs a `window.__testHook` inside `start()` so the hook closes over that game's per-game store. The hook is replaced on every game switch.

```typescript
interface TestHook {
  /** Read current per-game store state. */
  getScore(): number;

  /** Drive the production game-over path:
   *  set the per-game store to game-over, call ctx.onGameOver(result),
   *  transition to the game-over scene. Equivalent to a real loss. */
  forceGameOver(): void;

  /** Stop / restart app.ticker for stable screenshots. */
  pauseTicker(): void;
  resumeTicker(): void;
}
```

The seed is set via the `?seed=N` URL query parameter rather than the hook (see [RNG § Seed source](./rng.md#seed-source)).

## Playwright canvas screenshots without flake

Canvas screenshots in Playwright are flaky for two reasons that have nothing to do with the game's correctness:

1. **Async fonts** — `Text` uses HTML/CSS-loaded fonts. Screenshots taken before fonts resolve render fallback glyphs.
2. **Ticker keeps running** — animations, physics, particle effects, BGM-driven shake. Two consecutive screenshots taken 16 ms apart can differ.

Standard preamble before `page.screenshot()`:

```typescript
await page.goto('/game/breakout?seed=42');
await page.waitForFunction(() => (window as any).__testHook?.getScore !== undefined);
await page.evaluate(() => (window as any).__testHook.forceGameOver());
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => (window as any).__testHook.pauseTicker());
await expect(page).toHaveScreenshot('breakout-game-over.png');
```

Two reinforcing notes:

- **Prefer `BitmapText` for HUD-heavy text.** Bitmap fonts are loaded via `preload`, so `await this.preload(...)` already guarantees readiness — `document.fonts.ready` only matters for regular `Text`.
- **Pause the ticker, not just the physics accumulator.** `app.ticker.stop()` halts `onUpdate` for every active scene, including HUD subscriptions and any tween/particle systems.

## Vitest with Rapier

Vitest runs tests in Node (optionally jsdom / happy-dom), not in a browser. `@dimforge/rapier2d-compat` bundles its WASM as inline base64, so no `fetch` / streaming setup is needed — but each test file that touches Rapier must initialize the module before use:

```typescript
import RAPIER from '@dimforge/rapier2d-compat';
beforeAll(async () => { await RAPIER.init(); });
```

Forgetting `RAPIER.init()` yields confusing errors like `RAPIER.World is not a constructor` because the WASM exports have not been bound yet.

Recommended Vitest config: keep physics tests on the `node` environment for stability — jsdom occasionally interacts badly with WASM init. A single test file can override with a `// @vitest-environment node` header comment.

The dev server side requires excluding the package from Vite's dependency prebundling so WASM init is not broken:

```typescript
// vite.config.ts
export default defineConfig({
  optimizeDeps: { exclude: ['@dimforge/rapier2d-compat'] },
});
```

## Coverage Targets

| Folder | Target |
|---|---|
| `logic/` | 80%+ |
| `store/` | 90%+ |
| `entities/` | ~30% (keep thin) |
| `scenes/` | not measured (covered by E2E) |
