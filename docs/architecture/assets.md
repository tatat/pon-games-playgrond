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

export function unloadGameAssets(gameId: string): Promise<void>;
```

## Contract

- Each entry's `src` is resolved against Vite's `import.meta.env.BASE_URL` before being handed to `Assets.add`. A relative path like `games/breakout/sprites/ball.png` becomes `/<base>/games/breakout/sprites/ball.png` regardless of the current SPA route. Absolute URLs (`http(s)://…`, `data:`, `blob:`, leading `/`) are left alone.
- `loadAssets` calls `Assets.add(...)` then `Assets.load(...)`. Pixi does not currently expose an abort-capable loader, so the load itself runs to completion; the function checks `signal.throwIfAborted()` only at boundaries.
- Aliases are tracked in `loadedByGame[gameId]` inside a `finally` block, so an aborted call still records what it brought into the cache. `unloadGameAssets` can then clean up regardless of how the load ended.
- `unloadGameAssets` is **async**: Pixi v8's `Assets.unload` returns a promise. The function clears its tracking before awaiting the bulk unload so a subsequent reload races correctly. `GameModule.destroy` typically fires it without awaiting (`void unloadGameAssets(GAME_ID)`); callers that need to know it finished can `await` instead.
- Asset files live under `public/games/<gameId>/`.

## `@2x` resolution auto-detection

Pixi v8's `Assets` parses filenames for a `@<n>x` suffix and sets `texture.source.resolution = n` automatically. As a result:

- `texture.width` / `texture.height` return the **logical** size (physical pixels ÷ resolution), not the file's pixel dimensions.
- `sprite.scale.set(1)` against an `@2x` asset renders at half the file's pixel size — which is usually what you want for crisp HiDPI display.

This matters when porting from Phaser (which does not auto-detect `@2x`): a Phaser source that does `setScale(0.5)` against `foo@2x.png` becomes `setScale(1.0)` in Pixi, and any formula that assumed "image is 2× target size" loses its ×2 factor. Sanity-check by spawning two known-size sprites side-by-side and comparing to the original build.

## Dynamic asset names

`preload` is called from `onEnter`, so the entry list can be built with normal JS expressions — useful for level-indexed levels, character skins, procedurally chosen variants:

```typescript
await this.preload([
  { alias: `level-${this.level}`, src: `games/breakout/levels/${this.level}.json` },
], signal);
```
