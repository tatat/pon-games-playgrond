import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface RallyRunnerSettings {
  /** When true, the obstacle course is generated from a fixed seed, so every
   * run (and restart) faces the identical layout — fair for score comparison.
   * When false, each run is freshly random. */
  fixedCourse: boolean
  setFixedCourse(b: boolean): void
}

export const useRallyRunnerStore = create<RallyRunnerSettings>()(
  persist(
    (set) => ({
      fixedCourse: false,
      setFixedCourse: (b) => set({ fixedCourse: b }),
    }),
    {
      name: 'arcade-rally-runner',
      // See src/store/user.ts for the full rationale on explicit storage.
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
