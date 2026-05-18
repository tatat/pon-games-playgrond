import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type MusicScale = 'chromatic' | 'major' | 'minor' | 'pentatonic' | 'blues'
/** `0` = C, `1` = C#, …, `11` = B. */
export type BaseKey = number

export interface BreakoutCloneSettings {
  scale: MusicScale
  baseKey: BaseKey
  setScale(s: MusicScale): void
  setBaseKey(k: BaseKey): void
}

const clampKey = (k: number): BaseKey => ((Math.floor(k) % 12) + 12) % 12

export const useBreakoutCloneStore = create<BreakoutCloneSettings>()(
  persist(
    (set) => ({
      scale: 'major',
      baseKey: 0,
      setScale: (s) => set({ scale: s }),
      setBaseKey: (k) => set({ baseKey: clampKey(k) }),
    }),
    {
      name: 'arcade-breakout-clone',
      // See src/store/user.ts for the full rationale on explicit storage.
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
