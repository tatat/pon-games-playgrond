import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface UserState {
  username: string
  /** Best score per gameId. */
  highScores: Record<string, number>
  setUsername(name: string): void
  setHighScore(gameId: string, score: number): void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      username: 'Guest',
      highScores: {},
      setUsername: (name) => set({ username: name }),
      setHighScore: (gameId, score) =>
        set((s) => ({
          highScores: {
            ...s.highScores,
            [gameId]: Math.max(score, s.highScores[gameId] ?? 0),
          },
        })),
    }),
    {
      name: 'arcade-user',
      // Explicit storage so the middleware attaches in non-browser contexts
      // (Vitest / SSR) where `window` is undefined.
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
