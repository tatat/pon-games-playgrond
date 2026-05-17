# Asset Loading

PixiJS 8's `Assets` API is used directly; no extra library. Each scene declares the aliases it needs in `onEnter` and loads them via `Scene.preload(...)`. Pixi's cache deduplicates repeat aliases, so requesting the same alias from multiple scenes only fetches it once.

Loaded aliases are tracked per `gameId` so the engine can unload a whole game's resources at `GameModule.destroy`.

Related: [Scene](./scene.md), [Plugin Interface](./plugin-interface.md), [Audio](./audio.md).

## API

```typescript
// engine/assets/index.ts
export interface AssetEntry {
  alias: string;
  src: string;
  data?: Record<string, unknown>;   // e.g. { singleInstance: true } for sound
}

export function loadAssets(
  gameId: string,
  entries: AssetEntry[],
  signal: AbortSignal,
): Promise<void>;

export function unloadGameAssets(gameId: string): void;
```

## Contract

- `loadAssets` calls `Assets.add(...)` then `Assets.load(...)`. Pixi does not currently expose an abort-capable loader, so the load itself runs to completion; the function checks `signal.throwIfAborted()` only at boundaries.
- Aliases are tracked in `loadedByGame[gameId]` inside a `finally` block, so an aborted call still records what it brought into the cache. `unloadGameAssets` can then clean up regardless of how the load ended.
- `GameModule.destroy` calls `unloadGameAssets(gameId)`. The lifetime of every alias loaded for a game ends with the game module.
- Asset paths are relative to Vite's `BASE_URL`, so the same manifest works on the GH Pages subpath without changes. Asset files live under `public/games/<gameId>/`.

## Dynamic asset names

`preload` is called from `onEnter`, so the entry list can be built with normal JS expressions — useful for level-indexed levels, character skins, procedurally chosen variants:

```typescript
await this.preload([
  { alias: `level-${this.level}`, src: `games/breakout/levels/${this.level}.json` },
], signal);
```
