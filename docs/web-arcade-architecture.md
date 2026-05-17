# Web Arcade Architecture

A reference architecture for building a multi-game web arcade with TypeScript, where individual games run on PixiJS canvas and the surrounding portal (lobby, navigation, settings) is built with React.

For project-wide dev tooling (build, lint/format, pre-commit, package manager, supply-chain hardening, deployment), see [`toolchain.md`](./toolchain.md). For how built artifacts reach the destination project (ponpon), see [`distribution.md`](./distribution.md).

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Rendering | **PixiJS v8** | TypeScript-first rewrite, WebGPU support, bundled type definitions, official `llms.txt` for AI-assisted development |
| Physics | **Rapier (rapier2d-compat)** | Rust/WASM, deterministic, modern TS bindings |
| Scene management | **Custom `SceneManager`** | Small enough to own (~25 LoC); trade-off: we maintain it instead of tracking a third-party release cycle |
| State management | **Zustand** (or minimal custom store) | Small, framework-agnostic, integrates with both React and Pixi |
| Portal UI | **React 19 + React Router** | Routing, lobby, modals, settings |
| Unit tests | **Vitest** | Vite-integrated, fast, zero-config |
| E2E tests | **Playwright** | Headless browser, screenshot diffing |

## Architectural Principles

1. **Canvas-first for game content.** Game world, entities, HUD, and in-game modals (pause, game-over) all live inside PixiJS. React does not touch the gameplay area.
2. **React for the shell.** Lobby, navigation, profile, leaderboards, and settings are plain React components.
3. **Pixi `Application` lives outside React's lifecycle.** It is created and destroyed in a `useEffect`, never re-rendered.
4. **Logic is decoupled from rendering.** Pure logic classes are testable without Pixi.
5. **Games are plugins.** Each game implements a common `GameModule` interface and is dynamically imported.

## Scope

Concerns the architecture **does** address are covered in the docs below. The following are explicitly **deferred** in this playground; they belong to the destination project (or a follow-up iteration here).

| Area | Status | Note |
|---|---|---|
| Canvas accessibility | **Out** | Pixi canvases are opaque to assistive tech. A shadow ARIA tree mirroring the canvas would be a real project on its own. Lobby and settings React UI **should** still be keyboard-navigable. |
| Mobile touch controls | **In** | All pointer input flows through Pixi's `PointerEvent` system. `InputManager.press` / `release` for virtual buttons. Helpers in `engine/input/touch-pad.ts` (D-pad / action button) and `engine/input/gesture.ts` (swipe). Display toggled by `useSettingsStore.touchControls` (`auto` / `on` / `off`). See [`input.md`](./architecture/input.md). |
| Mobile viewport / safe-area | **In** | `viewport-fit=cover` meta in `index.html`; React shell uses `env(safe-area-inset-*)`. The canvas spans the full viewport; the game world is projected into a logical 1280×720 inside it, with the letterbox area available for on-screen touch UI. See [`responsive.md`](./architecture/responsive.md). |
| Orientation handling | **Out** | No "rotate device" overlay. Portrait users on a landscape game get a small letterboxed view; that is accepted for the playground. |
| Internationalization | **Scaffolding only** | `useSettingsStore.locale` exists; no translation library, no string catalog. Picking i18next / react-intl / FormatJS waits until there are real strings to translate. |
| Telemetry / error tracking | **Out** | No backend in the playground; Sentry / similar belongs to the destination project. Catch-and-log to `console.error` is the placeholder. |
| Cross-game shared assets | **Out** | Per-scene `preload` covers everything for now. Revisit only if a real shared bundle (UI font, common SFX) becomes worth the indirection. |
| Build-size budget / `size-limit` CI gate | **Out** | Rough envelope (~500 KB gzip initial, dynamic-imported per-game chunks) is acceptable for a playground on GH Pages. Concrete numbers and CI enforcement belong to the destination project. |
| Server-side score validation | **Out** | GH Pages is static-only. Cheating is the default; per-game stores live entirely in `localStorage`. |
| Networking / multiplayer | **Out** | No backend in scope. |

If a deferred concern becomes load-bearing for a real game, lift it back into scope explicitly — don't smuggle it in.

