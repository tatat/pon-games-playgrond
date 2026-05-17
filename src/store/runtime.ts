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
  /** Active typography theme. Set by `GameMount` from `GameModule.uiTheme`
   * before the game's `start()` runs, so engine UI built during `start()`
   * (settings modal, FPS counter) picks up the right fonts. */
  uiTheme: UiTheme
  setUiTheme(t: UiTheme): void
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  gamePaused: false,
  setGamePaused: (b) => set({ gamePaused: b }),
  uiTheme: defaultUiTheme,
  setUiTheme: (t) => set({ uiTheme: t }),
}))
