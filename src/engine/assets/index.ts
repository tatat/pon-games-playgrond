import { Assets, type UnresolvedAsset } from 'pixi.js'

export interface AssetEntry {
  alias: string
  src: string
  data?: Record<string, unknown>
}

const loadedByGame = new Map<string, Set<string>>()

/** Vite's configured base path, e.g. `/pon-games-playgrond/` on GH Pages. */
const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')

/** Resolve a relative asset `src` against Vite's `base`, so paths like
 * `games/breakout/sprites/ball.png` work no matter what SPA route the user is
 * on. Absolute URLs / data / blob URIs / leading `/` paths are left alone. */
function resolveSrc(src: string): string {
  if (/^([a-z]+:|\/\/|\/)/i.test(src)) return src
  return `${BASE}/${src.replace(/^\.?\//, '')}`
}

/** Loads the given assets and records them under `gameId` so a later
 * `unloadGameAssets(gameId)` can release everything. PixiJS's loader is not
 * abortable, so cancellation can only happen at await boundaries; aliases are
 * still tracked in a `finally` so an aborted load can be cleaned up later. */
export async function loadAssets(
  gameId: string,
  entries: AssetEntry[],
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  for (const e of entries) {
    Assets.add({ ...e, src: resolveSrc(e.src) } as UnresolvedAsset)
  }
  try {
    await Assets.load(entries.map((e) => e.alias))
  } finally {
    const set = loadedByGame.get(gameId) ?? new Set<string>()
    for (const e of entries) set.add(e.alias)
    loadedByGame.set(gameId, set)
  }
  signal.throwIfAborted()
}

/** Unloads every alias loaded for `gameId`. Pixi v8's `Assets.unload` is async;
 * this function awaits the bulk unload before clearing tracking so concurrent
 * reload races resolve in a defined order. Safe to call multiple times. */
export async function unloadGameAssets(gameId: string): Promise<void> {
  const set = loadedByGame.get(gameId)
  if (!set) return
  loadedByGame.delete(gameId)
  await Assets.unload([...set])
}