## Documentation Map

Detailed designs live under [`architecture/`](./architecture/):

| Topic | Doc |
|---|---|
| Plugin contract, React ↔ Pixi boundary, cancellation, saving | [`plugin-interface.md`](./architecture/plugin-interface.md) |
| Scene base class, `SceneManager`, auto-pause, layer structure, HUD | [`scene.md`](./architecture/scene.md) |
| Three Zustand stores (user / settings / per-game) and save data | [`state.md`](./architecture/state.md) |
| Rapier integration, fixed timestep, spiral-of-death guard | [`physics.md`](./architecture/physics.md) |
| Per-game asset loading and unloading, dynamic alias names | [`assets.md`](./architecture/assets.md) |
| `@pixi/sound` integration, BGM (scene-driven) and SFX (fire-and-forget) | [`audio.md`](./architecture/audio.md) |
| `InputManager`, action bindings, scene integration | [`input.md`](./architecture/input.md) |
| Seeded RNG (`Rng` / Mulberry32), `?seed=N` override | [`rng.md`](./architecture/rng.md) |
| Letterbox-scale strategy, UI placement rules | [`responsive.md`](./architecture/responsive.md) |
| Vitest / Playwright split, E2E hooks, coverage targets | [`testing.md`](./architecture/testing.md) |
| Build artifacts and ponpon consumption (Pages, `release.json`, `mount`) | [`distribution.md`](./distribution.md) |

## Directory Layout

```
arcade/
├── public/
│   ├── shared/                 # Common fonts, UI sounds
│   └── games/                  # Per-game assets
├── src/
│   ├── App.tsx                 # Router root
│   ├── main.tsx                # React entry
│   ├── pages/
│   │   ├── Lobby.tsx
│   │   └── GamePage.tsx
│   ├── components/
│   │   ├── GameMount.tsx       # ★ The React ↔ Pixi boundary
│   │   ├── GameCard.tsx
│   │   └── Modal.tsx
│   ├── games/
│   │   ├── types.ts            # GameModule interface
│   │   ├── registry.ts         # Dynamic-import registry
│   │   ├── breakout/
│   │   │   ├── index.ts        # GameModule implementation
│   │   │   ├── scene.ts
│   │   │   ├── store.ts        # Per-game Zustand store (score, lives, ...)
│   │   │   ├── hud.ts
│   │   │   ├── entities/
│   │   │   └── logic/          # Pure, testable logic
│   │   └── snake/
│   ├── store/
│   │   ├── user.ts             # Cross-game persistent state (useUserStore)
│   │   └── settings.ts         # Cross-game settings (useSettingsStore)
│   └── engine/                 # Shared engine code
│       ├── constants.ts        # Logical resolution, FIXED_DT, etc.
│       ├── layout.ts           # attachLayout — viewport-fill + gameContainer projection
│       ├── scene-manager.ts
│       ├── scene.ts            # Scene base + preload / bindInput helpers
│       ├── auto-pause.ts       # visibilitychange handler
│       ├── assets/
│       │   └── index.ts        # loadAssets / unloadGameAssets
│       ├── audio/
│       │   └── index.ts        # initAudio / playBgm / playSfx / stopBgm
│       ├── input/
│       │   ├── index.ts        # InputManager / InputBindings
│       │   ├── touch-pad.ts    # createDirectionalPad / createActionButton / padEnabled
│       │   └── gesture.ts      # attachSwipe and friends
│       ├── rng.ts              # Seeded RNG (Mulberry32 today; swappable)
│       └── physics/
│           └── rapier-wrapper.ts
├── e2e/                        # Playwright tests
└── vite.config.ts
```

## AI-Assisted Development Notes

PixiJS v8 publishes an official `llms.txt` reflecting current TypeScript definitions and docs. Pointing AI agents at it significantly reduces hallucinated v7 APIs when using Claude, Cursor, or similar tools.

Recommended primer for AI agents:

> Use the PixiJS v8 API. Refer to `https://pixijs.com/llms.txt` when uncertain.
> Do not use deprecated v7 APIs (old `Loader`, synchronous `Application` constructor, etc.).

## Common Pitfalls

