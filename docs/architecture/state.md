# State Management

State is partitioned into three tiers by update frequency, and into three Zustand stores by lifetime.

Related: [Plugin Interface](./plugin-interface.md), [Scene](./scene.md).

## Three tiers by update frequency

| Tier | Examples | Frequency | Mechanism |
|---|---|---|---|
| Scene state | Menu / Playing / Paused / GameOver | Rare | `SceneManager` (an implicit FSM) |
| Game progress | Score, lives, current stage | Event-driven | Zustand store |
| Entity state | Player position, enemy HP, bullet x/y | Every frame | Plain class fields |

**Never put entity state into Zustand.** Reactive stores do not scale to hundreds of objects at 60 fps.

## Three stores by lifetime

| Store | Scope | Persisted? | Examples |
|---|---|---|---|
| `useUserStore` | Cross-game | localStorage | Username, per-game high scores |
| `useSettingsStore` | Cross-game | localStorage | Volume, locale, graphics quality, reduced motion, touch controls mode |
| `useXxxStore` (per game) | Single game | localStorage (save data) | Score, lives, current level, `hasSave` |

Both React (lobby, settings UI) and Pixi (in-game HUD, in-game settings UI) read and write the **same store instances**, so changes propagate automatically in both directions. No portal → game runtime channel is needed for settings or save data.

## `useUserStore`

Player identity and per-game high scores.

```typescript
// src/store/user.ts
interface UserState {
  username: string;
  highScores: Record<string, number>;
  setHighScore: (gameId: string, score: number) => void;
}
```

Persisted under localStorage key `arcade-user`. `setHighScore` keeps the maximum of the new and existing value.

## `useSettingsStore`

Cross-game settings. Audio / rendering systems subscribe to update live.

```typescript
// src/store/settings.ts
interface SettingsState {
  bgmVolume: number;        // 0..1
  sfxVolume: number;        // 0..1
  locale: 'en' | 'ja';
  graphicsQuality: 'low' | 'medium' | 'high';
  reducedMotion: boolean;
  touchControls: 'auto' | 'on' | 'off';   // 'auto' uses matchMedia('(pointer: coarse)')
  // setters per field
}
```

Persisted under `arcade-settings`. Settings that need a fresh `Application` to take effect (resolution scale tied to `graphicsQuality`) cannot apply live — they pick up at the next game start.

## Per-game progress store

Each game defines its own Zustand store in its own module, with `persist` middleware so progress survives reload and the lobby can offer "Continue".

```typescript
// src/games/breakout/store.ts
interface BreakoutState {
  score: number;
  lives: number;
  level: number;
  hasSave: boolean;        // true while a session is in progress
  addScore(n: number): void;
  loseLife(): void;
  reset(): void;           // wipe and mark fresh session
  clearSave(): void;       // wipe save after game-over / explicit "new game"
}
```

Persisted under `arcade-game-<id>`.

### Resume vs reset

`start()` decides at the top:

```typescript
const state = useBreakoutStore.getState();
if (!state.hasSave) state.reset();
// otherwise: build the scene from the persisted state (resume)
```

Game-over logic calls `clearSave()` so the next start begins fresh.

The lobby reads `useXxxStore.getState().hasSave` to decide whether to show a "Continue" button. Both sides share the same store; no runtime channel is involved.

## `GameModule.start` skeleton

```typescript
// src/games/breakout/index.ts
const GAME_ID = 'breakout';

export const breakoutGame: GameModule = {
  async start(app, ctx, signal) {
    const state = useBreakoutStore.getState();
    if (!state.hasSave) state.reset();

    const rng = new Rng(ctx.config.seed);
    const layout = attachLayout(app, signal);
    attachAutoPause(app, signal);
    const sm = new SceneManager(layout, app.ticker, signal, GAME_ID, rng);
    await sm.changeTo(new BreakoutMenuScene());
    signal.throwIfAborted();

    return {
      destroy: () => {
        sm.destroy();
        stopBgm();
        void unloadGameAssets(GAME_ID);   // async; fire and forget
      },
    };
  },
};
```

Game code accesses stores only via `useXxxStore.getState()` / `subscribe(...)` from Pixi-owned classes (HUD, settings panel, audio system). The hook form (`useXxxStore()`) is used exclusively by the React shell.
