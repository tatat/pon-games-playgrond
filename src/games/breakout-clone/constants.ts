/** Game-specific tuning numbers. Engine-wide constants (DESIGN_W, DESIGN_H,
 * MAX_DT_SEC, ...) live in `src/engine/constants.ts`. */

export const GAME_ID = 'breakout-clone'

/** Paddle anchored just inside the floor; ball reset position is slightly
 * above. Values are logical px referencing the 1280×720 viewport. */
export const PADDLE_GROUND_Y = 720 - 55
export const BALL_START_Y = PADDLE_GROUND_Y - 35
export const PADDLE_BOUNDS_LEFT = 50
export const PADDLE_BOUNDS_RIGHT = 1280 - 50
export const BALL_DEATH_Y = 720 - 25

/** Brick spawn area sits below the HUD and above the paddle. */
export const BRICK_AREA_MARGIN = 50
export const BRICK_AREA_HEIGHT = 280

/** Brick image variants. Loaded as `<name>-<size>@2x.png`. */
export const BRICK_NAMES = ['d1', 'd2', 'r1', 'r2', 't1', 't2'] as const
export const BRICK_SIZES = [64, 96, 128, 160, 192, 224, 256, 300] as const

/** Score awarded per brick by base size (the displayed brick is ~half this
 * thanks to @2x assets). */
export const SCORE_BY_SIZE: Record<number, number> = {
  64: 10,
  96: 15,
  128: 25,
  160: 40,
  192: 60,
  224: 90,
  256: 130,
}
export const DEFAULT_SCORE = 10

/** Player jump physics (paddle hops vertically). px/s and px/s². */
export const JUMP_VELOCITY = -225
export const JUMP_GRAVITY = 600

export const STARTING_LIVES = 3
