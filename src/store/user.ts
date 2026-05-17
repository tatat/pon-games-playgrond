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
      // Always pass explicit storage. Zustand v5's persist defaults to
      // `createJSONStorage(() => window.localStorage)`, and in non-browser
      // contexts (Vitest's node env, SSR) that throws — at which point the
      // middleware *silently* drops the entire `persist` namespace from the
      // store. Using `globalThis.localStorage` lets the manual shim in
      // src/test/setup.ts satisfy it.
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
