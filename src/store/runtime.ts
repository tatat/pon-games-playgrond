import { create } from 'zustand'
import { defaultUiTheme, type UiTheme } from '../engine/ui-theme'

/** Ephemeral, in-memory runtime state that should *not* persist across
 * reloads — pause flags, the currently-active game's UI theme, anything
 * tied to the current session. Persisted user preferences belong in
 * `useSettingsStore`. */
export interface RuntimeState {
  /** When true, `SceneManager` skips calling the current scene's `onUpdate`.
   * The ticker keeps running so UI overlays (settings modal, FPS counter)
   * stay responsive. */
  gamePaused: boolean
  setGamePaused(b: boolean): void
  /** Flip `gamePaused`. Used by the on-screen Option button so a second tap
   * closes the pause overlay (matching the `,` shortcut). */
  toggleGamePaused(): void
  /** Active typography theme. Set by `GameMount` from `GameModule.uiTheme`
   * before the game's `start()` runs, so engine UI built during `start()`
   * (settings modal, FPS counter) picks up the right fonts. */
  uiTheme: UiTheme
  setUiTheme(t: UiTheme): void
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  gamePaused: false,
  setGamePaused: (b) => set({ gamePaused: b }),
  toggleGamePaused: () => set((s) => ({ gamePaused: !s.gamePaused })),
  uiTheme: defaultUiTheme,
  setUiTheme: (t) => set({ uiTheme: t }),
}))
