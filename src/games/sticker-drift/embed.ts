import { type EmbedHandle, type EmbedMountOptions, mountGame } from '../embed-helpers'
import { stickerDriftGame } from './index'

export type { EmbedHandle, EmbedMountOptions }

/** Library-mode entry point for sticker-drift. Mirrors the
 * breakout-clone embed; ponpon imports this from
 * `<playground-pages>/embed/sticker-drift/index.js`. */
export async function mount(
  container: HTMLElement,
  options: EmbedMountOptions = {},
): Promise<EmbedHandle> {
  const assetBase = new URL('../../', import.meta.url).href
  return mountGame(stickerDriftGame, container, options, assetBase)
}
