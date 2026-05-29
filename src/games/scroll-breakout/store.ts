import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface ScrollBreakoutSettings {
  /** When true, the obstacle course is generated from a fixed seed, so every
   * run (and restart) faces the identical layout — fair for score comparison.
   * When false, each run is freshly random. */
  fixedCourse: boolean
  setFixedCourse(b: boolean): void
}

export const useScrollBreakoutStore = create<ScrollBreakoutSettings>()(
  persist(
    (set) => ({
      fixedCourse: false,
      setFixedCourse: (b) => set({ fixedCourse: b }),
    }),
    {
      name: 'arcade-scroll-breakout',
      // See src/store/user.ts for the full rationale on explicit storage.
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
