import type { GameModule } from './types'

/** Dynamic imports so each game lands in its own Vite chunk. Add more games
 * here as they are ported. */
export const games = {
  'sticker-drift': () => import('./sticker-drift').then((m) => m.stickerDriftGame),
} satisfies Record<string, () => Promise<GameModule>>

export type GameId = keyof typeof games
