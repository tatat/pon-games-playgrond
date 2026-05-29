export const GAME_ID = 'scroll-breakout'

/** The avatar is a Sticker-Drift-style sticker sprite with a simple circular
 * hit area (no kamaboko hull). Centre sits near the bottom of the screen. */
export const PADDLE_CENTER_Y = 720 - 52
/** Radius of the circular collider. */
export const PADDLE_RADIUS = 42
/** Display height of the sticker sprite; width follows its aspect ratio. */
export const PADDLE_DISPLAY_H = 92
/** Which sticker the avatar wears and the asset size to load for it. */
export const PADDLE_STICKER = 'd1'
export const PADDLE_STICKER_SIZE = 96
/** Left clamp in world space: the paddle's centre can't go before this x. */
export const PADDLE_MIN_X = PADDLE_RADIUS
export const PADDLE_SPEED = 420
export const PADDLE_FAST_MULT = 1.75
/** Fraction of the paddle's horizontal velocity added to the ball's bounce as
 * "english" — moving the paddle into the ball steers (and speeds) the bounce. */
export const PADDLE_BOUNCE_INFLUENCE = 0.5
/** Initial paddle world x (~1/4 across the 1280-wide design); sits at the left
 * edge of the camera dead-zone. */
export const PADDLE_START_X = 320

export const BALL_RADIUS = 9
export const BALL_LAUNCH_SPEED = 320
export const BALL_DEATH_Y = 720 + BALL_RADIUS
/** Ball rests just above the top of the circular paddle. */
export const BALL_START_Y = PADDLE_CENTER_Y - PADDLE_RADIUS - BALL_RADIUS - 4
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

export const WALL_THICKNESS = 50

export const STARTING_LIVES = 1

/** Camera follows the paddle (the avatar). While the paddle stays inside this
 * screen-space dead-zone the camera holds still; pushing past an edge scrolls
 * the world that way. Free two-way, but never before world x = 0. */
export const CAMERA_FOLLOW_LEFT = 320
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
