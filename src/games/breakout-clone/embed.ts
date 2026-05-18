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
  // Compute the playground's root URL from this bundle's own URL —
  // we're at `<root>/embed/breakout-clone/index.js`, so `../../`
  // points back at `<root>/`. Games then resolve their public assets
  // (`games/breakout-clone/...`) against that base.
  const assetBase = new URL('../../', import.meta.url).href
  return mountGame(breakoutCloneGame, container, options, assetBase)
}
