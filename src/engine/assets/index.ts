import { Assets, type UnresolvedAsset } from 'pixi.js'

export interface AssetEntry {
  alias: string
  src: string
  data?: Record<string, unknown>
}

const loadedByGame = new Map<string, Set<string>>()

/** Vite's configured base path, e.g. `/pon-games-playgrond/` on GH Pages.
 * Defaults to whatever the build embeds; embed.ts entries override it at
 * mount time so the lib bundle resolves assets relative to its own URL
 * regardless of where the host page lives. */
let baseUrl = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')

/** Override the base URL used by `resolveAssetUrl`. Embed (library-mode) entries
 * call this in `mount()` with an `import.meta.url`-derived absolute URL so
 * asset paths produced by games resolve against the lib bundle's origin,
 * not the host page's. SPA code doesn't call this — it relies on the
 * default which Vite baked in at build time.
 *
 * **Module-scoped**: only one base URL is active per module instance.
 * Two simultaneous mounts inside the same host (e.g. two iframes that
 * happen to share a module map, two games on one page from the same
 * bundle) would race — the second mount's base wins. In practice ponpon
 * mounts one game per page, so this isn't a real concern; thread the
 * base into the resolver if that changes. */
export function setAssetBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, '')
}

/** Resolve a relative asset `src` against the current base, so paths like
 * `games/breakout/sprites/ball.png` work no matter what SPA route the user is
 * on. Absolute URLs / data / blob URIs / leading `/` paths are left alone.
 *
 * Exported so non-Pixi loaders (e.g. `@pixi/sound`) can route through the
 * same base-resolution logic instead of reading `import.meta.env.BASE_URL`
 * themselves — the embed bundle wouldn't pick up the override otherwise. */
export function resolveAssetUrl(src: string): string {
  if (/^([a-z]+:|\/\/|\/)/i.test(src)) return src
  return `${baseUrl}/${src.replace(/^\.?\//, '')}`
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
    // Pixi's resolver warns ("already has key: <alias> overwriting") when an
    // alias is re-added, which happens whenever a scene preloads the same
    // assets across a restart. Skip aliases already known to the resolver.
    if (Assets.resolver.hasKey(e.alias)) continue
    Assets.add({ ...e, src: resolveAssetUrl(e.src) } as UnresolvedAsset)
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
