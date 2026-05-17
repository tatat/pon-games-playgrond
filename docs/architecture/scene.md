# Scene

The `Scene` base class and its manager form the spine of every game. Each scene owns its visuals, its input bindings, and its asset declarations; `SceneManager` orchestrates lifecycle, cancellation, and game-scope injection.

Related: [Plugin Interface](./plugin-interface.md), [State Management](./state.md), [Input](./input.md), [Assets](./assets.md), [Audio](./audio.md), [RNG](./rng.md), [Responsive](./responsive.md).

## `Scene`

```typescript
// engine/scene.ts
export abstract class Scene extends Container {
  protected input!: InputManager;   // injected by bindInput()
  protected gameId!: string;        // injected by SceneManager.attach
  protected rng!: Rng;              // injected by SceneManager.attach
  protected layout!: GameLayout;    // injected by SceneManager.attach

  // Imperative helpers — call from onEnter as needed.
  protected preload(entries: AssetEntry[], signal: AbortSignal): Promise<void>;
  protected bindInput(bindings: InputBindings, signal: AbortSignal): void;

  abstract onEnter(signal: AbortSignal): void | Promise<void>;
  abstract onUpdate(ticker: Ticker): void;
  onExit(): void | Promise<void> {}   // cleanup — no signal

  /** @internal — called by SceneManager */
  attach(gameId: string, rng: Rng, layout: GameLayout): void;
}
```

Scenes declare what they need by calling helpers inside `onEnter`. There is no declarative manifest field on the class; everything is imperative so dynamic values (e.g. `level-${this.level}`) work naturally.

## `SceneManager`

```typescript
// engine/scene-manager.ts
export class SceneManager {
  constructor(
    layout: GameLayout,      // scenes mount into layout.gameContainer
    ticker: Ticker,          // drives onUpdate
    signal: AbortSignal,     // aborts everything on game unmount
    gameId: string,
    rng: Rng,
  );

  changeTo(next: Scene): Promise<void>;
  destroy(): void;
}
```

### Contract

- **Mount target.** `SceneManager` adds the active scene to `layout.gameContainer` so scenes draw inside the projected 1280×720 area (see [Responsive](./responsive.md)). The same `layout` is passed to scenes via `attach` for access to `uiLayer` and layout metrics.
- **Serialization.** Consecutive `changeTo` calls run in order via a chained promise. No two scenes are on the stage simultaneously.
- **Per-scene signal.** Each `changeTo` derives a fresh `AbortSignal` (linked to the manager's signal) and passes it to `next.onEnter`. When the scene exits, that signal aborts — so listeners and per-scene work attached to it are cleaned up automatically. Game-scope subscriptions (the one passed in the constructor) survive across scene changes.
- **Exit before destroy.** `destroy()` calls the current scene's `onExit()` to completion, then detaches the ticker and removes the scene from the stage. Required for physics worlds, audio handles, store subscriptions, etc.
- **Abort = destroy.** When the constructor signal aborts, the manager calls `destroy()` once. Subsequent `changeTo` calls become no-ops that immediately destroy the passed-in scene.

## Auto-pause on tab visibility

Pausing on `visibilitychange` is an environment concern. `engine/auto-pause.ts` exports a helper that stops `app.ticker` while the tab is hidden and restarts it on return:

```typescript
export function attachAutoPause(app: Application, signal: AbortSignal): void;
```

Called once during game `start()`. The signal scope means the listener releases on game unmount; no per-scene wiring is needed. Stopping the ticker halts both rendering and `onUpdate`-driven physics, so the accumulator does not grow while hidden.

## In-game layer structure

Every game scene follows the same three-layer composition.

```
GameScene (Container)
├── world (Container)          ← camera-affected
│   ├── background
│   ├── tilemap
│   ├── entities
│   └── effects
├── hud (Container)            ← screen-fixed
│   ├── scoreText
│   ├── livesIcons
│   ├── timerText
│   └── floatingTexts
└── overlay (Container)        ← modal layer
    ├── pauseOverlay
    └── gameOverOverlay
```

The camera transform applies only to `world`. `hud` and `overlay` stay anchored to screen coordinates inside the logical 1280×720 viewport.

## HUD inside canvas

HUD is rendered in Pixi rather than React. It scales with the game viewport and avoids responsive-layout friction.

- Subscribe to the per-game store in the HUD's constructor; store the unsubscribe and call it in the HUD's own teardown.
- Use **BitmapText** for frequently updated text (scores, timers) to avoid texture regeneration.
- Use `@pixi/ui` (`FancyButton`, `List`, `Slider`) for menus and pause overlays.
- Keep HUD elements at least 40 px from the logical edges (see [Responsive § HUD margin rule](./responsive.md#hud-margin-rule)).
