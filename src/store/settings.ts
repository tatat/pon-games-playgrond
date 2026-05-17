import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Locale = 'en' | 'ja'
export type GraphicsQuality = 'low' | 'medium' | 'high'
export type VirtualPadMode = 'auto' | 'on' | 'off'

export interface SettingsState {
  /** Master gain applied on top of `bgmVolume` / `sfxVolume`. */
  masterVolume: number
  bgmVolume: number
  sfxVolume: number
  /** Show the dev FPS counter. Dev-only — `attachFpsCounter` is gated behind
   * `import.meta.env.DEV`, this flag toggles visibility within that gate. */
  showFps: boolean
  /** Render-loop frame-rate cap. `0` = unlimited (Pixi `Ticker.maxFPS = 0`
   * is the documented "no cap" value). */
  maxFps: number
  locale: Locale
  graphicsQuality: GraphicsQuality
  reducedMotion: boolean
  /** Game-side virtual pad visibility. 'auto' resolves to
   * `matchMedia('(pointer: coarse)')` at render time. */
  virtualPad: VirtualPadMode

  setMasterVolume(v: number): void
  setBgmVolume(v: number): void
  setSfxVolume(v: number): void
  setShowFps(b: boolean): void
  setMaxFps(v: number): void
  setLocale(l: Locale): void
  setGraphicsQuality(q: GraphicsQuality): void
  setReducedMotion(b: boolean): void
  setVirtualPad(m: VirtualPadMode): void
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      masterVolume: 1,
      bgmVolume: 0.7,
      sfxVolume: 0.7,
      showFps: true,
      maxFps: 0,
      locale: 'ja',
      graphicsQuality: 'high',
      reducedMotion: false,
      virtualPad: 'auto',

      setMasterVolume: (v) => set({ masterVolume: clamp01(v) }),
      setBgmVolume: (v) => set({ bgmVolume: clamp01(v) }),
      setSfxVolume: (v) => set({ sfxVolume: clamp01(v) }),
      setShowFps: (b) => set({ showFps: b }),
      setMaxFps: (v) => set({ maxFps: Math.max(0, Math.floor(v)) }),
      setLocale: (l) => set({ locale: l }),
      setGraphicsQuality: (q) => set({ graphicsQuality: q }),
      setReducedMotion: (b) => set({ reducedMotion: b }),
      setVirtualPad: (m) => set({ virtualPad: m }),
    }),
    {
      name: 'arcade-settings',
      // Always pass explicit storage — see src/store/user.ts for the full
      // rationale (zustand v5 silently drops the persist namespace if the
      // default `window.localStorage` factory throws).
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
)
