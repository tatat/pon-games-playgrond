import { STARTING_LIVES } from './constants'

/** Pure game-state holder for BreakoutScene. No Pixi / engine deps so it can
 * be unit-tested directly. Mirrors the original Phaser `BreakoutState` but
 * trimmed: `isPaused` is dropped in favour of the engine-level
 * `useRuntimeStore.gamePaused`. */
export class BreakoutState {
  score = 0
  lives = STARTING_LIVES

  /** Pause-aware elapsed-time accumulator. The scene advances this each
   * unpaused frame from `dt`, so we don't need to track wall-clock. */
  elapsedMs = 0

  /** Lifecycle flags. */
  isGameStarted = false
  isGameOver = false

  /** Paddle jump state. */
  isJumping = false

  addScore(points: number): void {
    this.score += points
  }

  loseLife(): void {
    this.lives--
  }

  /** Should `update` advance gameplay? Engine pause is handled separately. */
  isActive(): boolean {
    return this.isGameStarted && !this.isGameOver
  }

  reset(): void {
    this.score = 0
    this.lives = STARTING_LIVES
    this.elapsedMs = 0
    this.isGameStarted = false
    this.isGameOver = false
    this.isJumping = false
  }

  /** "MM:SS.s" formatted readout for the HUD. */
  formattedElapsed(): string {
    return `${(this.elapsedMs / 1000).toFixed(1)}s`
  }
}
