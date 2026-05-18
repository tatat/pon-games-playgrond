import { type EmbedHandle, type EmbedMountOptions, mountGame } from '../embed-helpers'
import { breakoutCloneGame } from './index'

export type { EmbedHandle, EmbedMountOptions }

/** Library-mode entry point for breakout-clone. Ponpon imports this
 * module from `<playground-pages>/embed/breakout-clone/index.js` and
 * calls `mount(container)`; the returned handle's `destroy()` tears
 * everything down. */
export async function mount(
  container: HTMLElement,
  options: EmbedMountOptions = {},
): Promise<EmbedHandle> {
  // The bundle is self-contained: `build-embed.mjs` copies
  // `public/games/breakout-clone/` into `<bundle>/assets/games/breakout-clone/`,
  // so we resolve asset URLs against `<bundle>/assets/`. The bundle
  // can be served from anywhere — no dependency on the playground's
  // SPA being deployed alongside it.
  const assetBase = new URL('./assets/', import.meta.url).href
  return mountGame(breakoutCloneGame, container, options, assetBase)
}
