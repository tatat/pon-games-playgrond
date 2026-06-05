import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** Bucket id every random stage stores its best under — all seeds share one
 * `random` slot (the best across any random run), per the stage-select plan. */
export const RANDOM_BEST_KEY = 'random'

export interface HimeRunState {
  /** Best score per stage id. Authored stages key by their manifest id; random
   * stages all share `RANDOM_BEST_KEY`. */
  bests: Record<string, number>
  /** Last random seed played, kept so the random entry reopens on it across
   * sessions. Null until a random stage has been played (phase 3 wires the
   * producer; persisting it now keeps all hime-run persistence in one store). */
  lastRandomSeed: number | null
  /** Record `score` for `stageId`, keeping the maximum seen. */
  submitBest(stageId: string, score: number): void
  setLastRandomSeed(seed: number): void
}

export const useHimeRunStore = create<HimeRunState>()(
  persist(
    (set) => ({
      bests: {},
      lastRandomSeed: null,
      submitBest: (stageId, score) =>
        set((s) => ({
          bests: { ...s.bests, [stageId]: Math.max(score, s.bests[stageId] ?? 0) },
        })),
      setLastRandomSeed: (seed) => set({ lastRandomSeed: seed }),
    }),
    {
      name: 'arcade-hime-run',
      // See src/store/user.ts for the full rationale on explicit storage.
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
