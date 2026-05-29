import { DESIGN_W } from '../../engine/constants'

export const GAME_ID = 'scroll-breakout'

/** Leftmost world x the camera may scroll to — two screens behind the origin,
 * so the player can back up into open space well left of the start. */
export const WORLD_MIN_X = -DESIGN_W * 2

/** The avatar is a Sticker-Drift-style sticker sprite with a simple circular
 * hit area (no kamaboko hull). Centre is placed so the sprite's bottom (centre
 * + PADDLE_DISPLAY_H/2 = +46) lands on the middle of the floor band (~y 710). */
export const PADDLE_CENTER_Y = 720 - 56
/** Radius of the circular collider. */
export const PADDLE_RADIUS = 42
/** Max lean angle (deg) when moving; the sprite tilts toward travel direction
 * while the circular collider is unaffected. Dashing leans further. */
export const PADDLE_MAX_TILT_DEG = 13
export const PADDLE_MAX_TILT_FAST_DEG = 26
/** Per-second easing factor for the lean toward its target. */
export const PADDLE_TILT_LERP = 12
/** Display height of the sticker sprite; width follows its aspect ratio. */
export const PADDLE_DISPLAY_H = 92
/** Which sticker the avatar wears and the asset size to load for it. */
export const PADDLE_STICKER = 'd1'
export const PADDLE_STICKER_SIZE = 96
/** Left clamp in world space: the paddle's centre can't go past the world-left
 * edge (kept a radius in so the avatar stays fully on screen). */
export const PADDLE_MIN_X = WORLD_MIN_X + PADDLE_RADIUS
export const PADDLE_SPEED = 420
export const PADDLE_FAST_MULT = 1.75
/** SPACE makes the avatar hop: initial upward velocity (px/s) and the gravity
 * (px/s²) that pulls it back to the ground line. The circular collider rides
 * along, so a jump lifts the hit area too. */
export const PADDLE_JUMP_SPEED = 720
export const PADDLE_JUMP_GRAVITY = 2400
/** Fraction of the paddle's horizontal velocity added to the ball's bounce as
 * "english" — moving the paddle into the ball steers (and speeds) the bounce. */
export const PADDLE_BOUNCE_INFLUENCE = 0.5
/** Initial paddle world x (~1/8 across the 1280-wide design); sits at the left
 * edge of the camera dead-zone. */
export const PADDLE_START_X = 160

export const BALL_RADIUS = 9
export const BALL_LAUNCH_SPEED = 320
export const BALL_DEATH_Y = 720 + BALL_RADIUS
/** Ball rests just above the top of the circular paddle. */
export const BALL_START_Y = PADDLE_CENTER_Y - PADDLE_RADIUS - BALL_RADIUS - 14
export const BALL_RESET_DELAY_MS = 1200

/** Aiming before launch: left/right rotate the launch angle (degrees measured
 * from the horizontal, 90 = straight up). The ball fires along it on launch. */
export const AIM_DEFAULT_DEG = 60
export const AIM_MIN_DEG = 20
export const AIM_MAX_DEG = 160
/** Rotation speed of the aim while a direction key is held (deg/sec). */
export const AIM_ROTATE_SPEED = 90
/** Length of the aim guide line drawn from the ball. */
export const AIM_LINE_LEN = 72
/** The aim guide gently pulses its opacity (slow blink) between these bounds. */
export const AIM_PULSE_PERIOD_SEC = 1.3
export const AIM_ALPHA_MIN = 0.2
export const AIM_ALPHA_MAX = 0.9

export const WALL_THICKNESS = 50

export const STARTING_LIVES = 1

/** Camera follows the paddle (the avatar). While the paddle stays inside this
 * screen-space dead-zone the camera holds still; pushing past an edge scrolls
 * the world that way. Free two-way, but never before world x = 0. */
export const CAMERA_FOLLOW_LEFT = 160
export const CAMERA_FOLLOW_RIGHT = 700

/** Max block height for a row; width is computed per-texture from its natural aspect ratio. */
export const BLOCK_H = 80
export const BLOCK_GAP_Y = 10

/** World-space gap between successive block columns. */
export const BLOCK_COLUMN_GAP = 240
/** Generate columns until the frontier is this far past the right view edge. */
export const BLOCK_SPAWN_AHEAD = 400
/** Destroy blocks this far behind the left view edge. */
export const BLOCK_CULL_BEHIND = 600

/** Base sizes used to look up sticker assets (same @2x naming as breakout-clone). */
export const SCROLL_BRICK_SIZES = [64, 96, 128] as const

/** Vertical range where blocks are spawned. */
export const BLOCK_AREA_TOP = 64
export const BLOCK_AREA_BOTTOM = 586

/** Score per world pixel advanced (distance travelled). */
export const DISTANCE_SCORE_FACTOR = 0.1

/** Sticker asset names shared with breakout-clone. */
export const BRICK_NAMES = ['d1', 'd2', 'r1', 'r2', 't1', 't2'] as const

/** Parallax starfield that sells the sense of forward motion (à la sticker-drift). */
export const STAR_COUNT = 110

/** Ceiling rail: a solid band along the top edge sliced into ">"-shaped slabs
 * (chevron seams) that interlock. The two slab colours swap on a timer so the
 * chevrons appear to flow right — a "keep moving →" cue without moving shapes. */
export const CEILING_Y = 0
export const CEILING_BAND_H = 21
/** Horizontal repeat of one slab. */
export const CEILING_TILE_W = 60
/** How far the ">" point juts past the slab's base (the chevron depth). */
export const CEILING_CHEVRON_DEPTH = 12
/** How often the two colours swap (ABAB ⇄ BABA). Slow and gentle. */
export const CEILING_PULSE_MS = 1000
/** The two alternating slab colours — kept low-contrast so the swap reads as a
 * soft shift rather than a flicker. */
export const CEILING_COLORS = [0xd9c060, 0x9c8538] as const
