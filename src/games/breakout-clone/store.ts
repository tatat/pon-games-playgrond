import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type MusicScale = 'chromatic' | 'major' | 'minor' | 'pentatonic' | 'blues'
/** `0` = C, `1` = C#, …, `11` = B. */
export type BaseKey = number

export interface BreakoutCloneSettings {
  scale: MusicScale
  baseKey: BaseKey
  /** When true, the score starts at 900 so the boss threshold (1000) is
   * reachable in a few hits — a convenience for testing the boss flow
   * without grinding bricks. */
  debugMode: boolean
  setScale(s: MusicScale): void
  setBaseKey(k: BaseKey): void
  setDebugMode(b: boolean): void
}

const clampKey = (k: number): BaseKey => ((Math.floor(k) % 12) + 12) % 12

export const useBreakoutCloneStore = create<BreakoutCloneSettings>()(
  persist(
    (set) => ({
      scale: 'major',
      baseKey: 0,
      debugMode: false,
      setScale: (s) => set({ scale: s }),
      setBaseKey: (k) => set({ baseKey: clampKey(k) }),
      setDebugMode: (b) => set({ debugMode: b }),
    }),
    {
      name: 'arcade-breakout-clone',
      // See src/store/user.ts for the full rationale on explicit storage.
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
