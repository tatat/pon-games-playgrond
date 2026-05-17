# Plugin Interface

Each game implements a common contract so the portal can host any of them uniformly. The interface is intentionally narrow — portal → game runtime communication is **not** part of the channel.

Related: [Scene](./scene.md), [State Management](./state.md), [Responsive](./responsive.md).

## `GameModule` / `GameContext` / `GameHandle`

```typescript
// games/types.ts
export interface GameModule {
  start(
    app: Application,
    ctx: GameContext,
    signal: AbortSignal,   // aborted when the portal unmounts mid-setup
  ): Promise<GameHandle>;
}

export interface GameContext {
  // Session-only values decided by the portal at start time.
  // Persistent settings live in useSettingsStore (see state.md).
  config: { seed: number };

  // game → portal notifications (the only direction that flows through ctx)
  onScoreChange(score: number): void;
  onGameOver(result: GameResult): void;
}

export interface GameResult {
  score: number;
  cleared?: boolean;     // optional — only meaningful for stage-based games
}

export interface GameHandle {
  destroy(): void;       // cleanup — runs to completion, no signal
}
```

## Cancellation convention

**Setup-phase async methods accept an `AbortSignal`. Cleanup methods do not.** Aborting cleanup would risk leaking resources, so `destroy()`, `onExit()`, and other teardown paths always run to completion.

| Method | Phase | Takes `signal`? |
|---|---|---|
| `GameModule.start` | setup | ✅ |
| `Scene.onEnter` | setup | ✅ |
| `Scene.onUpdate` | per-frame | — |
| `Scene.onExit` | cleanup | ❌ |
| `SceneManager.destroy` | cleanup | ❌ |
| `GameHandle.destroy` | cleanup | ❌ |

Setup code should call `signal.throwIfAborted()` at each `await` boundary. The portal catches `AbortError` and treats it as a normal cancellation, not a failure.

## Why no `pause` / `resume` on `GameHandle`

Pause is triggered by **environment events** (tab becoming hidden), not by React UI. Principle 1 means in-game UI is Pixi only, so there is no React button that needs to call `pause()`. `engine/auto-pause.ts` listens to `visibilitychange` inside the game's scope; the portal does not forward this event.

`destroy()` remains because the **end of the game's lifetime** is genuinely owned by the portal (`GameMount` decides when the game is unmounted on route change / game switch).

## Saving progress

In-progress state lives in each game's per-game Zustand store with `persist` middleware — see [State Management § Per-game progress state](./state.md#per-game-progress-state-one-store-per-game). Neither `destroy()` nor `beforeunload` is the right hook (the former misses tab-close, the latter is unreliable on iOS Safari); continuous persistence by the store is.

## Registry and dynamic imports

```typescript
// games/registry.ts
export const games = {
  breakout: () => import('./breakout').then((m) => m.breakoutGame),
  snake:    () => import('./snake').then((m) => m.snakeGame),
} satisfies Record<string, () => Promise<GameModule>>;

export type GameId = keyof typeof games;
```

Dynamic imports cause Vite to split each game into a separate bundle, keeping the initial portal load light.

## React ↔ Pixi Boundary

A single component, `GameMount`, manages the Pixi `Application` lifecycle. Contract:

- On effect mount: create `Application`, init with `resizeTo: window`, append the canvas to the wrapper `div`, resolve the seed (URL `?seed=N` or `Date.now()`), `await games[gameId]()`, then `await module.start(app, ctx, signal)`.
- An `AbortController` scopes the whole setup chain. Game-switch / unmount aborts it before `handle.destroy()` and `app.destroy()`.
- The wrapper `div` fills the viewport (`width: 100vw; height: 100vh`). No padding — safe-area is applied to React shell routes only (see [Responsive § Safe-area handling](./responsive.md#safe-area-handling)).
- `AbortError` raised by aborted setup is swallowed at the top level so cancellation does not surface as an unhandled rejection.
- `handle.destroy()` and `app.destroy()` always run in the effect's cleanup function; they are not abortable, by design.

The seed is set via `?seed=N` URL query parameter (see [Deterministic RNG § Seed source](./rng.md#seed-source)).
