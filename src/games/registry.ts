import type { GameModule } from './types'

/** Dynamic imports so each game lands in its own Vite chunk. Add more games
 * here as they are ported. */
export const games = {
  'sticker-drift': () => import('./sticker-drift').then((m) => m.stickerDriftGame),
  'breakout-clone': () => import('./breakout-clone').then((m) => m.breakoutCloneGame),
  'rally-runner': () => import('./rally-runner').then((m) => m.rallyRunnerGame),
  'pattern-gallery': () => import('./pattern-gallery').then((m) => m.patternGalleryGame),
} satisfies Record<string, () => Promise<GameModule>>

export type GameId = keyof typeof games
