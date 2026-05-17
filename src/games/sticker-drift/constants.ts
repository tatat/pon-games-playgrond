/** Game-specific tuning numbers. Engine-wide constants (DESIGN_W, FIXED_DT, ...)
 * live in src/engine/constants.ts. */

export const GAME_ID = 'sticker-drift'

export const STICKERS = ['d1', 'd2', 'r1', 'r2', 't1', 't2'] as const
export const STICKER_SIZES = [64, 96] as const

/** Player movement. Acceleration values are px/s² (Rapier world treats
 * pixels as meters; see scene.ts). */
export const GRAVITY = 500
export const FLOAT_ACCELERATION = 1200
export const PLAYER_MAX_VY = 800
export const PLAYER_START_X = 200

/** Player visual: d1-64@2x.png renders at ~47.5×64 in logical pixels
 * (Pixi's @2x auto-resolution + scale 1.0 in player.ts). Collision radius is
 * 35% of the shorter side, matching the original Phaser source's play-feel. */
export const PLAYER_RADIUS = 47.5 * 0.35

/** Obstacles. */
export const OBSTACLE_SPAWN_RATE_MS = 1500
export const OBSTACLE_SPEED_MIN = 200
export const OBSTACLE_SPEED_MAX = 400
export const HOMING_SPEED_MIN = 100
export const HOMING_SPEED_MAX = 200
export const HOMING_PROBABILITY = 0.5
export const OBSTACLE_SIZE_MIN = 48
export const OBSTACLE_SIZE_MAX = 96
export const OBSTACLE_RADIUS_RATIO = 0.35

/** Visual chrome. */
export const WALL_HEIGHT = 30
export const WALL_STRIPE_WIDTH = 40
export const STAR_COUNT = 100