1. **Forgetting `await app.init()`** — PixiJS v8 requires async initialization.
2. **Canvas parent has zero height** — `resizeTo: container` produces a blank canvas if the container is hidden or unsized.
3. **Audio blocked on iOS Safari** — Resume `AudioContext` on the first `pointerdown` event (handled by `initAudio`; see [`audio.md`](./architecture/audio.md)).
4. **HMR creates duplicate Pixi apps** — Dispose in `import.meta.hot.dispose()` during development.
5. **Subscriptions leak across scenes** — Always store unsubscribe callbacks and invoke them in `destroy()` / `onExit()`.
6. **Mixing entity state into Zustand** — Causes severe frame-rate degradation; keep per-frame mutables in class fields. See [`state.md`](./architecture/state.md).
7. **Spiral of death in the physics loop** — After a long pause (tab unfocused, sleep), `accumulator` can hold seconds of backlog. The `MAX_STEPS_PER_FRAME` cap plus dropping leftover accumulator is the standard guard. See [`physics.md`](./architecture/physics.md).
8. **Calling `RAPIER.init()` per scene** — It is idempotent but allocates. Call it once at engine startup before any scene runs.
9. **Forgetting to forward `AbortSignal` in setup** — A setup function that takes `signal` but never threads it into its own `await`s cannot be cancelled. Either pass it to nested async APIs or call `signal.throwIfAborted()` at boundaries.
10. **Cleanup that respects `AbortSignal`** — `onExit` / `destroy()` are deliberately not abortable. If you find yourself wanting to skip cleanup, you have probably moved setup work into the wrong phase.
11. **`Math.random()` in simulation code** — Defeats seeding. Use `this.rng.next()` / `intRange` / `pick` / `chance` instead. Cosmetic-only randomness that does not affect score / physics / AI is the only legitimate exception. See [`rng.md`](./architecture/rng.md).
12. **Stale assets in `public/`** — Vite does not content-hash files under `public/`, so `public/games/breakout/sprites/ball.png` keeps its name across builds. Browsers and the Pixi `Assets` cache serve the old version after you replace the file. Bust manually with a version suffix (`ball.v2.png`) or query string (`?v=2`) when you ship a changed asset; otherwise import the file from `src/` so Vite hashes it.
13. **`touchstart` falls through to the browser** — On mobile, touching the canvas scrolls the page and pinch-zooms by default. Set `touch-action: none` on the canvas element and add touch listeners with `{ passive: false }` so `preventDefault()` actually fires. Without this, the game is unplayable on mobile.
14. **HMR creates duplicate `AudioContext`** — Each Vite HMR reload of the audio module instantiates a fresh `AudioContext` without closing the previous one. Chrome caps ~6 live contexts per page, so audio stops after a few reloads. Dispose explicitly:
    ```typescript
    if (import.meta.hot) {
      import.meta.hot.dispose(() => sound.context.audioContext.close());
    }
    ```

## Reference Implementation Order

A pragmatic build order for the first iteration. Project setup (scaffold, `.npmrc`, Biome, husky) is covered by [`toolchain.md`](./toolchain.md#setup-order); the steps below pick up from there.

1. Implement `Scene` (with `preload` / `bindInput` helpers) and `SceneManager` in `engine/`.
2. Implement the engine subsystems: `engine/assets`, `engine/audio`, `engine/input`, `engine/rng`. Skeletons are sufficient — flesh out as scenes need them.
3. Define `engine/constants.ts` (`DESIGN_W` / `DESIGN_H` / `FIXED_DT` / `MAX_STEPS_PER_FRAME`).
4. Engine bootstrap in `main.tsx`: `await RAPIER.init()`, then `initAudio()`, before the first React render.
5. Build the first game (e.g. Breakout) directly in `src/`, without the plugin abstraction.
6. Add the per-game Zustand store (with `persist`) and wire the HUD to it.
7. Wrap the game into the `GameModule` interface; ensure `destroy` calls `unloadGameAssets` and `stopBgm`.
8. Add `useSettingsStore` and a Pixi settings UI inside the game; verify volume changes propagate live.
9. Add React Router and a lobby with a second game.
10. Add Vitest tests for logic and stores.
11. Add Playwright smoke tests for each game.
