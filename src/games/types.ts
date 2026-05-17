import type { Application } from 'pixi.js'
import type { UiTheme } from '../engine/ui-theme'

/** A game ships an object of this shape and the portal calls its `start`. */
export interface GameModule {
  start(app: Application, ctx: GameContext, signal: AbortSignal): Promise<GameHandle>
  /** Optional typography theme for engine-level UI (settings modal, dev
   * overlays). When omitted the engine default is used. */
  uiTheme?: UiTheme
}

/** Session-only values + game → portal callbacks. Persistent settings live
 * in `useSettingsStore`; high scores live in `useUserStore`. See the
 * architecture docs (`plugin-interface.md`) for the full rationale. */
export interface GameContext {
  config: {
    /** Fresh RNG seed each session (or restored from a save). */
    seed: number
  }
  onScoreChange(score: number): void
  onGameOver(result: GameResult): void
}

export interface GameResult {
  score: number
  /** Only meaningful for stage-based games; endless games omit it. */
  cleared?: boolean
}

export interface GameHandle {
  /** Cleanup. Runs to completion; not abortable. */
  destroy(): void
}
