import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Locale = 'en' | 'ja'
export type GraphicsQuality = 'low' | 'medium' | 'high'
export type TouchControlsMode = 'auto' | 'on' | 'off'

export interface SettingsState {
  bgmVolume: number
  sfxVolume: number
  locale: Locale
  graphicsQuality: GraphicsQuality
  reducedMotion: boolean
  /** 'auto' resolves to matchMedia('(pointer: coarse)') at render time. */
  touchControls: TouchControlsMode

  setBgmVolume(v: number): void
  setSfxVolume(v: number): void
  setLocale(l: Locale): void
  setGraphicsQuality(q: GraphicsQuality): void
  setReducedMotion(b: boolean): void
  setTouchControls(m: TouchControlsMode): void
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      bgmVolume: 0.7,
      sfxVolume: 0.7,
      locale: 'ja',
      graphicsQuality: 'high',
      reducedMotion: false,
      touchControls: 'auto',

      setBgmVolume: (v) => set({ bgmVolume: clamp01(v) }),
      setSfxVolume: (v) => set({ sfxVolume: clamp01(v) }),
      setLocale: (l) => set({ locale: l }),
      setGraphicsQuality: (q) => set({ graphicsQuality: q }),
      setReducedMotion: (b) => set({ reducedMotion: b }),
      setTouchControls: (m) => set({ touchControls: m }),
    }),
    {
      name: 'arcade-settings',
      // Explicit storage so the middleware attaches in non-browser contexts
      // (Vitest / SSR) where `window` is undefined.
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
